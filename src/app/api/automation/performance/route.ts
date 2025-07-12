import { NextResponse } from 'next/server';
import { AutomationEngine } from '@/lib/services/automation-engine';

export async function GET() {
  try {
    // Get performance statistics from the optimized engine
    const performanceStats = AutomationEngine.getPerformanceStats();
    
    // Calculate efficiency metrics
    const efficiency = {
      cacheEfficiency: performanceStats.cacheHitRatio * 100,
      processingSpeed: performanceStats.avgProcessingTime ? Math.round(1000 / performanceStats.avgProcessingTime) : 0, // cycles per second
      apiCallReduction: performanceStats.cacheHits > 0 ? ((performanceStats.cacheHits / (performanceStats.cacheHits + performanceStats.whatsappApiCalls)) * 100) : 0,
      duplicatePreventionEfficiency: performanceStats.duplicatePreventionStats.totalDuplicatesPrevented
    };

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      performance: {
        processing: {
          lastProcessingTime: performanceStats.lastProcessingTime,
          averageProcessingTime: Math.round(performanceStats.avgProcessingTime),
          totalProcessingCycles: performanceStats.totalProcessingCycles,
          processingSpeed: `${efficiency.processingSpeed} cycles/sec`
        },
        cache: {
          size: performanceStats.cacheSize,
          hits: performanceStats.cacheHits,
          misses: performanceStats.cacheMisses,
          hitRatio: `${efficiency.cacheEfficiency.toFixed(2)}%`,
          efficiency: efficiency.cacheEfficiency >= 80 ? 'excellent' : efficiency.cacheEfficiency >= 60 ? 'good' : 'needs_improvement'
        },
        whatsappApi: {
          totalCalls: performanceStats.whatsappApiCalls,
          callReduction: `${efficiency.apiCallReduction.toFixed(2)}%`,
          optimization: efficiency.apiCallReduction >= 70 ? 'excellent' : efficiency.apiCallReduction >= 50 ? 'good' : 'needs_improvement'
        },
        duplicatePrevention: {
          totalPrevented: performanceStats.duplicatePreventionStats.totalDuplicatesPrevented,
          preventedByType: performanceStats.duplicatePreventionStats.duplicatesPreventedByType,
          efficiency: efficiency.duplicatePreventionEfficiency > 0 ? 'active' : 'inactive'
        }
      },
      recommendations: generatePerformanceRecommendations(performanceStats, efficiency),
      status: calculatePerformanceStatus(efficiency)
    });
  } catch (error) {
    console.error('Error getting performance stats:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'فشل في جلب إحصائيات الأداء',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    // Clear caches for performance testing
    AutomationEngine.clearCaches();
    
    return NextResponse.json({
      success: true,
      message: 'تم مسح جميع الذاكرة المؤقتة بنجاح',
      action: 'caches_cleared',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error clearing caches:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'فشل في مسح الذاكرة المؤقتة',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

function generatePerformanceRecommendations(stats: any, efficiency: any): string[] {
  const recommendations = [];

  if (efficiency.cacheEfficiency < 60) {
    recommendations.push('❗ نسبة نجاح الذاكرة المؤقتة منخفضة - يُنصح بزيادة فترة انتهاء الصلاحية');
  }

  if (efficiency.processingSpeed < 1) {
    recommendations.push('❗ سرعة المعالجة بطيئة - تحقق من أداء قاعدة البيانات والشبكة');
  }

  if (efficiency.apiCallReduction < 50) {
    recommendations.push('❗ يمكن تحسين تقليل استدعاءات API - تحقق من إعدادات الذاكرة المؤقتة');
  }

  if (stats.cacheSize > 1000) {
    recommendations.push('⚠️ حجم الذاكرة المؤقتة كبير - فكر في تقليل فترة انتهاء الصلاحية');
  }

  if (stats.avgProcessingTime > 10000) {
    recommendations.push('⚠️ متوسط وقت المعالجة طويل - تحقق من استدعاءات API البطيئة');
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ الأداء ممتاز - لا توجد توصيات للتحسين');
  }

  return recommendations;
}

function calculatePerformanceStatus(efficiency: any): string {
  let score = 0;
  
  if (efficiency.cacheEfficiency >= 80) score += 30;
  else if (efficiency.cacheEfficiency >= 60) score += 20;
  else if (efficiency.cacheEfficiency >= 40) score += 10;
  
  if (efficiency.processingSpeed >= 5) score += 25;
  else if (efficiency.processingSpeed >= 2) score += 15;
  else if (efficiency.processingSpeed >= 1) score += 10;
  
  if (efficiency.apiCallReduction >= 70) score += 25;
  else if (efficiency.apiCallReduction >= 50) score += 15;
  else if (efficiency.apiCallReduction >= 30) score += 10;
  
  if (efficiency.duplicatePreventionEfficiency > 0) score += 20;
  
  if (score >= 90) return 'ممتاز';
  if (score >= 70) return 'جيد';
  if (score >= 50) return 'مقبول';
  return 'يحتاج تحسين';
} 