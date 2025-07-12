import { NextResponse } from 'next/server';
import { AutomationEngine } from '@/lib/services/automation-engine';

export async function GET() {
  try {
    // Get empty status statistics
    const emptyStatusStats = AutomationEngine.getEmptyStatusStats();

    return NextResponse.json({
      success: true,
      message: 'تم جلب إحصائيات الحالات الفارغة بنجاح',
      data: {
        emptyStatusHandling: {
          enabled: true,
          treatEmptyAsNew: true,
          description: 'الحالات الفارغة تُعامل تلقائياً كطلبات جديدة'
        },
        statistics: emptyStatusStats,
        supportedActions: [
          'reset-tracking',
          'detect-and-process'
        ]
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting empty status info:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'فشل في جلب معلومات الحالات الفارغة',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    // Reset empty status tracking
      AutomationEngine.resetEmptyStatusTracking();

      return NextResponse.json({
        success: true,
      message: 'تم إعادة تعيين تتبع الحالات الفارغة بنجاح',
      action: 'reset-tracking',
          timestamp: new Date().toISOString()
      });
  } catch (error) {
    console.error('Error resetting empty status tracking:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'فشل في إعادة تعيين تتبع الحالات الفارغة',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 