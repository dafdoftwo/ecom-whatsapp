import { NextResponse } from 'next/server';
import { GoogleSheetsService } from '@/lib/services/google-sheets';
import { AutomationEngine } from '@/lib/services/automation-engine';
import { ConfigService } from '@/lib/services/config';
import { WhatsAppService } from '@/lib/services/whatsapp';

export async function POST() {
  try {
    console.log('🔄 SMART PROCESSING: Starting intelligent status change processing...');
    
    // Check WhatsApp status first
    const whatsapp = WhatsAppService.getInstance();
    const whatsappStatus = whatsapp.getStatus();
    
    if (!whatsappStatus.isConnected) {
      return NextResponse.json({
        success: false,
        message: 'WhatsApp غير متصل - لا يمكن إرسال الرسائل',
        whatsappStatus: whatsappStatus,
        recommendation: 'قم بتوصيل WhatsApp أولاً قبل معالجة الطلبات'
      });
    }

    // Get current sheet data
    const sheetData = await GoogleSheetsService.getSheetData();
    
    if (!sheetData || sheetData.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'لا توجد بيانات في Google Sheets',
        totalOrders: 0
      });
    }

    // Get current status history and sent messages
    const statusHistory = AutomationEngine.getStatusHistory();
    const sentMessages = AutomationEngine.getSentMessages();
    
    // Get templates and settings
    const { templates } = await ConfigService.getMessageTemplates();
    const statusSettings = await ConfigService.getStatusSettings();
    const enabledStatuses = statusSettings?.enabledStatuses || {
      newOrder: true,
      noAnswer: true,
      shipped: true,
      rejectedOffer: true,
      reminder: true
    };

    // Process results
    const results = {
      totalOrders: sheetData.length,
      processedOrders: 0,
      newOrdersProcessed: 0,
      statusChangesProcessed: 0,
      messagesQueued: 0,
      skippedOrders: 0,
      errors: [] as string[],
      processedDetails: [] as any[],
      summary: ''
    };

    console.log(`📊 Processing ${sheetData.length} orders for status changes...`);

    for (const row of sheetData) {
      try {
        // Skip invalid rows
        if (!row.orderId || !row.name || !row.phone) {
          results.skippedOrders++;
          continue;
        }

        const orderId = row.orderId;
        const currentStatus = (row.orderStatus || '').trim();
        const previousStatusData = statusHistory.get(orderId);
        
        // Determine if this is a new order or status change
        const isNewOrder = !previousStatusData;
        const statusChanged = previousStatusData && previousStatusData.status !== currentStatus;
        
        const orderDetail = {
          orderId,
          customerName: row.name,
          phone: row.phone,
          currentStatus,
          previousStatus: previousStatusData?.status || null,
          isNewOrder,
          statusChanged,
          action: 'none',
          messageType: '',
          reason: ''
        };

        // Process new orders
        if (isNewOrder) {
          if (enabledStatuses.newOrder) {
            const messageType = determineMessageType(currentStatus);
            if (messageType !== 'unknown') {
              console.log(`🆕 Processing new order: ${orderId} (${row.name}) - Status: "${currentStatus}"`);
              
              // Check if message was sent recently
              const messageKey = `${orderId}_${messageType}`;
              const lastSentTime = sentMessages.get(messageKey)?.timestamp || 0;
              const hoursSinceLastSent = (Date.now() - lastSentTime) / (1000 * 60 * 60);
              
              if (hoursSinceLastSent > 0.5 || lastSentTime === 0) {
                // Process the order through automation engine
                await AutomationEngine.triggerProcessing();
                
                orderDetail.action = 'message_queued';
                orderDetail.messageType = messageType;
                orderDetail.reason = 'طلب جديد - تم جدولة الرسالة';
                results.messagesQueued++;
                results.newOrdersProcessed++;
              } else {
                orderDetail.action = 'skipped_recent';
                orderDetail.reason = `تم إرسال رسالة مؤخراً (منذ ${hoursSinceLastSent.toFixed(1)} ساعة)`;
              }
            } else {
              orderDetail.action = 'skipped_unknown_status';
              orderDetail.reason = `حالة غير معروفة: "${currentStatus}"`;
            }
          } else {
            orderDetail.action = 'skipped_disabled';
            orderDetail.reason = 'رسائل الطلبات الجديدة معطلة';
          }
        }
        // Process status changes
        else if (statusChanged) {
          const messageType = determineMessageType(currentStatus);
          const enabledForType = getEnabledStatusForMessageType(messageType, enabledStatuses);
          
          if (enabledForType && messageType !== 'unknown') {
            console.log(`🔄 Processing status change: ${orderId} (${row.name}) - "${previousStatusData?.status}" → "${currentStatus}"`);
            
            // Check if message was sent recently
            const messageKey = `${orderId}_${messageType}`;
            const lastSentTime = sentMessages.get(messageKey)?.timestamp || 0;
            const hoursSinceLastSent = (Date.now() - lastSentTime) / (1000 * 60 * 60);
            
            // Use different time thresholds based on message type
            const minWaitTime = getMinWaitTimeForMessageType(messageType);
            
            if (hoursSinceLastSent >= minWaitTime || lastSentTime === 0) {
              // Process the order through automation engine
              await AutomationEngine.triggerProcessing();
              
              orderDetail.action = 'message_queued';
              orderDetail.messageType = messageType;
              orderDetail.reason = `تغيير الحالة - تم جدولة رسالة ${messageType}`;
              results.messagesQueued++;
              results.statusChangesProcessed++;
            } else {
              orderDetail.action = 'skipped_recent';
              orderDetail.reason = `تم إرسال رسالة ${messageType} مؤخراً (منذ ${hoursSinceLastSent.toFixed(1)} ساعة، الحد الأدنى: ${minWaitTime} ساعة)`;
            }
          } else {
            orderDetail.action = 'skipped_disabled_or_unknown';
            orderDetail.reason = enabledForType ? `حالة غير معروفة: "${currentStatus}"` : `رسائل ${messageType} معطلة`;
          }
        }
        // No change
        else {
          orderDetail.action = 'no_change';
          orderDetail.reason = 'لا يوجد تغيير في الحالة';
        }

        results.processedDetails.push(orderDetail);
        results.processedOrders++;

      } catch (error) {
        const errorMsg = `خطأ في معالجة الطلب ${row.orderId}: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`;
        results.errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }
    }

    // Generate summary
    results.summary = `تم معالجة ${results.processedOrders} طلب: ${results.newOrdersProcessed} طلب جديد، ${results.statusChangesProcessed} تغيير حالة، ${results.messagesQueued} رسالة مجدولة، ${results.skippedOrders} تم تخطيه`;

    console.log(`✅ Smart processing completed: ${results.summary}`);

    return NextResponse.json({
      success: true,
      message: 'تم إكمال المعالجة الذكية لتغييرات الحالات',
      timestamp: new Date().toISOString(),
      results,
      whatsappStatus: whatsappStatus,
      recommendations: generateProcessingRecommendations(results)
    });

  } catch (error) {
    console.error('❌ Smart status change processing failed:', error);
    
    return NextResponse.json({
      success: false,
      message: 'فشل في المعالجة الذكية لتغييرات الحالات',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    // Get current processing status
    const automationStatus = AutomationEngine.getStatus();
    const whatsappStatus = WhatsAppService.getInstance().getStatus();
    
    return NextResponse.json({
      success: true,
      message: 'حالة نظام معالجة تغييرات الحالات',
      timestamp: new Date().toISOString(),
      automationEngine: automationStatus,
      whatsapp: whatsappStatus,
      availableActions: [
        'POST /api/automation/process-status-changes - معالجة تغييرات الحالات',
        'POST /api/automation/test-status-changes - اختبار اكتشاف التغييرات',
        'POST /api/automation/force-process-new-orders - معالجة الطلبات الجديدة',
        'POST /api/automation/reset-tracking - إعادة تعيين تتبع الرسائل'
      ]
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      message: 'فشل في الحصول على حالة النظام',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Helper functions
function determineMessageType(status: string): string {
  const cleanStatus = status.trim();
  
  if (cleanStatus === '' || cleanStatus === 'جديد' || cleanStatus === 'طلب جديد' || 
      cleanStatus === 'قيد المراجعة' || cleanStatus === 'قيد المراجعه' || cleanStatus === 'غير محدد') {
    return 'newOrder';
  }
  
  if (cleanStatus === 'لم يتم الرد' || cleanStatus === 'لم يرد' || 
      cleanStatus === 'لا يرد' || cleanStatus === 'عدم الرد') {
    return 'noAnswer';
  }
  
  if (cleanStatus === 'تم التأكيد' || cleanStatus === 'تم التاكيد' || 
      cleanStatus === 'مؤكد' || cleanStatus === 'تم الشحن' || cleanStatus === 'قيد الشحن') {
    return 'shipped';
  }
  
  if (cleanStatus === 'تم الرفض' || cleanStatus === 'مرفوض' || 
      cleanStatus === 'رفض الاستلام' || cleanStatus === 'رفض الأستلام' || 
      cleanStatus === 'لم يتم الاستلام') {
    return 'rejectedOffer';
  }
  
  return 'unknown';
}

function getEnabledStatusForMessageType(messageType: string, enabledStatuses: any): boolean {
  switch (messageType) {
    case 'newOrder': return enabledStatuses.newOrder;
    case 'noAnswer': return enabledStatuses.noAnswer;
    case 'shipped': return enabledStatuses.shipped;
    case 'rejectedOffer': return enabledStatuses.rejectedOffer;
    default: return false;
  }
}

function getMinWaitTimeForMessageType(messageType: string): number {
  switch (messageType) {
    case 'newOrder': return 0.5; // 30 minutes
    case 'noAnswer': return 1; // 1 hour
    case 'shipped': return 4; // 4 hours
    case 'rejectedOffer': return 24; // 24 hours
    default: return 1;
  }
}

function generateProcessingRecommendations(results: any): string[] {
  const recommendations = [];
  
  if (results.messagesQueued > 0) {
    recommendations.push(`✅ تم جدولة ${results.messagesQueued} رسالة للإرسال`);
  }
  
  if (results.errors.length > 0) {
    recommendations.push(`⚠️ حدثت ${results.errors.length} أخطاء أثناء المعالجة - راجع التفاصيل`);
  }
  
  if (results.newOrdersProcessed > 0) {
    recommendations.push(`🆕 تم معالجة ${results.newOrdersProcessed} طلب جديد`);
  }
  
  if (results.statusChangesProcessed > 0) {
    recommendations.push(`🔄 تم معالجة ${results.statusChangesProcessed} تغيير في الحالة`);
  }
  
  if (results.messagesQueued === 0 && results.errors.length === 0) {
    recommendations.push('✅ لا توجد رسائل جديدة للإرسال - النظام محدث');
  }
  
  return recommendations;
} 