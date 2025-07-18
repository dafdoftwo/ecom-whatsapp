import { NextResponse } from 'next/server';
import { NetworkResilienceService } from '@/lib/services/network-resilience';

export async function GET() {
  try {
    console.log('🔍 Performing comprehensive network health check...');
    
    const healthCheck = await NetworkResilienceService.performHealthCheck();
    const resilienceStats = NetworkResilienceService.getStats();
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      healthCheck,
      resilienceStats,
      message: `Overall system health: ${healthCheck.overall}`
    });
    
  } catch (error) {
    console.error('❌ Network health check failed:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Network health check failed',
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
    const { action } = body;
    
    switch (action) {
      case 'reset-stats': {
        NetworkResilienceService.resetStats();
        return NextResponse.json({
          success: true,
          message: 'Network resilience statistics reset successfully',
          timestamp: new Date().toISOString()
        });
      }
      
      default: {
        return NextResponse.json(
          { 
            success: false,
            error: `Unknown action: ${action}`,
            availableActions: ['reset-stats']
          },
          { status: 400 }
        );
      }
    }
    
  } catch (error) {
    console.error('❌ Network health action failed:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Network health action failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 