import { NextResponse } from 'next/server';
import { AutomationEngine } from '@/lib/services/automation-engine';

export async function POST() {
  try {
    console.log('🔧 API: Force processing new orders requested...');
    
    // Check if automation engine is running
    const status = AutomationEngine.getStatus();
    if (!status.isRunning) {
      return NextResponse.json({
        success: false,
        error: 'Automation engine is not running. Please start it first.',
        arabicError: 'محرك الأتمتة غير مُشغل. يرجى تشغيله أولاً.'
      }, { status: 400 });
    }

    // Force process new orders
    const result = await AutomationEngine.forceProcessNewOrders();
    
    return NextResponse.json({
      success: result.success,
      message: result.success 
        ? 'Force processing completed successfully' 
        : 'Force processing completed with errors',
      arabicMessage: result.success 
        ? 'تمت المعالجة القسرية بنجاح' 
        : 'تمت المعالجة القسرية مع وجود أخطاء',
      result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error in force processing new orders:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to force process new orders',
      arabicError: 'فشل في المعالجة القسرية للطلبات الجديدة',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 