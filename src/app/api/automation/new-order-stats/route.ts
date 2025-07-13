import { NextResponse } from 'next/server';
import { AutomationEngine } from '@/lib/services/automation-engine';

export async function GET() {
  try {
    // Get new order message statistics
    const stats = AutomationEngine.getNewOrderMessageStats();
    
    // Get general status
    const engineStatus = AutomationEngine.getStatus();
    
    return NextResponse.json({
      success: true,
      engineStatus: {
        isRunning: engineStatus.isRunning,
        lastCheck: engineStatus.lastCheck,
        nextCheck: engineStatus.nextCheck
      },
      newOrderStats: stats,
      summary: {
        totalNewOrderMessages: stats.totalNewOrderMessages,
        recentMessages: stats.recentNewOrders.length,
        oldestMessage: stats.recentNewOrders.length > 0 
          ? stats.recentNewOrders[stats.recentNewOrders.length - 1].timestamp 
          : 'لا توجد رسائل',
        newestMessage: stats.recentNewOrders.length > 0 
          ? stats.recentNewOrders[0].timestamp 
          : 'لا توجد رسائل'
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error getting new order stats:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get new order statistics',
      arabicError: 'فشل في الحصول على إحصائيات الطلبات الجديدة',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 