import { NextResponse } from 'next/server';
import { GoogleSheetsService } from '@/lib/services/google-sheets';
import { AutomationEngine } from '@/lib/services/automation-engine';
import { ConfigService } from '@/lib/services/config';

export async function POST() {
  try {
    console.log('🧪 TEST: Starting status change detection test...');
    
    // Get current sheet data
    const sheetData = await GoogleSheetsService.getSheetData();
    
    if (!sheetData || sheetData.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No data found in Google Sheets',
        totalOrders: 0
      });
    }

    // Get current status history from automation engine
    const currentStatusHistory = AutomationEngine.getStatusHistory();
    
    // Get message templates
    const { templates } = await ConfigService.getMessageTemplates();
    
    // Analyze orders for potential status changes
    const analysisResults = [];
    let newOrdersDetected = 0;
    let statusChangesDetected = 0;
    let potentialMissedMessages = 0;
    
    for (const row of sheetData) {
      if (!row.orderId || !row.name || !row.phone) continue;
      
      const orderId = row.orderId;
      const currentStatus = (row.orderStatus || '').trim();
      const previousStatusData = currentStatusHistory.get(orderId);
      
      const analysis = {
        orderId,
        customerName: row.name,
        phone: row.phone,
        currentStatus,
        previousStatus: previousStatusData?.status || null,
        isNewOrder: !previousStatusData,
        statusChanged: previousStatusData && previousStatusData.status !== currentStatus,
        timeSinceLastUpdate: previousStatusData ? 
          Math.round((Date.now() - previousStatusData.timestamp) / 1000 / 60) : null,
        messageType: determineMessageType(currentStatus),
        shouldProcessMessage: false,
        reason: ''
      };

      // Determine if this order should trigger a message
      if (analysis.isNewOrder) {
        newOrdersDetected++;
        analysis.shouldProcessMessage = true;
        analysis.reason = 'طلب جديد - لم يتم معالجته من قبل';
      } else if (analysis.statusChanged) {
        statusChangesDetected++;
        analysis.shouldProcessMessage = true;
        analysis.reason = `تغيير في الحالة: "${analysis.previousStatus}" → "${analysis.currentStatus}"`;
      } else {
        analysis.reason = 'لا يوجد تغيير في الحالة';
      }

      // Check for potentially missed messages
      if (analysis.shouldProcessMessage) {
        const sentMessages = AutomationEngine.getSentMessages();
        const messageKey = `${orderId}_${analysis.messageType}`;
        
        if (sentMessages.has(messageKey)) {
          const lastSentTime = sentMessages.get(messageKey)?.timestamp || 0;
          const hoursSinceLastSent = (Date.now() - lastSentTime) / (1000 * 60 * 60);
          
          if (hoursSinceLastSent < 0.5) { // Less than 30 minutes
            analysis.shouldProcessMessage = false;
            analysis.reason += ' - لكن تم إرسال رسالة مؤخراً';
          } else {
            potentialMissedMessages++;
            analysis.reason += ` - يمكن إعادة الإرسال (آخر رسالة منذ ${hoursSinceLastSent.toFixed(1)} ساعة)`;
          }
        } else {
          potentialMissedMessages++;
          analysis.reason += ' - لم يتم إرسال رسالة من قبل';
        }
      }

      analysisResults.push(analysis);
    }

    // Summary statistics
    const summary = {
      totalOrders: sheetData.length,
      newOrdersDetected,
      statusChangesDetected,
      potentialMissedMessages,
      ordersRequiringAction: analysisResults.filter(r => r.shouldProcessMessage).length
    };

    // Get recent orders that might need attention
    const recentChanges = analysisResults
      .filter(r => r.shouldProcessMessage)
      .sort((a, b) => (b.timeSinceLastUpdate || 0) - (a.timeSinceLastUpdate || 0))
      .slice(0, 10);

    return NextResponse.json({
      success: true,
      message: 'Status change detection test completed',
      timestamp: new Date().toISOString(),
      summary,
      recentChanges,
      recommendations: generateRecommendations(summary, recentChanges),
      fullAnalysis: analysisResults.length > 50 ? 
        `تم تحليل ${analysisResults.length} طلب - عرض أول 50 فقط` : 
        analysisResults.slice(0, 50)
    });

  } catch (error) {
    console.error('❌ Status change detection test failed:', error);
    
    return NextResponse.json({
      success: false,
      message: 'فشل في اختبار اكتشاف تغييرات الحالات',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    // Get current automation engine statistics
    const stats = await AutomationEngine.getDetailedStats();
    const duplicateStats = AutomationEngine.getDuplicatePreventionStats();
    const newOrderStats = AutomationEngine.getNewOrderMessageStats();
    
    return NextResponse.json({
      success: true,
      message: 'Current automation engine status',
      timestamp: new Date().toISOString(),
      automationStats: stats,
      duplicatePreventionStats: duplicateStats,
      newOrderMessageStats: newOrderStats,
      recommendations: [
        'استخدم POST /api/automation/test-status-changes لاختبار اكتشاف التغييرات',
        'استخدم POST /api/automation/force-process-new-orders لمعالجة الطلبات الجديدة',
        'استخدم POST /api/automation/reset-tracking لإعادة تعيين تتبع الرسائل'
      ]
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      message: 'فشل في الحصول على إحصائيات النظام',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Helper function to determine message type based on status
function determineMessageType(status: string): string {
  const cleanStatus = status.trim();
  
  // New order statuses
  if (cleanStatus === '' || cleanStatus === 'جديد' || cleanStatus === 'طلب جديد' || 
      cleanStatus === 'قيد المراجعة' || cleanStatus === 'قيد المراجعه' || cleanStatus === 'غير محدد') {
    return 'newOrder';
  }
  
  // No answer statuses
  if (cleanStatus === 'لم يتم الرد' || cleanStatus === 'لم يرد' || 
      cleanStatus === 'لا يرد' || cleanStatus === 'عدم الرد') {
    return 'noAnswer';
  }
  
  // Confirmed/Shipped statuses
  if (cleanStatus === 'تم التأكيد' || cleanStatus === 'تم التاكيد' || 
      cleanStatus === 'مؤكد' || cleanStatus === 'تم الشحن' || cleanStatus === 'قيد الشحن') {
    return 'shipped';
  }
  
  // Rejected statuses
  if (cleanStatus === 'تم الرفض' || cleanStatus === 'مرفوض' || 
      cleanStatus === 'رفض الاستلام' || cleanStatus === 'رفض الأستلام' || 
      cleanStatus === 'لم يتم الاستلام') {
    return 'rejectedOffer';
  }
  
  return 'unknown';
}

// Helper function to generate recommendations
function generateRecommendations(summary: any, recentChanges: any[]): string[] {
  const recommendations = [];
  
  if (summary.potentialMissedMessages > 0) {
    recommendations.push(`🚨 يوجد ${summary.potentialMissedMessages} رسالة محتملة لم يتم إرسالها`);
    recommendations.push('استخدم POST /api/automation/force-process-new-orders لمعالجة الطلبات الجديدة');
  }
  
  if (summary.statusChangesDetected > 0) {
    recommendations.push(`📝 تم اكتشاف ${summary.statusChangesDetected} تغيير في الحالات`);
    recommendations.push('تأكد من تشغيل نظام الأتمتة لمعالجة هذه التغييرات');
  }
  
  if (summary.newOrdersDetected > 0) {
    recommendations.push(`🆕 يوجد ${summary.newOrdersDetected} طلب جديد`);
    recommendations.push('سيتم معالجة الطلبات الجديدة تلقائياً في الدورة التالية');
  }
  
  if (recentChanges.length > 5) {
    recommendations.push('🔄 يوجد عدد كبير من التغييرات الحديثة - راجع القائمة أعلاه');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('✅ النظام يعمل بشكل طبيعي - لا توجد مشاكل مكتشفة');
  }
  
  return recommendations;
} 