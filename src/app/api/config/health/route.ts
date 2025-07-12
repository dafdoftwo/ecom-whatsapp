import { NextResponse } from 'next/server';
import { ConfigService } from '@/lib/services/config';

export async function GET() {
  try {
    console.log('🔍 Starting configuration health check...');
    
    const health = await ConfigService.getConfigHealth();
    
    const summary = {
      overall: {
        healthy: health.google.configured && health.messages.valid && health.timing.valid && health.statusSettings.valid,
        issues: [] as string[]
      },
      details: health
    };

    // Add specific issues
    if (!health.google.configured) {
      summary.overall.issues.push('Google Sheets configuration is incomplete');
    }
    if (!health.messages.valid) {
      summary.overall.issues.push('Message templates are invalid');
    }
    if (!health.timing.valid) {
      summary.overall.issues.push('Timing configuration is invalid');
    }
    if (!health.statusSettings.valid) {
      summary.overall.issues.push('Status settings are invalid');
    }

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      configHealth: summary
    };

    console.log('✅ Configuration health check completed:', summary);
    
    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ Configuration health check failed:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Configuration health check failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
} 