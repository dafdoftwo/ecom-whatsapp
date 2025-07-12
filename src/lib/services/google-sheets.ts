import { google } from 'googleapis';
import { ConfigService } from './config';
import { PhoneProcessor } from './phone-processor';
import { PhoneRecoveryService } from './phone-recovery';
import { DeepCellAnalyzer } from './deep-cell-analyzer';
import { FormulaPhoneExtractor } from './formula-phone-extractor';
import type { SheetRow } from '../types/config';

export class GoogleSheetsService {
  private static async getAuthenticatedClient() {
    const config = await ConfigService.getGoogleConfig();
    
    if (!config.credentials || !config.spreadsheetUrl) {
      throw new Error('Google configuration not found. Please configure Google Sheets access.');
    }

    const auth = new google.auth.GoogleAuth({
      credentials: config.credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    return { auth, spreadsheetUrl: config.spreadsheetUrl };
  }

  private static extractSpreadsheetId(url: string): string {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      throw new Error('Invalid Google Sheets URL format');
    }
    return match[1];
  }

  /**
   * قراءة بيانات الشيت الجديد (16 عمود)
   */
  static async getSheetData(): Promise<SheetRow[]> {
    try {
      const { auth, spreadsheetUrl } = await this.getAuthenticatedClient();
      const sheets = google.sheets({ version: 'v4', auth });
      const spreadsheetId = this.extractSpreadsheetId(spreadsheetUrl);

      // قراءة البيانات من A إلى P (16 عمود)
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'A:P',
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        return [];
      }

      console.log(`Found ${rows.length} rows in sheet`);

      // تخطي الصف الأول (العناوين) ومعالجة البيانات
      const dataRows = rows.slice(1);
      const processedRows = await Promise.all(
        dataRows.map((row, index) => this.processSheetRowFinal(row, index + 2)) // +2 لأننا نتخطى العناوين والفهرسة تبدأ من 1
      );
      return processedRows.filter(row => row !== null) as SheetRow[];
    } catch (error) {
      console.error('Error getting sheet data:', error);
      throw new Error('Failed to fetch data from Google Sheets');
    }
  }

  /**
   * معالجة صف واحد من الشيت - إصدار محسّن
   */
  private static async processSheetRowAdvanced(row: (string | undefined)[], rowIndex: number): Promise<SheetRow | null> {
    // تأكد من وجود البيانات الأساسية - لا تتجاهل أي طلب
    const name = (row[1] || '').toString().trim(); // B: الاسم
    const phoneRaw = (row[2] || '').toString().trim(); // C: رقم الهاتف
    const whatsappRaw = (row[3] || '').toString().trim(); // D: رقم الواتس
    const orderStatus = (row[11] || '').toString().trim(); // L: الحالة

    // استخدم اسم افتراضي إذا لم يكن موجود
    const customerName = name || `عميل غير محدد - صف ${rowIndex}`;

    // معالجة أرقام الهاتف مع النظام المتقدم
    const fixedPhoneRaw = await this.fixErrorInPhoneNumberAdvanced(phoneRaw, whatsappRaw, rowIndex);
    const fixedWhatsappRaw = await this.fixErrorInPhoneNumberAdvanced(whatsappRaw, phoneRaw, rowIndex);
    
    console.log(`🔍 ADVANCED Processing row ${rowIndex}: ${customerName}, Original Phone: "${phoneRaw}" -> Fixed: "${fixedPhoneRaw}", Original WhatsApp: "${whatsappRaw}" -> Fixed: "${fixedWhatsappRaw}"`);

    const phoneProcessing = PhoneProcessor.processTwoNumbers(fixedPhoneRaw, fixedWhatsappRaw);
    
    // إنشاء معرف طلب حتى لو لم تكن الأرقام صالحة
    const orderDate = (row[0] || '').toString().trim(); // A: تاريخ الطلب
    let orderId: string;
    let processedPhone: string;
    let validPhone: boolean;

    if (phoneProcessing.isValid && phoneProcessing.preferredNumber) {
      orderId = PhoneProcessor.generateOrderId(customerName, phoneProcessing.preferredNumber, orderDate);
      processedPhone = phoneProcessing.preferredNumber;
      validPhone = true;
    } else {
      // إنشاء معرف طلب بديل حتى للأرقام غير الصالحة
      orderId = `invalid_${rowIndex}_${customerName.substring(0, 3)}_${Date.now()}`;
      processedPhone = fixedPhoneRaw || fixedWhatsappRaw || 'رقم غير صالح';
      validPhone = false;
    }

    // بناء كائن الصف - دائماً أنشئ الطلب ولا تتجاهله أبداً
    const sheetRow: SheetRow = {
      orderDate: orderDate,
      name: customerName,
      phone: phoneRaw, // الرقم الأصلي (قد يحتوي على #ERROR!)
      whatsappNumber: whatsappRaw, // الرقم الأصلي (قد يحتوي على #ERROR!)
      governorate: (row[4] || '').toString().trim(), // E: المحافظة
      area: (row[5] || '').toString().trim(), // F: المنطقة
      address: (row[6] || '').toString().trim(), // G: العنوان
      orderDetails: (row[7] || '').toString().trim(), // H: تفاصيل الطلب
      quantity: (row[8] || '').toString().trim(), // I: الكمية
      source: (row[9] || '').toString().trim(), // J: توتال السعر شامل الشحن
      totalPrice: (row[9] || '').toString().trim(), // J: توتال السعر شامل الشحن (نفس المصدر)
      productName: (row[10] || '').toString().trim(), // K: اسم المنتج
      orderStatus: orderStatus, // L: الحالة
      notes: (row[12] || '').toString().trim(), // M: ملاحظات
      sourceChannel: (row[13] || '').toString().trim(), // N: المصدر
      whatsappStatus: (row[14] || '').toString().trim(), // O: ارسال واتس اب
      
      // الحقول المحسوبة
      orderId: orderId,
      rowIndex: rowIndex,
      processedPhone: processedPhone,
      validPhone: validPhone,
      lastMessageSent: '',
      lastUpdated: new Date().toISOString(),
    };

    const statusLog = validPhone 
      ? `✅ Valid phone: ${processedPhone}` 
      : `⚠️ Invalid phone but order preserved: "${phoneRaw}" | "${whatsappRaw}"`;
    
    console.log(`📝 ADVANCED Processed row ${rowIndex}: ${customerName} - ${statusLog} - Status: "${orderStatus}"`);
    return sheetRow; // دائماً إرجاع الطلب، لا تجاهل أبداً
  }

  /**
   * معالجة خاصة لأخطاء #ERROR! في أرقام الهاتف - إصدار محسّن
   */
  private static async fixErrorInPhoneNumberAdvanced(phoneValue: string, whatsappValue: string, rowIndex: number): Promise<string> {
    if (!phoneValue || typeof phoneValue !== 'string') {
      return '';
    }

    // التعامل مع #ERROR! باستخدام النظام المتقدم
    if (phoneValue.includes('#ERROR!') || whatsappValue?.includes('#ERROR!')) {
      console.log(`🔧 ADVANCED FIX: Attempting recovery for row ${rowIndex} - Phone: "${phoneValue}", WhatsApp: "${whatsappValue}"`);
      
      try {
        // استخدام نظام الاستخراج المتقدم
        const mockPhoneCol = {
          basic: phoneValue,
          formatted: phoneValue,
          formula: phoneValue,
          metadata: null
        };

        const mockWhatsappCol = {
          basic: whatsappValue,
          formatted: whatsappValue,
          formula: whatsappValue,
          metadata: null
        };

        // محاولة استخراج متقدم
        const recoveryMethods = await PhoneRecoveryService['applyRecoveryMethods'](mockPhoneCol, mockWhatsappCol, rowIndex);
        
        if (recoveryMethods.recoveredNumbers.length > 0) {
          const recoveredNumber = recoveryMethods.recoveredNumbers[0];
          console.log(`✅ ADVANCED RECOVERY SUCCESS: Found "${recoveredNumber}" via ${recoveryMethods.method}`);
          return recoveredNumber;
        }

        // إذا فشل الاستخراج المتقدم، جرب الطرق البديلة
        console.log(`🔄 Trying alternative recovery methods...`);
        
        // طريقة 1: محاولة استخراج أرقام خفية
        const hiddenNumbers = this.extractHiddenNumbers(phoneValue, whatsappValue);
        if (hiddenNumbers.length > 0) {
          console.log(`✅ HIDDEN NUMBER FOUND: ${hiddenNumbers[0]}`);
          return hiddenNumbers[0];
        }

        // طريقة 2: إعادة بناء من السياق
        const contextNumber = this.reconstructFromContext(phoneValue, whatsappValue, rowIndex);
        if (contextNumber) {
          console.log(`✅ CONTEXT RECONSTRUCTION: ${contextNumber}`);
          return contextNumber;
        }

        // طريقة 3: استخدام pattern matching متقدم
        const patternNumber = this.advancedPatternMatching(phoneValue, whatsappValue);
        if (patternNumber) {
          console.log(`✅ PATTERN MATCH: ${patternNumber}`);
          return patternNumber;
        }

      } catch (error) {
        console.log(`❌ Advanced recovery failed: ${error}`);
      }
      
      console.log(`❌ All recovery methods failed for row ${rowIndex}`);
      return ''; // إرجاع فارغ ولكن لا تتجاهل الطلب
    }

    // تنظيف عام للرقم
    return phoneValue
      .replace(/[^\d+\s()-]/g, '') // إزالة الأحرف غير المطلوبة
      .replace(/\s+/g, '') // إزالة المسافات
      .trim();
  }

  /**
   * استخراج أرقام مخفية من النص المعطل
   */
  private static extractHiddenNumbers(phoneValue: string, whatsappValue: string): string[] {
    const numbers: string[] = [];
    const combinedText = `${phoneValue} ${whatsappValue}`;

    // البحث عن أرقام مخفية في النص
    const advancedPatterns = [
      /(?:tel|phone|mobile|رقم)[\s:=]*(\+?201\d{9})/gi,
      /(?:tel|phone|mobile|رقم)[\s:=]*(\d{11})/gi,
      /(\+?201\d{9})/g,
      /\b(\d{11})\b/g,
      /(?:^|[^\d])(\d{10,11})(?:[^\d]|$)/g
    ];

    for (const pattern of advancedPatterns) {
      const matches = [...combinedText.matchAll(pattern)];
      matches.forEach(match => {
        const number = match[1] || match[0];
        if (number && number.length >= 10) {
          numbers.push(number.replace(/[^\d]/g, ''));
        }
      });
    }

    return [...new Set(numbers)];
  }

  /**
   * إعادة بناء الرقم من السياق
   */
  private static reconstructFromContext(phoneValue: string, whatsappValue: string, rowIndex: number): string | null {
    // محاولة إعادة بناء رقم مصري من قطع موجودة
    const allText = `${phoneValue} ${whatsappValue}`;
    const digits = allText.replace(/[^\d]/g, '');

    // إذا وجدنا 9-11 رقم، حاول تكوين رقم مصري صالح
    if (digits.length >= 9 && digits.length <= 11) {
      const attempts = [
        digits,                                    // كما هو
        '01' + digits.slice(-9),                   // إضافة بادئة الموبايل المصري
        '201' + digits.slice(-9),                  // إضافة كود الدولة
        digits.length === 10 ? '01' + digits.slice(-9) : digits  // إذا كان 10 أرقام
      ];

      for (const attempt of attempts) {
        if (this.isValidEgyptianNumber(attempt)) {
          return attempt;
        }
      }
    }

    return null;
  }

  /**
   * pattern matching متقدم
   */
  private static advancedPatternMatching(phoneValue: string, whatsappValue: string): string | null {
    const combinedText = `${phoneValue} ${whatsappValue}`;

    // البحث عن أنماط رقمية متقدمة
    const patterns = [
      /(\d{3})[^\d]*(\d{3})[^\d]*(\d{4})/g,     // XXX XXX XXXX format
      /(\d{2})[^\d]*(\d{4})[^\d]*(\d{4})/g,     // XX XXXX XXXX format
      /(\d{4})[^\d]*(\d{3})[^\d]*(\d{4})/g,     // XXXX XXX XXXX format
    ];

    for (const pattern of patterns) {
      const matches = [...combinedText.matchAll(pattern)];
      for (const match of matches) {
        const reconstructed = match.slice(1).join(''); // دمج المجموعات
        if (reconstructed.length >= 10 && this.isValidEgyptianNumber('01' + reconstructed.slice(-9))) {
          return '01' + reconstructed.slice(-9);
        }
      }
    }

    return null;
  }

  /**
   * التحقق من صحة الرقم المصري
   */
  private static isValidEgyptianNumber(number: string): boolean {
    const cleaned = number.replace(/[^\d]/g, '');
    
    // أرقام مصرية صالحة
    if (cleaned.length === 11 && cleaned.startsWith('01')) {
      const prefix = cleaned.substring(0, 3);
      return ['010', '011', '012', '015'].includes(prefix);
    }
    
    if (cleaned.length === 12 && cleaned.startsWith('201')) {
      const prefix = cleaned.substring(0, 4);
      return ['2010', '2011', '2012', '2015'].includes(prefix);
    }

    return false;
  }

  /**
   * تحديث حالة الواتساب في الشيت - معطل للقراءة فقط
   */
  static async updateWhatsAppStatus(rowIndex: number, status: string, lastMessage?: string): Promise<void> {
    // دالة معطلة - النظام في وضع القراءة فقط
    console.log(`🔒 READ-ONLY MODE: Would update row ${rowIndex} with status: ${status}${lastMessage ? `, message: ${lastMessage}` : ''}`);
    return Promise.resolve();
  }

  /**
   * تحديث الحالات الفارغة إلى "جديد" - ميزة خاصة لحل مشكلة التكرار
   */
  static async updateEmptyStatusesToNew(): Promise<{
    success: boolean;
    updatedRows: number;
    details: Array<{ rowIndex: number; customerName: string; oldStatus: string; newStatus: string }>;
    error?: string;
  }> {
    try {
      console.log('🔄 Starting to update empty order statuses to "جديد"...');

      const { auth, spreadsheetUrl } = await this.getAuthenticatedClient();
      const sheets = google.sheets({ version: 'v4', auth });
      const spreadsheetId = this.extractSpreadsheetId(spreadsheetUrl);

      // الحصول على البيانات الحالية
      const currentData = await this.getSheetData();
      const emptyStatusOrders = currentData.filter(row => 
        !row.orderStatus || row.orderStatus.trim() === '' || row.orderStatus.trim() === 'غير محدد'
      );

      if (emptyStatusOrders.length === 0) {
        console.log('✅ No empty status orders found to update');
        return {
          success: true,
          updatedRows: 0,
          details: []
        };
      }

      console.log(`📝 Found ${emptyStatusOrders.length} orders with empty status to update`);

      const updateDetails = [];
      const updateRequests = [];

      for (const order of emptyStatusOrders) {
        if (order.rowIndex) {
          const oldStatus = order.orderStatus || '';
          const newStatus = 'جديد';

          updateDetails.push({
            rowIndex: order.rowIndex,
            customerName: order.name,
            oldStatus,
            newStatus
          });

          // إضافة طلب التحديث إلى المجموعة
          updateRequests.push({
            range: `L${order.rowIndex}`, // Column L is order status (حالة الطلب)
            values: [[newStatus]]
          });

          console.log(`📋 Prepared update for row ${order.rowIndex}: "${oldStatus}" → "${newStatus}" (${order.name})`);
        }
      }

      // تنفيذ التحديثات في دفعة واحدة لتحسين الأداء
      if (updateRequests.length > 0) {
        console.log(`🚀 Executing batch update for ${updateRequests.length} rows...`);

        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: {
            valueInputOption: 'RAW',
            data: updateRequests
          }
        });

        console.log(`✅ Successfully updated ${updateRequests.length} empty statuses to "جديد"`);
      }

      return {
        success: true,
        updatedRows: updateRequests.length,
        details: updateDetails
      };

    } catch (error) {
      console.error('❌ Error updating empty statuses:', error);
      return {
        success: false,
        updatedRows: 0,
        details: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * تحديث حالة طلب واحد
   */
  static async updateSingleOrderStatus(rowIndex: number, newStatus: string, customerName?: string): Promise<{
    success: boolean;
    oldStatus?: string;
    newStatus: string;
    error?: string;
  }> {
    try {
      const { auth, spreadsheetUrl } = await this.getAuthenticatedClient();
      const sheets = google.sheets({ version: 'v4', auth });
      const spreadsheetId = this.extractSpreadsheetId(spreadsheetUrl);

      // الحصول على الحالة الحالية أولاً
      const currentStatusResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `L${rowIndex}`
      });

      const oldStatus = currentStatusResponse.data.values?.[0]?.[0] || '';

      // تحديث الحالة الجديدة
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `L${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[newStatus]]
        }
      });

      console.log(`✅ Updated row ${rowIndex}: "${oldStatus}" → "${newStatus}" ${customerName ? `(${customerName})` : ''}`);

      return {
        success: true,
        oldStatus,
        newStatus
      };

    } catch (error) {
      console.error(`❌ Error updating status for row ${rowIndex}:`, error);
      return {
        success: false,
        newStatus,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * البحث عن الطلبات ذات الحالات الفارغة
   */
  static async findEmptyStatusOrders(): Promise<{
    success: boolean;
    emptyOrders: Array<{
      rowIndex: number;
      customerName: string;
      phone: string;
      whatsappNumber: string;
      currentStatus: string;
      validPhone: boolean;
    }>;
    totalCount: number;
    error?: string;
  }> {
    try {
      const data = await this.getSheetData();
      
      const emptyOrders = data
        .filter(row => !row.orderStatus || row.orderStatus.trim() === '' || row.orderStatus.trim() === 'غير محدد')
        .map(row => ({
          rowIndex: row.rowIndex || 0,
          customerName: row.name,
          phone: row.phone || '',
          whatsappNumber: row.whatsappNumber || '',
          currentStatus: row.orderStatus || '',
          validPhone: row.validPhone || false
        }));

      console.log(`🔍 Found ${emptyOrders.length} orders with empty status out of ${data.length} total orders`);

      return {
        success: true,
        emptyOrders,
        totalCount: emptyOrders.length
      };

    } catch (error) {
      console.error('❌ Error finding empty status orders:', error);
      return {
        success: false,
        emptyOrders: [],
        totalCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * إضافة تعليق أو ملاحظة لصف معين - معطل للقراءة فقط
   */
  static async addNote(rowIndex: number, note: string): Promise<void> {
    // دالة معطلة - النظام في وضع القراءة فقط
    console.log(`🔒 READ-ONLY MODE: Would add note to row ${rowIndex}: ${note}`);
    return Promise.resolve();
  }

  /**
   * الحصول على إحصائيات الشيت
   */
  static async getSheetStats(): Promise<{
    totalOrders: number;
    newOrders: number;
    confirmedOrders: number;
    rejectedOrders: number;
    shippedOrders: number;
    pendingOrders: number;
    validPhoneNumbers: number;
    invalidPhoneNumbers: number;
  }> {
    try {
      const data = await this.getSheetData();
      
      const stats = {
        totalOrders: data.length,
        newOrders: data.filter(row => row.orderStatus === 'طلب جديد').length,
        confirmedOrders: data.filter(row => row.orderStatus === 'تم التأكيد').length,
        rejectedOrders: data.filter(row => row.orderStatus === 'مرفوض').length,
        shippedOrders: data.filter(row => row.orderStatus === 'تم الشحن').length,
        pendingOrders: data.filter(row => row.orderStatus === 'لا يرد').length,
        validPhoneNumbers: data.filter(row => row.validPhone).length,
        invalidPhoneNumbers: data.filter(row => !row.validPhone).length,
      };

      return stats;
    } catch (error) {
      console.error('Error getting sheet stats:', error);
      throw new Error('Failed to get sheet statistics');
    }
  }

  /**
   * التحقق من صحة إعدادات Google وتشخيص المشاكل
   */
  static async validateConfiguration(): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
    sheetInfo?: {
      title: string;
      sheetCount: number;
      rowCount: number;
      columnCount: number;
    };
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const config = await ConfigService.getGoogleConfig();
      
      if (!config.spreadsheetUrl) {
        errors.push('رابط جدول البيانات غير موجود');
      }
      
      if (!config.credentials || Object.keys(config.credentials).length === 0) {
        errors.push('مفاتيح الوصول لـ Google غير موجودة');
      }

      if (errors.length > 0) {
        return { isValid: false, errors, warnings };
      }

      // اختبار الاتصال
      const { auth, spreadsheetUrl } = await this.getAuthenticatedClient();
      const sheets = google.sheets({ version: 'v4', auth });
      const spreadsheetId = this.extractSpreadsheetId(spreadsheetUrl);

      // الحصول على معلومات الجدول
      const spreadsheetInfo = await sheets.spreadsheets.get({
        spreadsheetId,
      });

      const sheetInfo = {
        title: spreadsheetInfo.data.properties?.title || 'غير معروف',
        sheetCount: spreadsheetInfo.data.sheets?.length || 0,
        rowCount: spreadsheetInfo.data.sheets?.[0]?.properties?.gridProperties?.rowCount || 0,
        columnCount: spreadsheetInfo.data.sheets?.[0]?.properties?.gridProperties?.columnCount || 0,
      };

      // فحص البيانات
      const testData = await this.getSheetData();
      
      if (testData.length === 0) {
        warnings.push('لا توجد بيانات في الجدول');
      } else {
        const validRows = testData.filter(row => row.validPhone).length;
        const invalidRows = testData.length - validRows;
        
        if (invalidRows > 0) {
          warnings.push(`${invalidRows} صف يحتوي على أرقام هاتف غير صالحة`);
        }
      }

      return {
        isValid: true,
        errors,
        warnings,
        sheetInfo,
      };
    } catch (error) {
      console.error('Error validating Google configuration:', error);
      errors.push(`خطأ في الاتصال: ${error}`);
      return { isValid: false, errors, warnings };
    }
  }

  /**
   * استخراج من الصيغة المعطلة - محسّن
   */
  private static async extractFromBrokenFormulaEnhanced(phoneValue: string, whatsappValue: string, rowIndex: number): Promise<string | null> {
    try {
      const config = await ConfigService.getGoogleConfig();
      const auth = new google.auth.GoogleAuth({
        credentials: config.credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const sheets = google.sheets({ version: 'v4', auth });
      const spreadsheetId = config.spreadsheetUrl!.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)![1];

      // الحصول على الصيغة الأصلية
      const formulaData = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `C${rowIndex}:D${rowIndex}`,
        valueRenderOption: 'FORMULA'
      });

      const formulas = formulaData.data.values?.[0] || [];
      
      for (const formula of formulas) {
        if (formula && typeof formula === 'string') {
          console.log(`🔍 ENHANCED FORMULA ANALYSIS: ${formula}`);
          
          // استخدام المستخرج المتخصص الجديد
          const extractedPhone = FormulaPhoneExtractor.extractPhoneFromFormula(formula);
          if (extractedPhone) {
            console.log(`📱 FORMULA EXTRACTION SUCCESS: ${extractedPhone}`);
            return extractedPhone;
          }

          // محاولة الاستخراج القوي كبديل
          const forceExtracted = FormulaPhoneExtractor.forceExtractPhone(formula);
          if (forceExtracted) {
            console.log(`📱 FORCE EXTRACTION SUCCESS: ${forceExtracted}`);
            return forceExtracted;
          }

          // البحث عن مراجع خلايا في الصيغة
          const cellRefs = formula.match(/[A-Z]+\d+/g);
          if (cellRefs) {
            for (const ref of cellRefs) {
              const refData = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: ref,
                valueRenderOption: 'FORMATTED_VALUE'
              });

              const refValue = refData.data.values?.[0]?.[0];
              if (refValue && typeof refValue === 'string') {
                const refExtracted = FormulaPhoneExtractor.forceExtractPhone(refValue);
                if (refExtracted) {
                  console.log(`📱 REFERENCED CELL SUCCESS: ${refExtracted} from ${ref}`);
                  return refExtracted;
                }
              }
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.log(`❌ Enhanced formula extraction failed: ${error}`);
      return null;
    }
  }

  /**
   * معالجة خاصة لأخطاء #ERROR! في أرقام الهاتف - إصدار نهائي
   */
  private static async fixErrorInPhoneNumberFinal(phoneValue: string, whatsappValue: string, rowIndex: number, customerName: string): Promise<string> {
    if (!phoneValue || typeof phoneValue !== 'string') {
      return '';
    }

    // التعامل مع #ERROR! باستخدام جميع الطرق المتاحة
    if (phoneValue.includes('#ERROR!') || whatsappValue?.includes('#ERROR!')) {
      console.log(`🔧 FINAL FIX: Ultimate recovery attempt for row ${rowIndex} (${customerName}) - Phone: "${phoneValue}", WhatsApp: "${whatsappValue}"`);
      
      try {
        // المرحلة 1: الاستخراج المتخصص من الصيغة
        const formulaNumber = await this.extractFromBrokenFormulaEnhanced(phoneValue, whatsappValue, rowIndex);
        if (formulaNumber) {
          console.log(`✅ FORMULA EXTRACTION FINAL SUCCESS: ${formulaNumber}`);
          return formulaNumber;
        }

        // المرحلة 2: المحلل العميق
        const cellAnalysis = await DeepCellAnalyzer.analyzeProblemCells();
        
        if (cellAnalysis.success) {
          const relevantAnalysis = cellAnalysis.cellAnalysis.find(cell => cell.rowIndex === rowIndex);
          
          if (relevantAnalysis && relevantAnalysis.potentialSolutions.length > 0) {
            for (const solution of relevantAnalysis.potentialSolutions) {
              console.log(`🔍 Analyzing solution: ${solution}`);
              
              // استخراج الرقم من الحل
              if (solution.startsWith('CONTEXT_PHONE:')) {
                const extractedPhone = solution.replace('CONTEXT_PHONE:', '').trim();
                if (this.isValidEgyptianNumber(extractedPhone)) {
                  console.log(`✅ CONTEXT SOLUTION FOUND: ${extractedPhone}`);
                  return extractedPhone;
                }
              }
              
              if (solution.startsWith('SIMILAR_CUSTOMER:')) {
                const extractedPhone = solution.replace('SIMILAR_CUSTOMER:', '').trim();
                if (this.isValidEgyptianNumber(extractedPhone)) {
                  console.log(`✅ SIMILAR CUSTOMER SOLUTION: ${extractedPhone}`);
                  return extractedPhone;
                }
              }
            }
          }
        }

        // المرحلة 3: التحليل السياقي المتقدم
        const contextualNumber = await this.performContextualAnalysis(phoneValue, whatsappValue, customerName, rowIndex);
        if (contextualNumber) {
          console.log(`✅ CONTEXTUAL ANALYSIS SUCCESS: ${contextualNumber}`);
          return contextualNumber;
        }

        // المرحلة 4: البحث عن أرقام مخفية في البيانات الكاملة
        const hiddenNumber = await this.searchForHiddenNumbers(customerName, rowIndex);
        if (hiddenNumber) {
          console.log(`✅ HIDDEN NUMBER FOUND: ${hiddenNumber}`);
          return hiddenNumber;
        }

        // المرحلة 5: الاستخراج القوي من النص المعطل مباشرة
        const forceExtracted = FormulaPhoneExtractor.forceExtractPhone(phoneValue);
        if (forceExtracted) {
          console.log(`✅ DIRECT FORCE EXTRACTION: ${forceExtracted}`);
          return forceExtracted;
        }

      } catch (error) {
        console.log(`❌ Final recovery failed: ${error}`);
      }
      
      console.log(`❌ All FINAL recovery methods failed for row ${rowIndex} (${customerName})`);
      return ''; // إرجاع فارغ ولكن لا تتجاهل الطلب
    }

    // تنظيف عام للرقم
    return phoneValue
      .replace(/[^\d+\s()-]/g, '') // إزالة الأحرف غير المطلوبة
      .replace(/\s+/g, '') // إزالة المسافات
      .trim();
  }

  /**
   * معالجة صف واحد من الشيت - إصدار نهائي
   */
  private static async processSheetRowFinal(row: (string | undefined)[], rowIndex: number): Promise<SheetRow | null> {
    // تأكد من وجود البيانات الأساسية - لا تتجاهل أي طلب
    const name = (row[1] || '').toString().trim(); // B: الاسم
    const phoneRaw = (row[2] || '').toString().trim(); // C: رقم الهاتف
    const whatsappRaw = (row[3] || '').toString().trim(); // D: رقم الواتس
    const orderStatus = (row[11] || '').toString().trim(); // L: الحالة

    // استخدم اسم افتراضي إذا لم يكن موجود
    const customerName = name || `عميل غير محدد - صف ${rowIndex}`;

    // معالجة أرقام الهاتف مع النظام النهائي
    const fixedPhoneRaw = await this.fixErrorInPhoneNumberFinal(phoneRaw, whatsappRaw, rowIndex, customerName);
    const fixedWhatsappRaw = await this.fixErrorInPhoneNumberFinal(whatsappRaw, phoneRaw, rowIndex, customerName);
    
    console.log(`🔍 FINAL Processing row ${rowIndex}: ${customerName}, Original Phone: "${phoneRaw}" -> Fixed: "${fixedPhoneRaw}", Original WhatsApp: "${whatsappRaw}" -> Fixed: "${fixedWhatsappRaw}"`);

    const phoneProcessing = PhoneProcessor.processTwoNumbers(fixedPhoneRaw, fixedWhatsappRaw);
    
    // إنشاء معرف طلب حتى لو لم تكن الأرقام صالحة
    const orderDate = (row[0] || '').toString().trim(); // A: تاريخ الطلب
    let orderId: string;
    let processedPhone: string;
    let validPhone: boolean;

    if (phoneProcessing.isValid && phoneProcessing.preferredNumber) {
      orderId = PhoneProcessor.generateOrderId(customerName, phoneProcessing.preferredNumber, orderDate);
      processedPhone = phoneProcessing.preferredNumber;
      validPhone = true;
    } else {
      // إنشاء معرف طلب بديل حتى للأرقام غير الصالحة
      orderId = `invalid_${rowIndex}_${customerName.substring(0, 3)}_${Date.now()}`;
      processedPhone = fixedPhoneRaw || fixedWhatsappRaw || 'رقم غير صالح';
      validPhone = false;
    }

    // بناء كائن الصف - دائماً أنشئ الطلب ولا تتجاهله أبداً
    const sheetRow: SheetRow = {
      orderDate: orderDate,
      name: customerName,
      phone: phoneRaw, // الرقم الأصلي (قد يحتوي على #ERROR!)
      whatsappNumber: whatsappRaw, // الرقم الأصلي (قد يحتوي على #ERROR!)
      governorate: (row[4] || '').toString().trim(), // E: المحافظة
      area: (row[5] || '').toString().trim(), // F: المنطقة
      address: (row[6] || '').toString().trim(), // G: العنوان
      orderDetails: (row[7] || '').toString().trim(), // H: تفاصيل الطلب
      quantity: (row[8] || '').toString().trim(), // I: الكمية
      source: (row[9] || '').toString().trim(), // J: توتال السعر شامل الشحن
      totalPrice: (row[9] || '').toString().trim(), // J: توتال السعر شامل الشحن (نفس المصدر)
      productName: (row[10] || '').toString().trim(), // K: اسم المنتج
      orderStatus: orderStatus, // L: الحالة
      notes: (row[12] || '').toString().trim(), // M: ملاحظات
      sourceChannel: (row[13] || '').toString().trim(), // N: المصدر
      whatsappStatus: (row[14] || '').toString().trim(), // O: ارسال واتس اب
      
      // الحقول المحسوبة
      orderId: orderId,
      rowIndex: rowIndex,
      processedPhone: processedPhone,
      validPhone: validPhone,
      lastMessageSent: '',
      lastUpdated: new Date().toISOString(),
    };

    const statusLog = validPhone 
      ? `✅ Valid phone: ${processedPhone}` 
      : `⚠️ Invalid phone but order preserved: "${phoneRaw}" | "${whatsappRaw}"`;
    
    console.log(`📝 FINAL Processed row ${rowIndex}: ${customerName} - ${statusLog} - Status: "${orderStatus}"`);
    return sheetRow; // دائماً إرجاع الطلب، لا تجاهل أبداً
  }

  /**
   * تحليل سياقي متقدم
   */
  private static async performContextualAnalysis(phoneValue: string, whatsappValue: string, customerName: string, rowIndex: number): Promise<string | null> {
    try {
      // البحث في جميع البيانات عن أدلة
      const config = await ConfigService.getGoogleConfig();
      const auth = new google.auth.GoogleAuth({
        credentials: config.credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const sheets = google.sheets({ version: 'v4', auth });
      const spreadsheetId = config.spreadsheetUrl!.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)![1];

      // البحث في الصف الحالي عن أدلة
      const rowData = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `A${rowIndex}:P${rowIndex}`,
        valueRenderOption: 'FORMATTED_VALUE'
      });

      const currentRow = rowData.data.values?.[0] || [];
      
      // فحص جميع الخلايا للبحث عن أرقام
      for (let i = 0; i < currentRow.length; i++) {
        const cellValue = currentRow[i];
        if (cellValue && typeof cellValue === 'string') {
          const phoneMatches = cellValue.match(/(?:\+201|201|01)\d{9}/g);
          if (phoneMatches && phoneMatches.length > 0) {
            const candidate = phoneMatches[0];
            if (this.isValidEgyptianNumber(candidate)) {
              console.log(`📱 Found phone in column ${String.fromCharCode(65 + i)}: ${candidate}`);
              return candidate;
            }
          }

          // البحث عن أي تسلسل أرقام قد يكون رقم هاتف
          const digitSequences = cellValue.match(/\d{10,11}/g);
          if (digitSequences) {
            for (const sequence of digitSequences) {
              if (this.isValidEgyptianNumber(sequence) || this.isValidEgyptianNumber('01' + sequence.slice(-9))) {
                const validNumber = this.isValidEgyptianNumber(sequence) ? sequence : '01' + sequence.slice(-9);
                console.log(`📱 Found valid sequence in column ${String.fromCharCode(65 + i)}: ${validNumber}`);
                return validNumber;
              }
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.log(`❌ Contextual analysis failed: ${error}`);
      return null;
    }
  }

  /**
   * البحث عن أرقام مخفية في البيانات
   */
  private static async searchForHiddenNumbers(customerName: string, rowIndex: number): Promise<string | null> {
    try {
      const config = await ConfigService.getGoogleConfig();
      const auth = new google.auth.GoogleAuth({
        credentials: config.credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const sheets = google.sheets({ version: 'v4', auth });
      const spreadsheetId = config.spreadsheetUrl!.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)![1];

      // البحث في جميع البيانات عن نفس العميل
      const allData = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'A:P',
        valueRenderOption: 'FORMATTED_VALUE'
      });

      const rows = allData.data.values || [];
      
      // البحث عن صفوف بنفس الاسم أو اسم مشابه
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const name = row[1];
        
        if (name && typeof name === 'string' && name.toLowerCase().includes(customerName.toLowerCase().substring(0, 3))) {
          // فحص جميع خلايا هذا الصف
          for (let j = 0; j < row.length; j++) {
            const cellValue = row[j];
            if (cellValue && typeof cellValue === 'string') {
              const phoneMatches = cellValue.match(/(?:\+201|201|01)\d{9}/g);
              if (phoneMatches && phoneMatches.length > 0) {
                const candidate = phoneMatches[0];
                if (this.isValidEgyptianNumber(candidate)) {
                  console.log(`📱 Found phone for similar customer (${name}): ${candidate}`);
                  return candidate;
                }
              }
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.log(`❌ Hidden number search failed: ${error}`);
      return null;
    }
  }
} 