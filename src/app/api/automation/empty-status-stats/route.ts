import { NextResponse } from 'next/server';
import { AutomationEngine } from '@/lib/services/automation-engine';

export async function GET() {
  try {
    // Get empty status statistics
    const stats = AutomationEngine.getEmptyStatusStats();
    
    // Get duplicate prevention stats
    const duplicateStats = AutomationEngine.getDuplicatePreventionStats();
    
    return NextResponse.json({
      success: true,
      emptyStatusStats: stats,
      duplicatePreventionStats: duplicateStats,
      summary: {
        totalEmptyStatusTracked: stats.emptyStatusTracking.totalTracked,
        emptyStatusWithMessages: stats.emptyStatusTracking.withMessages,
        totalDuplicatesPrevented: duplicateStats.totalPrevented,
        duplicatesPreventedForNewOrders: duplicateStats.preventedByType.newOrder || 0
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting empty status stats:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'فشل في الحصول على الإحصائيات',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 