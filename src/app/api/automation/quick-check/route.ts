import { NextResponse } from 'next/server';
import { AutomationEngine } from '@/lib/services/automation-engine';
import { WhatsAppService } from '@/lib/services/whatsapp';
import { GoogleSheetsService } from '@/lib/services/google-sheets';
import { ConfigService } from '@/lib/services/config';

export async function GET() {
  try {
    console.log('⚡ Running quick system check...');
    
    const quickCheck = {
      timestamp: new Date().toISOString(),
      ready: false,
      status: 'checking',
      issues: [] as string[],
      recommendations: [] as string[],
      components: {
        automation: { ready: false, status: 'unknown' },
        whatsapp: { ready: false, status: 'unknown' },
        googleSheets: { ready: false, status: 'unknown' },
        configuration: { ready: false, status: 'unknown' }
      }
    };

    // Quick automation check
    try {
      const engineStatus = AutomationEngine.getStatus();
      quickCheck.components.automation = {
        ready: engineStatus.isRunning,
        status: engineStatus.isRunning ? 'running' : 'stopped'
      };
      
      if (!engineStatus.isRunning) {
        quickCheck.issues.push('❌ Automation engine is not running');
        quickCheck.recommendations.push('🚀 Start automation: POST /api/automation/reliable-start');
      }
    } catch (error) {
      quickCheck.components.automation = { ready: false, status: 'error' };
      quickCheck.issues.push('❌ Automation engine error');
    }

    // Quick WhatsApp check
    try {
      const whatsapp = WhatsAppService.getInstance();
      const status = whatsapp.getStatus();
      quickCheck.components.whatsapp = {
        ready: status.isConnected,
        status: status.isConnected ? 'connected' : (status.sessionExists ? 'session_exists' : 'disconnected')
      };
      
      if (!status.isConnected) {
        if (!status.sessionExists) {
          quickCheck.issues.push('📱 WhatsApp needs QR scan');
          quickCheck.recommendations.push('📱 Connect WhatsApp: POST /api/whatsapp/initialize');
        } else {
          quickCheck.issues.push('📱 WhatsApp session exists but not connected');
          quickCheck.recommendations.push('🔄 Reconnect WhatsApp: POST /api/whatsapp/initialize');
        }
      }
    } catch (error) {
      quickCheck.components.whatsapp = { ready: false, status: 'error' };
      quickCheck.issues.push('❌ WhatsApp service error');
    }

    // Quick Google Sheets check
    try {
      const sheetsValidation = await GoogleSheetsService.validateConfiguration();
      quickCheck.components.googleSheets = {
        ready: sheetsValidation.isValid,
        status: sheetsValidation.isValid ? 'configured' : 'invalid'
      };
      
      if (!sheetsValidation.isValid) {
        quickCheck.issues.push('📊 Google Sheets not configured');
        quickCheck.recommendations.push('📊 Configure Google Sheets in settings');
      }
    } catch (error) {
      quickCheck.components.googleSheets = { ready: false, status: 'error' };
      quickCheck.issues.push('❌ Google Sheets service error');
    }

    // Quick configuration check
    try {
      const configHealth = await ConfigService.getConfigHealth();
      quickCheck.components.configuration = {
        ready: configHealth.google.configured && configHealth.messages.valid,
        status: configHealth.google.configured && configHealth.messages.valid ? 'valid' : 'incomplete'
      };
      
      if (!configHealth.google.configured) {
        quickCheck.issues.push('⚙️ Google configuration incomplete');
      }
      if (!configHealth.messages.valid) {
        quickCheck.issues.push('💬 Message templates invalid');
      }
    } catch (error) {
      quickCheck.components.configuration = { ready: false, status: 'error' };
      quickCheck.issues.push('❌ Configuration service error');
    }

    // Determine overall readiness
    const allReady = Object.values(quickCheck.components).every(comp => comp.ready);
    quickCheck.ready = allReady;
    quickCheck.status = allReady ? 'ready' : 'needs_attention';

    if (allReady) {
      quickCheck.recommendations.push('✅ System is ready! All components working correctly.');
      if (!quickCheck.components.automation.ready) {
        quickCheck.recommendations.push('🚀 Start automation: POST /api/automation/reliable-start');
      }
    } else {
      quickCheck.recommendations.unshift('🔧 Fix the issues listed above to make system ready');
    }

    // Add quick action recommendations
    if (quickCheck.issues.length > 0) {
      quickCheck.recommendations.push('🔍 For detailed analysis: GET /api/automation/diagnostics');
    }

    console.log(`⚡ Quick check completed: ${allReady ? 'READY' : 'NEEDS ATTENTION'}`);
    console.log(`Issues: ${quickCheck.issues.length}`);

    return NextResponse.json({
      success: true,
      quickCheck
    });

  } catch (error) {
    console.error('❌ Quick check failed:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Quick system check failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        quickCheck: {
          ready: false,
          status: 'error',
          issues: ['❌ System check failed'],
          recommendations: ['🔍 Run detailed diagnostics: GET /api/automation/diagnostics']
        }
      },
      { status: 500 }
    );
  }
} 