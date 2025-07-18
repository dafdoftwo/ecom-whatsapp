import { NextResponse } from 'next/server';
import { AutomationEngine } from '@/lib/services/automation-engine';
import { NetworkResilienceService } from '@/lib/services/network-resilience';

export async function POST() {
  try {
    console.log('🚀 Starting automation engine with network resilience...');
    
    // First, reset network resilience stats
    NetworkResilienceService.resetStats();
    console.log('✅ Network resilience stats reset');
    
    // Check system health before starting
    const healthCheck = await NetworkResilienceService.performHealthCheck();
    console.log(`🔍 System health check: ${healthCheck.overall}`);
    
    if (healthCheck.overall === 'critical') {
      return NextResponse.json({
        success: false,
        error: 'System health is critical',
        healthCheck,
        message: 'Cannot start automation with critical system health'
      }, { status: 500 });
    }
    
    // Start the automation engine
    console.log('🔄 Starting automation engine...');
    await AutomationEngine.start();
    
    // Get final status
    const finalStatus = AutomationEngine.getStatus();
    const resilienceStats = NetworkResilienceService.getStats();
    
    console.log('✅ Automation engine started with network resilience');
    
    return NextResponse.json({
      success: true,
      message: 'Automation engine started successfully with network resilience',
      status: finalStatus,
      networkResilience: {
        circuitBreakerState: resilienceStats.circuitBreakerState,
        totalRetries: resilienceStats.totalRetries,
        errorsByType: resilienceStats.errorsByType
      },
      systemHealth: healthCheck.overall,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to start automation engine with resilience:', error);
    
    const resilienceStats = NetworkResilienceService.getStats();
    
    return NextResponse.json({
      success: false,
      error: 'Failed to start automation engine with resilience',
      details: error instanceof Error ? error.message : 'Unknown error',
      networkResilience: {
        circuitBreakerState: resilienceStats.circuitBreakerState,
        totalRetries: resilienceStats.totalRetries,
        errorsByType: resilienceStats.errorsByType,
        lastError: resilienceStats.lastError
      },
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 