import { PhoneProcessor } from './phone-processor';
import { WhatsAppService } from './whatsapp';
import { MessageTracker } from './message-tracker';
import type { SheetRow } from '../types/config';

export interface ProcessedOrder {
  rowIndex: number;
  customerName: string;
  primaryPhone: string;
  secondaryPhone: string;
  whatsappNumber: string;
  productName: string;
  productValue: string;
  orderStatus: string;
  processedPhone: string;
  phoneValidation: {
    isValid: boolean;
    isEgyptian: boolean;
    errors: string[];
    originalFormat: string;
    finalFormat: string;
  };
  whatsappValidation: {
    isRegistered: boolean;
    isValid: boolean;
    error?: string;
  };
  sentMessages: Array<{
    type: string;
    timestamp: string;
    status: 'sent' | 'failed' | 'pending';
  }>;
  lastUpdate: string;
  orderDate?: string;
  governorate?: string;
  area?: string;
  address?: string;
}

export interface OrdersStats {
  total: number;
  valid: number;
  invalid: number;
  withErrors: number;
  egyptian: number;
  whatsappRegistered: number;
  messagesSent: number;
}

// Helper function to safely extract error message
function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === 'string') {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object') {
    return JSON.stringify(error);
  }
  return 'Unknown error occurred';
}

export class OrderDataProcessor {
  /**
   * معالجة قائمة الطلبات من Google Sheets
   */
  static async processOrders(rawSheetData: SheetRow[]): Promise<ProcessedOrder[]> {
    const processedOrders: ProcessedOrder[] = [];
    const whatsapp = WhatsAppService.getInstance();

    console.log(`🔄 Processing ${rawSheetData.length} raw orders...`);

    for (let i = 0; i < rawSheetData.length; i++) {
      const row = rawSheetData[i];
      
      try {
        const processedOrder = await this.processIndividualOrder(row, whatsapp);
        if (processedOrder) {
          processedOrders.push(processedOrder);
        }
      } catch (error) {
        console.error(`❌ Error processing order at row ${row.rowIndex}:`, error);
        // Create a basic processed order even if there are errors
        const errorOrder = this.createErrorOrder(row, error);
        processedOrders.push(errorOrder);
      }

      // Log progress every 10 orders
      if ((i + 1) % 10 === 0) {
        console.log(`📊 Processed ${i + 1}/${rawSheetData.length} orders...`);
      }
    }

    console.log(`✅ Completed processing ${processedOrders.length} orders`);
    return processedOrders;
  }

  /**
   * معالجة طلب واحد مع حل مشكلة #ERROR!
   */
  private static async processIndividualOrder(
    row: SheetRow, 
    whatsapp: WhatsAppService
  ): Promise<ProcessedOrder | null> {
    // Extract and clean basic data - NEVER skip based on customer name
    const customerName = this.cleanText(row.name || `عميل غير محدد - صف ${row.rowIndex}`);
    const productName = this.cleanText(row.productName || 'منتج غير محدد');
    const productValue = this.cleanText(row.totalPrice?.toString() || '0');
    const orderStatus = this.cleanText(row.orderStatus || 'غير محدد');

    // Extract and process phone numbers with ERROR! handling - ALWAYS TRY TO PROCESS
    const primaryPhone = this.fixErrorFormula(row.phone || '');
    const secondaryPhone = this.fixErrorFormula(row.whatsappNumber || '');
    
    console.log(`🔍 Processing row ${row.rowIndex}: Customer: ${customerName}, Primary: "${row.phone}" -> "${primaryPhone}", Secondary: "${row.whatsappNumber}" -> "${secondaryPhone}"`);
    
    // Process phone numbers - even if empty, still create the order
    const phoneProcessing = PhoneProcessor.processTwoNumbers(primaryPhone, secondaryPhone);
    
    // Egyptian validation
    let phoneValidation = {
      isValid: false,
      isEgyptian: false,
      errors: ['No valid phone found'],
      originalFormat: primaryPhone || secondaryPhone || '',
      finalFormat: ''
    };

    let processedPhone = '';

    if (phoneProcessing.isValid && phoneProcessing.preferredNumber) {
      const egyptianValidation = PhoneProcessor.validateEgyptianNumber(phoneProcessing.preferredNumber);
      phoneValidation = {
        isValid: egyptianValidation.isValid,
        isEgyptian: egyptianValidation.isValid,
        errors: egyptianValidation.errors,
        originalFormat: phoneProcessing.preferredNumber,
        finalFormat: egyptianValidation.finalFormat
      };
      processedPhone = egyptianValidation.finalFormat;
    } else {
      // Even if phone processing fails, still show the order with error info
      phoneValidation.errors = [
        ...phoneProcessing.processingLog,
        'Original primary phone: ' + (row.phone || 'empty'),
        'Original secondary phone: ' + (row.whatsappNumber || 'empty')
      ];
    }

    // WhatsApp validation (only if phone is valid and WhatsApp is connected)
    let whatsappValidation = {
      isRegistered: false,
      isValid: false,
      error: phoneValidation.isValid ? 'WhatsApp not checked' : 'Phone number invalid'
    };

    if (phoneValidation.isValid && whatsapp.getStatus().isConnected) {
      try {
        const validation = await whatsapp.validatePhoneNumber(processedPhone);
        whatsappValidation = {
          isRegistered: validation.isRegistered,
          isValid: validation.isValid,
          error: validation.error
        };
      } catch (error) {
        const errorMessage = safeErrorMessage(error);
        whatsappValidation = {
          isRegistered: false,
          isValid: false,
          error: `WhatsApp validation failed: ${errorMessage}`
        };
      }
    }

    // Get sent messages for this order using MessageTracker
    const orderId = row.orderId || `row_${row.rowIndex}_${customerName.substring(0, 3)}`;
    
    // Update message tracking based on order status (only if phone is valid)
    if (phoneValidation.isValid) {
      MessageTracker.updateTrackingBasedOnOrderStatus(
        orderId, 
        orderStatus, 
        processedPhone,
        row.rowIndex
      );
    }

    // Get actual sent messages from tracker
    const sentMessages = MessageTracker.getOrderMessagesSummary(orderId);

    // ALWAYS create and return the processed order, never skip
    const processedOrder: ProcessedOrder = {
      rowIndex: row.rowIndex || 0,
      customerName,
      primaryPhone: row.phone || '',
      secondaryPhone: row.whatsappNumber || '',
      whatsappNumber: row.whatsappNumber || '',
      productName,
      productValue,
      orderStatus,
      processedPhone: processedPhone || 'رقم غير صالح',
      phoneValidation,
      whatsappValidation,
      sentMessages,
      lastUpdate: new Date().toISOString(),
      orderDate: row.orderDate,
      governorate: row.governorate,
      area: row.area,
      address: row.address
    };

    console.log(`✅ Processed order for row ${row.rowIndex}: ${customerName} - Phone valid: ${phoneValidation.isValid}`);
    return processedOrder;
  }

  /**
   * حل مشكلة #ERROR! في البيانات - محسن لاستخراج الأرقام
   */
  private static fixErrorFormula(value: string): string {
    if (!value || typeof value !== 'string') {
      return '';
    }

    // Handle #ERROR! cases with more thorough extraction
    if (value.includes('#ERROR!')) {
      console.log(`🔧 Fixing ERROR formula: "${value}"`);
      
      // Try multiple patterns to extract numbers
      const patterns = [
        /\d{11}/g,           // 11 digit numbers (Egyptian format)
        /\d{10}/g,           // 10 digit numbers  
        /01\d{9}/g,          // Egyptian mobile pattern
        /\+201\d{9}/g,       // International Egyptian
        /\d{8,15}/g          // Any 8-15 digit number
      ];
      
      for (const pattern of patterns) {
        const matches = value.match(pattern);
        if (matches && matches.length > 0) {
          const extractedNumber = matches[0];
          console.log(`✅ Extracted number from ERROR: ${extractedNumber}`);
          return extractedNumber;
        }
      }
      
      // If no number found, return empty but log the original
      console.log(`❌ Could not extract number from ERROR: "${value}"`);
      return '';
    }

    // Clean other common issues more thoroughly
    return value
      .replace(/[^\d+\s()-]/g, '') // Remove non-phone characters
      .replace(/\s+/g, '')         // Remove all spaces
      .trim();
  }

  /**
   * تنظيف النصوص
   */
  private static cleanText(text: string): string {
    if (!text || typeof text !== 'string') {
      return '';
    }

    return text
      .replace(/[#ERROR!]+/g, '') // Remove error markers
      .replace(/Formula parse error\.?/gi, '') // Remove error messages
      .trim();
  }

  /**
   * إنشاء طلب خطأ في حالة فشل المعالجة
   */
  private static createErrorOrder(row: SheetRow, error: unknown): ProcessedOrder {
    const orderId = row.orderId || `row_${row.rowIndex}`;
    const errorMessage = safeErrorMessage(error);
    
    return {
      rowIndex: row.rowIndex || 0,
      customerName: this.cleanText(row.name || 'Unknown'),
      primaryPhone: row.phone || '',
      secondaryPhone: row.whatsappNumber || '',
      whatsappNumber: row.whatsappNumber || '',
      productName: this.cleanText(row.productName || ''),
      productValue: this.cleanText(row.totalPrice?.toString() || ''),
      orderStatus: this.cleanText(row.orderStatus || ''),
      processedPhone: '',
      phoneValidation: {
        isValid: false,
        isEgyptian: false,
        errors: [`Processing error: ${errorMessage}`],
        originalFormat: row.phone || '',
        finalFormat: ''
      },
      whatsappValidation: {
        isRegistered: false,
        isValid: false,
        error: 'Processing failed'
      },
      sentMessages: [], // No messages for error orders
      lastUpdate: new Date().toISOString(),
      orderDate: row.orderDate,
      governorate: row.governorate,
      area: row.area,
      address: row.address
    };
  }

  /**
   * حساب الإحصائيات مع بيانات الرسائل الفعلية
   */
  static calculateStats(processedOrders: ProcessedOrder[]): OrdersStats {
    const stats: OrdersStats = {
      total: processedOrders.length,
      valid: 0,
      invalid: 0,
      withErrors: 0,
      egyptian: 0,
      whatsappRegistered: 0,
      messagesSent: 0
    };

    // Get message stats from tracker
    const messageStats = MessageTracker.getMessagesStats();

    for (const order of processedOrders) {
      // Phone validation stats
      if (order.phoneValidation.isValid) {
        stats.valid++;
      } else {
        stats.invalid++;
      }

      // Egyptian numbers
      if (order.phoneValidation.isEgyptian) {
        stats.egyptian++;
      }

      // WhatsApp registered
      if (order.whatsappValidation.isRegistered) {
        stats.whatsappRegistered++;
      }

      // Error handling
      if (order.primaryPhone.includes('#ERROR!') || 
          order.secondaryPhone.includes('#ERROR!') ||
          order.phoneValidation.errors.some(e => e.includes('ERROR'))) {
        stats.withErrors++;
      }
    }

    // Use actual message count from tracker
    stats.messagesSent = messageStats.sentMessages;

    return stats;
  }

  /**
   * إعادة تعيين تخزين الرسائل المرسلة
   */
  static resetSentMessagesStore(): void {
    // This method is no longer needed as messages are tracked by MessageTracker
    // Keeping it for now, but it will be removed in a future edit.
    console.log('🔄 Sent messages store reset (MessageTracker handles this)');
  }

  /**
   * الحصول على إحصائيات تخزين الرسائل
   */
  static getSentMessagesStats(): { totalOrders: number; totalMessages: number } {
    // This method is no longer needed as messages are tracked by MessageTracker
    const messageStats = MessageTracker.getMessagesStats();
    const allData = MessageTracker.exportAllData();
    return {
      totalOrders: Object.keys(allData).length,
      totalMessages: messageStats.totalMessages
    };
  }
} 