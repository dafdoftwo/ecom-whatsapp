import { NextResponse } from 'next/server';
import { AutomationEngine } from '@/lib/services/automation-engine';

export async function GET() {
  try {
    // Get duplicate prevention statistics
    const stats = AutomationEngine.getDuplicatePreventionStats();
    
    return NextResponse.json({
      success: true,
      message: 'تم جلب إحصائيات منع التكرار بنجاح',
      data: {
        summary: {
          title: 'إحصائيات منع التكرار الشاملة',
          totalDuplicatesPrevented: stats.totalPrevented,
          efficiency: stats.efficiency,
          status: stats.totalPrevented === 0 ? 'لا توجد محاولات تكرار' : 'نظام منع التكرار يعمل بكفاءة'
        },
        detailedStats: {
          preventedByMessageType: stats.preventedByType,
          recentAttempts: stats.recentAttempts
        },
        protectionMechanisms: {
          newOrderProtection: {
            description: 'منع تكرار رسائل الطلبات الجديدة (شامل الحالات الفارغة)',
            keyFormat: '${orderId}_newOrder',
            prevented: stats.preventedByType.newOrder
          },
          noAnswerProtection: {
            description: 'منع تكرار رسائل عدم الرد',
            keyFormat: '${orderId}_noAnswer',
            prevented: stats.preventedByType.noAnswer
          },
          shippedProtection: {
            description: 'منع تكرار رسائل الشحن والتأكيد',
            keyFormat: '${orderId}_shipped',
            prevented: stats.preventedByType.shipped
          },
          rejectedOfferProtection: {
            description: 'منع تكرار العروض الخاصة للطلبات المرفوضة',
            keyFormat: '${orderId}_rejectedOffer',
            prevented: stats.preventedByType.rejectedOffer
          },
          reminderProtection: {
            description: 'منع تكرار رسائل التذكير',
            keyFormat: 'reminder_${orderId}',
            prevented: stats.preventedByType.reminder
          }
        },
        recommendations: generateRecommendations(stats)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting duplicate prevention stats:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'فشل في جلب إحصائيات منع التكرار',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

function generateRecommendations(stats: any): string[] {
  const recommendations = [];
  
  if (stats.totalPrevented === 0) {
    recommendations.push('✅ ممتاز! لا توجد محاولات تكرار - النظام يعمل بكفاءة عالية');
    recommendations.push('💡 استمر في المراقبة للتأكد من عدم حدوث تكرار في المستقبل');
  } else {
    recommendations.push(`📊 تم منع ${stats.totalPrevented} رسالة مكررة - النظام يعمل بكفاءة ${stats.efficiency}`);
    
    // Check which message types have most duplicates
    const sortedTypes = Object.entries(stats.preventedByType)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .filter(([,count]) => (count as number) > 0);
    
    if (sortedTypes.length > 0) {
      const [topType, topCount] = sortedTypes[0];
      recommendations.push(`⚠️ أكثر أنواع الرسائل تكراراً: ${topType} (${topCount} مرة)`);
      
      if (topType === 'newOrder') {
        recommendations.push('💡 قد يكون سبب تكرار رسائل الطلبات الجديدة هو تغيير متكرر في الحالات الفارغة');
      } else if (topType === 'reminder') {
        recommendations.push('💡 تكرار التذكيرات قد يشير إلى حاجة لضبط مدة التذكير');
      }
    }
  }
  
  recommendations.push('🔒 جميع آليات منع التكرار نشطة ومحدثة');
  recommendations.push('📈 يمكن مراقبة الإحصائيات من خلال هذا الـ API');
  
  return recommendations;
} 