import { NextResponse } from 'next/server';
import { GoogleSheetsService } from '@/lib/services/google-sheets';
import { ConfigService } from '@/lib/services/config';
import { PhoneProcessor } from '@/lib/services/phone-processor';
import { WhatsAppService } from '@/lib/services/whatsapp';
import { QueueService } from '@/lib/services/queue';
import type { MessageJob } from '@/lib/services/queue';

// Local message storage
const pendingMessages: Array<{
  id: string;
  timestamp: number;
  phoneNumber: string;
  message: string;
  orderId: string;
  messageType: string;
  status: 'pending' | 'sent' | 'failed';
  error?: string;
}> = [];

export async function POST() {
  try {
    console.log('🚀 FORCE PROCESSING - Processing orders regardless of WhatsApp status...');
    
    // Get sheet data
    const sheetData = await GoogleSheetsService.getSheetData();
    
    if (!sheetData || sheetData.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No data found in Google Sheets',
        processed: 0
      });
    }
    
    // Get message templates and configuration
    const { templates } = await ConfigService.getMessageTemplates();
    const statusSettings = await ConfigService.getStatusSettings();
    const enabledStatuses = statusSettings?.enabledStatuses || {
      newOrder: true,
      noAnswer: true,
      shipped: true,
      rejectedOffer: true,
      reminder: true
    };
    
    // Check WhatsApp status
    const whatsapp = WhatsAppService.getInstance();
    const whatsappConnected = whatsapp.getStatus().isConnected;
    
    console.log(`📱 WhatsApp Status: ${whatsappConnected ? 'Connected' : 'Not Connected'}`);
    console.log(`📊 Processing ${sheetData.length} orders...`);
    
    let processedCount = 0;
    let messagesQueued = 0;
    const results = [];
    
    for (const row of sheetData) {
      const result: any = {
        orderId: row.orderId,
        name: row.name,
        status: row.orderStatus,
        processed: false,
        messageQueued: false,
        errors: []
      };
      
      // Validate basic data
      if (!row.name || (!row.phone && !row.whatsappNumber)) {
        result.errors.push('Missing name or phone');
        results.push(result);
        continue;
      }
      
      // Process phone number
      const phoneProcessing = PhoneProcessor.processTwoNumbers(row.phone, row.whatsappNumber);
      
      if (!phoneProcessing.isValid) {
        result.errors.push('Invalid phone number');
        results.push(result);
        continue;
      }
      
      // Egyptian validation
      const egyptianValidation = PhoneProcessor.validateEgyptianNumber(phoneProcessing.preferredNumber);
      
      if (!egyptianValidation.isValid) {
        result.errors.push('Not a valid Egyptian number');
        results.push(result);
        continue;
      }
      
      const processedPhone = egyptianValidation.finalFormat;
      const status = (row.orderStatus || '').trim();
      
      // Determine message type and content
      let messageType = '';
      let messageContent = '';
      let shouldSend = false;
      
      switch (status) {
        case '':
        case 'جديد':
        case 'طلب جديد':
        case 'قيد المراجعة':
        case 'قيد المراجعه':
        case 'غير محدد':
          if (enabledStatuses.newOrder) {
            messageType = 'newOrder';
            messageContent = templates.newOrder
              .replace(/{name}/g, row.name)
              .replace(/{orderId}/g, row.orderId || 'N/A')
              .replace(/{amount}/g, row.totalPrice?.toString() || '0')
              .replace(/{productName}/g, row.productName || 'المنتج');
            shouldSend = true;
          }
          break;
          
        case 'لم يتم الرد':
        case 'لم يرد':
        case 'لا يرد':
        case 'عدم الرد':
          if (enabledStatuses.noAnswer) {
            messageType = 'noAnswer';
            messageContent = templates.noAnswer
              .replace(/{name}/g, row.name)
              .replace(/{orderId}/g, row.orderId || 'N/A');
            shouldSend = true;
          }
          break;
          
        case 'تم التأكيد':
        case 'تم التاكيد':
        case 'مؤكد':
        case 'تم الشحن':
        case 'قيد الشحن':
          if (enabledStatuses.shipped) {
            messageType = 'shipped';
            messageContent = templates.shipped
              .replace(/{name}/g, row.name)
              .replace(/{orderId}/g, row.orderId || 'N/A')
              .replace(/{trackingNumber}/g, `TRK${row.orderId || Date.now()}`);
            shouldSend = true;
          }
          break;
      }
      
      if (shouldSend && messageContent) {
        // Create message job
        const messageJob: MessageJob = {
          phoneNumber: processedPhone,
          message: messageContent,
          orderId: row.orderId || `ORDER_${Date.now()}`,
          rowIndex: row.rowIndex || 0,
          messageType: messageType as any
        };
        
        if (whatsappConnected) {
          // Add to queue for immediate sending
          try {
            await QueueService.addMessageJob(messageJob);
            result.messageQueued = true;
            messagesQueued++;
            console.log(`✅ Queued ${messageType} message for ${row.name} (${processedPhone})`);
          } catch (error) {
            console.error(`❌ Failed to queue message:`, error);
            result.errors.push('Failed to queue message');
            
            // Store locally as fallback
            pendingMessages.push({
              id: `MSG_${Date.now()}_${Math.random()}`,
              timestamp: Date.now(),
              phoneNumber: processedPhone,
              message: messageContent,
              orderId: row.orderId || 'N/A',
              messageType,
              status: 'pending'
            });
          }
        } else {
          // Store locally for later sending
          pendingMessages.push({
            id: `MSG_${Date.now()}_${Math.random()}`,
            timestamp: Date.now(),
            phoneNumber: processedPhone,
            message: messageContent,
            orderId: row.orderId || 'N/A',
            messageType,
            status: 'pending'
          });
          result.messageQueued = true;
          messagesQueued++;
          console.log(`📦 Stored ${messageType} message for ${row.name} (will send when WhatsApp connects)`);
        }
        
        result.processed = true;
        processedCount++;
      }
      
      results.push(result);
    }
    
    console.log(`✅ Processing complete: ${processedCount} orders processed, ${messagesQueued} messages queued`);
    
    return NextResponse.json({
      success: true,
      message: `تم معالجة ${processedCount} طلب وإضافة ${messagesQueued} رسالة للإرسال`,
      whatsappConnected,
      summary: {
        totalOrders: sheetData.length,
        processedOrders: processedCount,
        messagesQueued: messagesQueued,
        pendingMessagesStored: pendingMessages.filter(m => m.status === 'pending').length
      },
      details: results
    });
    
  } catch (error) {
    console.error('❌ Force processing failed:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Force processing failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Get pending messages
export async function GET() {
  try {
    const pending = pendingMessages.filter(m => m.status === 'pending');
    const sent = pendingMessages.filter(m => m.status === 'sent');
    const failed = pendingMessages.filter(m => m.status === 'failed');
    
    return NextResponse.json({
      success: true,
      summary: {
        total: pendingMessages.length,
        pending: pending.length,
        sent: sent.length,
        failed: failed.length
      },
      messages: pendingMessages
    });
    
  } catch (error) {
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to get pending messages',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 