export class PhoneProcessor {
  // مفتاح مصر كأولوية قصوى للسوق المصري
  private static readonly EGYPT_COUNTRY_CODE = '20';
  
  // الدول المدعومة ومفاتيحها (مصر أولاً)
  private static readonly COUNTRY_CODES: Record<string, string> = {
    '20': 'EG',  // مصر - الأولوية الأولى
    '966': 'SA', // السعودية
    '971': 'AE', // الإمارات
    '965': 'KW', // الكويت
    '968': 'OM', // عمان
    '973': 'BH', // البحرين
    '974': 'QA', // قطر
    '962': 'JO', // الأردن
    '961': 'LB', // لبنان
    '963': 'SY', // سوريا
    '964': 'IQ', // العراق
    '967': 'YE', // اليمن
    '212': 'MA', // المغرب
    '213': 'DZ', // الجزائر
    '216': 'TN', // تونس
    '218': 'LY', // ليبيا
    '249': 'SD', // السودان
    '90': 'TR',  // تركيا
  };

  // أنماط الأرقام المصرية المحلية
  private static readonly EGYPTIAN_MOBILE_PREFIXES = [
    '010', '011', '012', '015', // الشبكات الرئيسية
    '0100', '0101', '0106', '0109', // أوريدو وفودافون تفصيلي
    '0110', '0111', '0112', '0114', '0115', '0116', '0118', '0119', // اتصالات مصر
    '0120', '0121', '0122', '0127', '0128' // WE (المصرية للاتصالات)
  ];

  /**
   * تنظيف رقم الهاتف من الرموز غير المرغوبة (متوافق مع المعايير المصرية)
   */
  private static cleanPhoneNumber(phone: string): string {
    if (!phone) return '';
    
    return phone
      .toString()
      .replace(/[\s\-\(\)\+\.\u00A0\u200B\u200C\u200D]/g, '') // إزالة جميع المسافات والرموز
      .replace(/^00/, '') // إزالة 00 من البداية
      .replace(/^\+/, '') // إزالة + من البداية
      .trim();
  }

  /**
   * معالجة الرقم المصري حسب المواصفات الدقيقة في الـ roadmap
   */
  private static processEgyptianNumber(cleaned: string): { countryCode: string; nationalNumber: string } | null {
    // إذا كان الرقم يبدأ بـ 20 بالفعل
    if (cleaned.startsWith('20')) {
      const nationalPart = cleaned.substring(2);
      // التحقق من أن الجزء المحلي صالح (10 أرقام)
      if (nationalPart.length === 10 && /^1[0-9]{9}$/.test(nationalPart)) {
        return {
          countryCode: this.EGYPT_COUNTRY_CODE,
          nationalNumber: nationalPart
        };
      }
    }

    // إذا كان الرقم يبدأ بـ 01 (الشكل المحلي المصري)
    if (cleaned.startsWith('01')) {
      const withoutLeadingZero = cleaned.substring(1); // إزالة الـ 0
      // التحقق من صحة الرقم (11 رقم بعد إزالة الصفر = 1 + 10 أرقام)
      if (withoutLeadingZero.length === 10 && /^1[0-9]{9}$/.test(withoutLeadingZero)) {
        return {
          countryCode: this.EGYPT_COUNTRY_CODE,
          nationalNumber: withoutLeadingZero
        };
      }
    }

    // إذا كان الرقم يبدأ بـ 1 مباشرة (محتمل مصري بدون صفر أو مفتاح)
    if (cleaned.startsWith('1') && cleaned.length === 10) {
      if (/^1[0-9]{9}$/.test(cleaned)) {
        return {
          countryCode: this.EGYPT_COUNTRY_CODE,
          nationalNumber: cleaned
        };
      }
    }

    return null;
  }

  /**
   * استخراج مفتاح الدولة من الرقم مع أولوية للأرقام المصرية
   */
  private static extractCountryCode(phone: string): { countryCode: string; nationalNumber: string } | null {
    if (!phone) return null;

    const cleaned = this.cleanPhoneNumber(phone);
    
    // أولاً: محاولة معالجة الرقم كرقم مصري
    const egyptianResult = this.processEgyptianNumber(cleaned);
    if (egyptianResult) {
      return egyptianResult;
    }

    // ثانياً: البحث عن مفاتيح الدول الأخرى
    for (const [code] of Object.entries(this.COUNTRY_CODES)) {
      if (cleaned.startsWith(code)) {
        const nationalPart = cleaned.substring(code.length);
        // التحقق من طول الجزء المحلي
        if (nationalPart.length >= 7 && nationalPart.length <= 12) {
          return {
            countryCode: code,
            nationalNumber: nationalPart
          };
        }
      }
    }

    return null;
  }

  /**
   * التحقق من صحة رقم الهاتف
   */
  private static isValidPhoneNumber(phone: string): boolean {
    if (!phone) return false;
    
    const cleaned = this.cleanPhoneNumber(phone);
    
    // يجب أن يحتوي على أرقام فقط
    if (!/^\d+$/.test(cleaned)) {
      return false;
    }

    // طول مناسب
    if (cleaned.length < 8 || cleaned.length > 15) {
      return false;
    }

    return true;
  }

  /**
   * تحويل رقم الهاتف للتنسيق الدولي (مُحدث للمعايير المصرية)
   */
  static formatToInternational(phone: string): string {
    if (!phone) return '';

    const cleaned = this.cleanPhoneNumber(phone);
    if (!this.isValidPhoneNumber(cleaned)) {
      return '';
    }

    const parsed = this.extractCountryCode(cleaned);
    if (!parsed) return '';

    const { countryCode, nationalNumber } = parsed;
    
    // التحقق الإضافي للأرقام المصرية (يجب أن يكون 12 رقم نهائياً)
    if (countryCode === this.EGYPT_COUNTRY_CODE) {
      if (nationalNumber.length !== 10) {
        return '';
      }
      // التحقق من أن الرقم يبدأ بـ 1 (أرقام محمول مصرية)
      if (!nationalNumber.startsWith('1')) {
        return '';
      }
    }

    return `${countryCode}${nationalNumber}`;
  }

  /**
   * تحويل رقم الهاتف لتنسيق الواتساب
   */
  static formatForWhatsApp(phone: string): string {
    return this.formatToInternational(phone);
  }

  /**
   * معالجة رقمين مع أولوية لرقم الواتساب (حسب المواصفات)
   */
  static processTwoNumbers(phoneNumber: string, whatsappNumber: string): {
    preferredNumber: string;
    alternativeNumber: string;
    isValid: boolean;
    source: 'phone' | 'whatsapp' | 'none';
    processingLog: string[];
  } {
    const processingLog: string[] = [];
    
    // أولوية لرقم الواتساب كما هو محدد في المواصفات
    processingLog.push('فحص رقم الواتساب أولاً...');
    const processedWhatsApp = this.formatForWhatsApp(whatsappNumber);
    
    processingLog.push('فحص رقم الهاتف العادي...');
    const processedPhone = this.formatForWhatsApp(phoneNumber);

    // إذا كان رقم الواتساب صالح، استخدمه (الأولوية الأولى)
    if (processedWhatsApp) {
      processingLog.push(`✅ رقم الواتساب صالح: ${processedWhatsApp}`);
      return {
        preferredNumber: processedWhatsApp,
        alternativeNumber: processedPhone || '',
        isValid: true,
        source: 'whatsapp',
        processingLog
      };
    }

    // إذا كان رقم الهاتف صالح فقط
    if (processedPhone) {
      processingLog.push(`⚠️ رقم الهاتف صالح لكن لا يوجد رقم واتساب: ${processedPhone}`);
      return {
        preferredNumber: processedPhone,
        alternativeNumber: '',
        isValid: true,
        source: 'phone',
        processingLog
      };
    }

    // لا يوجد رقم صالح
    processingLog.push('❌ لا يوجد رقم صالح');
    return {
      preferredNumber: '',
      alternativeNumber: '',
      isValid: false,
      source: 'none',
      processingLog
    };
  }

  /**
   * تحليل رقم الهاتف وإرجاع معلومات تفصيلية مع تركيز على الأرقام المصرية
   */
  static analyzePhoneNumber(phone: string): {
    original: string;
    cleaned: string;
    formatted: string;
    countryCode?: string;
    countryName?: string;
    nationalNumber?: string;
    isValid: boolean;
    isEgyptian: boolean;
    validationErrors: string[];
    suggestions: string[];
  } {
    const original = phone || '';
    const cleaned = this.cleanPhoneNumber(original);
    const validationErrors: string[] = [];
    const suggestions: string[] = [];

    if (!original) {
      validationErrors.push('رقم فارغ');
      return {
        original,
        cleaned,
        formatted: '',
        isValid: false,
        isEgyptian: false,
        validationErrors,
        suggestions: ['يرجى إدخال رقم هاتف']
      };
    }

    if (!this.isValidPhoneNumber(cleaned)) {
      validationErrors.push('تنسيق رقم غير صحيح');
      suggestions.push('تأكد من أن الرقم يحتوي على أرقام فقط');
    }

    const parsed = this.extractCountryCode(cleaned);
    if (!parsed) {
      validationErrors.push('لا يمكن تحديد مفتاح الدولة');
      
      // اقتراحات للأرقام المصرية
      if (cleaned.length === 11 && cleaned.startsWith('0')) {
        suggestions.push('يبدو أنه رقم مصري، جرب إزالة الصفر من البداية');
      } else if (cleaned.length === 10 && cleaned.startsWith('1')) {
        suggestions.push('يبدو أنه رقم مصري، سيتم إضافة مفتاح مصر (20) تلقائياً');
      }
      
      return {
        original,
        cleaned,
        formatted: '',
        isValid: false,
        isEgyptian: false,
        validationErrors,
        suggestions
      };
    }

    const { countryCode, nationalNumber } = parsed;
    const isEgyptian = countryCode === this.EGYPT_COUNTRY_CODE;
    
    // تحقق إضافي للأرقام المصرية
    if (isEgyptian) {
      if (nationalNumber.length !== 10) {
        validationErrors.push('الرقم المصري يجب أن يكون 10 أرقام بعد مفتاح الدولة');
      }
      if (!nationalNumber.startsWith('1')) {
        validationErrors.push('الرقم المصري يجب أن يبدأ بـ 1');
        suggestions.push('تأكد من أن الرقم رقم محمول مصري صحيح');
      }
    }

    const formatted = this.formatToInternational(original);
    const countryName = this.COUNTRY_CODES[countryCode] || 'غير معروف';

    if (validationErrors.length === 0) {
      suggestions.push(isEgyptian ? '✅ رقم مصري صحيح' : `✅ رقم ${countryName} صحيح`);
    }

    return {
      original,
      cleaned,
      formatted,
      countryCode,
      countryName,
      nationalNumber,
      isValid: validationErrors.length === 0,
      isEgyptian,
      validationErrors,
      suggestions
    };
  }

  /**
   * إنشاء معرف طلب من البيانات
   */
  static generateOrderId(name: string, phone: string, orderDate: string): string {
    const cleanPhone = this.formatForWhatsApp(phone).slice(-4); // آخر 4 أرقام
    const timestamp = new Date(orderDate || Date.now()).getTime().toString().slice(-6); // آخر 6 أرقام من التوقيت
    const namePrefix = name.trim().replace(/\s+/g, '').slice(0, 3).toUpperCase(); // أول 3 أحرف من الاسم
    
    return `${namePrefix}-${cleanPhone}-${timestamp}`;
  }

  /**
   * التحقق من صحة الرقم للسوق المصري تحديداً
   */
  static validateEgyptianNumber(phone: string): {
    isValid: boolean;
    finalFormat: string;
    errors: string[];
    processingSteps: string[];
  } {
    const processingSteps: string[] = [];
    const errors: string[] = [];

    processingSteps.push(`1. الرقم الأصلي: "${phone}"`);
    
    const cleaned = this.cleanPhoneNumber(phone);
    processingSteps.push(`2. بعد التنظيف: "${cleaned}"`);

    const result = this.processEgyptianNumber(cleaned);
    if (!result) {
      errors.push('الرقم ليس رقم مصري صحيح');
      processingSteps.push('3. ❌ فشل في التعرف على الرقم كرقم مصري');
      return {
        isValid: false,
        finalFormat: '',
        errors,
        processingSteps
      };
    }

    const finalFormat = `${result.countryCode}${result.nationalNumber}`;
    processingSteps.push(`3. ✅ التنسيق النهائي: ${finalFormat}`);

    // التحقق من الطول النهائي (يجب أن يكون 12 رقم)
    if (finalFormat.length !== 12) {
      errors.push('الرقم المصري النهائي يجب أن يكون 12 رقم (20 + 10 أرقام)');
    }

    return {
      isValid: errors.length === 0,
      finalFormat: errors.length === 0 ? finalFormat : '',
      errors,
      processingSteps
    };
  }
} 