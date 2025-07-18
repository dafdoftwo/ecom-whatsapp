import { NextResponse } from 'next/server';
import { NetworkResilienceService } from '@/lib/services/network-resilience';

export async function GET() {
  try {
    console.log('🧪 Testing Network Resilience Service...');
    
    // Test 1: Check service availability
    const healthCheck = await NetworkResilienceService.performHealthCheck();
    console.log('✅ Health check completed:', healthCheck.overall);
    
    // Test 2: Get current statistics
    const stats = NetworkResilienceService.getStats();
    console.log('📊 Current stats:', stats);
    
    // Test 3: Test Google Sheets resilient operation (if configured)
    let sheetsTest = null;
    try {
      const sheetsData = await NetworkResilienceService.getSheetDataResilient();
      sheetsTest = {
        success: true,
        rowCount: sheetsData.length,
        message: 'Google Sheets data fetched successfully with resilience'
      };
      console.log('✅ Google Sheets resilient test passed');
    } catch (error) {
      sheetsTest = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Google Sheets test failed (this is expected if not configured)'
      };
      console.log('⚠️ Google Sheets resilient test failed (expected if not configured)');
    }
    
    // Test 4: Test error handling with a simulated failure
    let errorHandlingTest = null;
    try {
      await NetworkResilienceService.executeWithRetry(
        async () => {
          // Simulate a network error
          const error = new Error('Simulated ECONNRESET error');
          (error as any).code = 'ECONNRESET';
          (error as any).syscall = 'read';
          throw error;
        },
        'Simulated Network Error Test',
        { maxRetries: 2, baseDelayMs: 100 }
      );
      errorHandlingTest = { success: false, message: 'Error handling test should have failed' };
    } catch (error) {
      errorHandlingTest = {
        success: true,
        message: 'Error handling test passed - retries exhausted as expected',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      console.log('✅ Error handling test passed');
    }
    
    // Get updated stats after tests
    const finalStats = NetworkResilienceService.getStats();
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      message: 'Network Resilience Service test completed',
      tests: {
        healthCheck: {
          success: true,
          overall: healthCheck.overall,
          services: healthCheck.services,
          recommendations: healthCheck.recommendations
        },
        sheetsResilience: sheetsTest,
        errorHandling: errorHandlingTest,
        initialStats: stats,
        finalStats: finalStats
      },
      summary: {
        circuitBreakerState: finalStats.circuitBreakerState,
        errorRate: finalStats.totalRetries > 0 ? finalStats.failedRetries / finalStats.totalRetries : 0,
        totalRetries: finalStats.totalRetries,
        testsPassed: [
          healthCheck.overall !== 'critical',
          errorHandlingTest?.success === true
        ].filter(Boolean).length,
        totalTests: 2
      }
    });
    
  } catch (error) {
    console.error('❌ Network resilience test failed:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Network resilience test failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, config } = body;
    
    switch (action) {
      case 'test-retry-logic': {
        console.log('🔄 Testing retry logic with custom config...');
        
        let testResult;
        try {
          await NetworkResilienceService.executeWithRetry(
            async () => {
              throw new Error('Test error for retry logic');
            },
            'Retry Logic Test',
            config || { maxRetries: 3, baseDelayMs: 500 }
          );
          testResult = { success: false, message: 'Test should have failed' };
        } catch (error) {
          testResult = {
            success: true,
            message: 'Retry logic test completed',
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
        
        return NextResponse.json({
          success: true,
          test: 'retry-logic',
          result: testResult,
          stats: NetworkResilienceService.getStats(),
          timestamp: new Date().toISOString()
        });
      }
      
      case 'reset-and-test': {
        console.log('🔄 Resetting stats and running fresh test...');
        
        NetworkResilienceService.resetStats();
        const initialStats = NetworkResilienceService.getStats();
        
        // Run a simple test
        const healthCheck = await NetworkResilienceService.performHealthCheck();
        const finalStats = NetworkResilienceService.getStats();
        
        return NextResponse.json({
          success: true,
          test: 'reset-and-test',
          initialStats,
          healthCheck,
          finalStats,
          timestamp: new Date().toISOString()
        });
      }
      
      default: {
        return NextResponse.json(
          { 
            success: false,
            error: `Unknown action: ${action}`,
            availableActions: ['test-retry-logic', 'reset-and-test']
          },
          { status: 400 }
        );
      }
    }
    
  } catch (error) {
    console.error('❌ Network resilience test action failed:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Network resilience test action failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 