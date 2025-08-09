import { NextApiRequest, NextApiResponse } from 'next';
import { GoogleSheetsService } from '../../../lib/services/google-sheets';
import { DuplicateGuardService } from '../../../lib/services/duplicate-guard';
import { PhoneProcessor } from '../../../lib/services/phone-processor';
import { AutomationEngine } from '../../../lib/services/automation-engine';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔍 Starting leads debugging...');
    
    // Get raw sheet data
    const sheetData = await GoogleSheetsService.getSheetData();
    console.log(`📊 Found ${sheetData.length} total leads in sheet`);
    
    const debugResults = [];
    const statusHistory = new Map<string, { status: string, timestamp: number }>();
    
    for (let i = 0; i < Math.min(sheetData.length, 10); i++) { // Debug first 10 leads
      const row = sheetData[i];
      const debugInfo: any = {
        rowIndex: row.rowIndex || i + 1,
        name: row.name,
        phone: row.phone,
        whatsappNumber: row.whatsappNumber,
        orderStatus: row.orderStatus,
        orderId: row.orderId
      };
      
      // Step 1: Phone processing
      const phoneProcessing = PhoneProcessor.processTwoNumbers(row.phone, row.whatsappNumber);
      debugInfo.phoneProcessing = {
        isValid: phoneProcessing.isValid,
        preferredNumber: phoneProcessing.preferredNumber,
        processingLog: phoneProcessing.processingLog
      };
      
      // Step 2: Egyptian validation
      if (phoneProcessing.isValid) {
        const egyptianValidation = PhoneProcessor.validateEgyptianNumber(phoneProcessing.preferredNumber);
        debugInfo.egyptianValidation = {
          isValid: egyptianValidation.isValid,
          finalFormat: egyptianValidation.finalFormat,
          errors: egyptianValidation.errors
        };
        
        // Step 3: Generate orderId if missing
        if (!row.orderId) {
          try {
            row.orderId = PhoneProcessor.generateOrderId(
              row.name || 'عميل',
              egyptianValidation.finalFormat || '',
              row.orderDate || ''
            );
          } catch {
            row.orderId = `row_${row.rowIndex || i + 1}_${(row.name || '').substring(0,3)}`;
          }
        }
        debugInfo.generatedOrderId = row.orderId;
        
        // Step 4: Check duplicate guard
        if (egyptianValidation.isValid) {
          const shouldSendNew = await DuplicateGuardService.shouldSend(row.orderId!, 'newOrder', egyptianValidation.finalFormat, row.name);
          const shouldSendNoAnswer = await DuplicateGuardService.shouldSend(row.orderId!, 'noAnswer', egyptianValidation.finalFormat, row.name);
          const shouldSendShipped = await DuplicateGuardService.shouldSend(row.orderId!, 'shipped', egyptianValidation.finalFormat, row.name);
          
          debugInfo.duplicateGuardStatus = {
            canSendNewOrder: shouldSendNew,
            canSendNoAnswer: shouldSendNoAnswer,
            canSendShipped: shouldSendShipped
          };
        }
        
        // Step 5: Status tracking logic
        const stableKey = row.orderId || `row_${row.rowIndex || i + 1}_${(row.name || '').substring(0,3)}`;
        const previousStatusData = statusHistory.get(stableKey);
        
        statusHistory.set(stableKey, {
          status: row.orderStatus || '',
          timestamp: Date.now()
        });
        
        const isNewOrder = !previousStatusData;
        const statusChanged = previousStatusData && previousStatusData.status !== row.orderStatus;
        
        debugInfo.statusTracking = {
          stableKey,
          currentStatus: row.orderStatus,
          previousStatus: previousStatusData?.status,
          isNewOrder,
          statusChanged,
          wouldProcess: isNewOrder || statusChanged
        };
        
        // Step 6: Status type mapping
        const statusType = mapStatusToType(row.orderStatus || '');
        debugInfo.statusMapping = {
          detectedType: statusType,
          supportedStatus: !!statusType
        };
      }
      
      debugResults.push(debugInfo);
    }
    
    console.log('✅ Leads debugging completed');
    
    res.status(200).json({
      success: true,
      totalLeads: sheetData.length,
      debuggedLeads: debugResults.length,
      results: debugResults,
      summary: {
        validPhones: debugResults.filter(r => r.phoneProcessing?.isValid).length,
        egyptianPhones: debugResults.filter(r => r.egyptianValidation?.isValid).length,
        canSendMessages: debugResults.filter(r => r.duplicateGuardStatus?.canSendNewOrder).length,
        wouldProcess: debugResults.filter(r => r.statusTracking?.wouldProcess).length,
        supportedStatuses: debugResults.filter(r => r.statusMapping?.supportedStatus).length
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error debugging leads:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

function mapStatusToType(status: string): string | null {
  const EGYPTIAN_ORDER_STATUSES = {
    NEW: 'جديد',
    NEW_2: 'طلب جديد',
    NEW_3: 'قيد المراجعة',
    NEW_4: 'قيد المراجعه',
    EMPTY: '',
    UNDEFINED: 'غير محدد',
    NO_ANSWER_1: 'لم يتم الرد',
    NO_ANSWER_2: 'لم يرد',
    NO_ANSWER_3: 'لا يرد',
    NO_ANSWER_4: 'عدم الرد',
    CONFIRMED: 'تم التأكيد',
    CONFIRMED_2: 'تم التاكيد',
    CONFIRMED_3: 'مؤكد',
    SHIPPED: 'تم الشحن',
    SHIPPED_2: 'قيد الشحن',
    REJECTED_1: 'تم الرفض',
    REJECTED_2: 'مرفوض',
    REJECTED_3: 'رفض الاستلام',
    REJECTED_4: 'رفض الأستلام',
    REJECTED_5: 'لم يتم الاستلام',
  };

  switch (status) {
    case EGYPTIAN_ORDER_STATUSES.NEW:
    case EGYPTIAN_ORDER_STATUSES.NEW_2:
    case EGYPTIAN_ORDER_STATUSES.NEW_3:
    case EGYPTIAN_ORDER_STATUSES.NEW_4:
    case EGYPTIAN_ORDER_STATUSES.UNDEFINED:
    case EGYPTIAN_ORDER_STATUSES.EMPTY:
      return 'newOrder';
    case EGYPTIAN_ORDER_STATUSES.NO_ANSWER_1:
    case EGYPTIAN_ORDER_STATUSES.NO_ANSWER_2:
    case EGYPTIAN_ORDER_STATUSES.NO_ANSWER_3:
    case EGYPTIAN_ORDER_STATUSES.NO_ANSWER_4:
      return 'noAnswer';
    case EGYPTIAN_ORDER_STATUSES.CONFIRMED:
    case EGYPTIAN_ORDER_STATUSES.CONFIRMED_2:
    case EGYPTIAN_ORDER_STATUSES.CONFIRMED_3:
    case EGYPTIAN_ORDER_STATUSES.SHIPPED:
    case EGYPTIAN_ORDER_STATUSES.SHIPPED_2:
      return 'shipped';
    case EGYPTIAN_ORDER_STATUSES.REJECTED_1:
    case EGYPTIAN_ORDER_STATUSES.REJECTED_2:
    case EGYPTIAN_ORDER_STATUSES.REJECTED_3:
    case EGYPTIAN_ORDER_STATUSES.REJECTED_4:
    case EGYPTIAN_ORDER_STATUSES.REJECTED_5:
      return 'rejectedOffer';
    default:
      return null;
  }
} 