import { NextApiRequest, NextApiResponse } from 'next';
import { GoogleSheetsService } from '../../../lib/services/google-sheets';
import { ConfigService } from '../../../lib/services/config';
import { PhoneProcessor } from '../../../lib/services/phone-processor';
import { DuplicateGuardService } from '../../../lib/services/duplicate-guard';

interface LeadDetail {
  rowIndex: number;
  name: string;
  phone: string;
  orderStatus: string;
  status: string;
  processedPhone?: string;
  orderId?: string;
  isNewOrder?: boolean;
  statusChanged?: boolean;
  previousStatus?: string;
  phoneErrors?: string[];
  egyptianErrors?: string[];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🧪 Starting test automation cycle with detailed debugging...');
    
    // Get configuration
    const templatesConfig = await ConfigService.getMessageTemplates();
    const templates = templatesConfig.templates;
    const timingConfig = await ConfigService.getTimingConfig();
    
    // Get sheet data
    const sheetData = await GoogleSheetsService.getSheetData();
    console.log(`📊 Found ${sheetData.length} leads in sheet`);
    
    const results = {
      totalLeads: sheetData.length,
      validLeads: 0,
      invalidLeads: 0,
      processedLeads: 0,
      skippedLeads: 0,
      newOrders: 0,
      statusChanges: 0,
      duplicatesPrevented: 0,
      errors: [] as string[],
      leadDetails: [] as LeadDetail[]
    };
    
    // Track status history (simulating what automation engine does)
    const orderStatusHistory = new Map<string, { status: string, timestamp: number }>();
    
    for (let i = 0; i < Math.min(sheetData.length, 5); i++) { // Process first 5 leads for testing
      const row = sheetData[i];
      const leadDetail: LeadDetail = {
        rowIndex: row.rowIndex || i + 1,
        name: row.name || '',
        phone: row.phone || '',
        orderStatus: row.orderStatus || '',
        status: ''
      };
      
      try {
        // Step 1: Basic validation
        if (!row.name || (!row.phone && !row.whatsappNumber)) {
          leadDetail.status = 'INVALID - Missing name or phone';
          results.invalidLeads++;
          results.leadDetails.push(leadDetail);
          continue;
        }
        
        // Step 2: Phone processing
        const phoneProcessing = PhoneProcessor.processTwoNumbers(row.phone, row.whatsappNumber);
        if (!phoneProcessing.isValid) {
          leadDetail.status = 'INVALID - Phone processing failed';
          leadDetail.phoneErrors = phoneProcessing.processingLog;
          results.invalidLeads++;
          results.leadDetails.push(leadDetail);
          continue;
        }
        
        // Step 3: Egyptian validation
        const egyptianValidation = PhoneProcessor.validateEgyptianNumber(phoneProcessing.preferredNumber);
        if (!egyptianValidation.isValid) {
          leadDetail.status = 'INVALID - Egyptian validation failed';
          leadDetail.egyptianErrors = egyptianValidation.errors;
          results.invalidLeads++;
          results.leadDetails.push(leadDetail);
          continue;
        }
        
        // Set processed phone and orderId
        row.processedPhone = egyptianValidation.finalFormat;
        if (!row.orderId) {
          try {
            row.orderId = PhoneProcessor.generateOrderId(
              row.name || 'عميل',
              row.processedPhone || '',
              row.orderDate || ''
            );
          } catch {
            row.orderId = `row_${row.rowIndex || i + 1}_${(row.name || '').substring(0,3)}`;
          }
        }
        
        leadDetail.processedPhone = row.processedPhone;
        leadDetail.orderId = row.orderId;
        
        results.validLeads++;
        
        // Step 4: Status tracking logic
        const stableKey = row.orderId || `row_${row.rowIndex || i + 1}_${(row.name || '').substring(0,3)}`;
        const previousStatusData = orderStatusHistory.get(stableKey);
        
        orderStatusHistory.set(stableKey, {
          status: row.orderStatus || '',
          timestamp: Date.now()
        });
        
        const isNewOrder = !previousStatusData;
        const statusChanged = previousStatusData && previousStatusData.status !== row.orderStatus;
        
        leadDetail.isNewOrder = isNewOrder;
        leadDetail.statusChanged = statusChanged;
        leadDetail.previousStatus = previousStatusData?.status;
        
        // Step 5: Check if we would process this lead
        if (isNewOrder || statusChanged) {
          // Check duplicate guard
          const messageType = getMessageTypeForStatus(row.orderStatus || '');
          if (messageType) {
            const canSend = await DuplicateGuardService.shouldSend(row.orderId, messageType as 'newOrder' | 'noAnswer' | 'shipped' | 'rejectedOffer', row.processedPhone, row.name);
            
            if (canSend) {
              leadDetail.status = `WOULD PROCESS - ${isNewOrder ? 'NEW ORDER' : 'STATUS CHANGE'} - ${messageType}`;
              results.processedLeads++;
              if (isNewOrder) results.newOrders++;
              if (statusChanged) results.statusChanges++;
            } else {
              leadDetail.status = `SKIPPED - Duplicate prevented for ${messageType}`;
              results.duplicatesPrevented++;
              results.skippedLeads++;
            }
          } else {
            leadDetail.status = `SKIPPED - Unsupported status: ${row.orderStatus}`;
            results.skippedLeads++;
          }
        } else {
          // Check complementary send
          const messageType = getMessageTypeForStatus(row.orderStatus || '');
          if (messageType) {
            const canSend = await DuplicateGuardService.shouldSend(row.orderId, messageType as 'newOrder' | 'noAnswer' | 'shipped' | 'rejectedOffer', row.processedPhone, row.name);
            if (canSend) {
              leadDetail.status = `WOULD PROCESS - Complementary send for ${messageType}`;
              results.processedLeads++;
            } else {
              leadDetail.status = `SKIPPED - Already sent ${messageType}`;
              results.skippedLeads++;
            }
          } else {
            leadDetail.status = `SKIPPED - No status change and unsupported status`;
            results.skippedLeads++;
          }
        }
        
      } catch (error) {
        leadDetail.status = `ERROR - ${error instanceof Error ? error.message : 'Unknown error'}`;
        results.errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        results.invalidLeads++;
      }
      
      results.leadDetails.push(leadDetail);
    }
    
    console.log('✅ Test automation cycle completed');
    console.log(`📊 Results: ${results.processedLeads} would process, ${results.skippedLeads} would skip`);
    
    res.status(200).json({
      success: true,
      message: 'Test automation cycle completed',
      results,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error in test automation:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

function getMessageTypeForStatus(status: string): 'newOrder' | 'noAnswer' | 'shipped' | 'rejectedOffer' | null {
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