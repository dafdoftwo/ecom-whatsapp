import { NextResponse } from 'next/server';
import { AutomationEngine } from '@/lib/services/automation-engine';
import { WhatsAppService } from '@/lib/services/whatsapp';
import { GoogleSheetsService } from '@/lib/services/google-sheets';
import { ConfigService } from '@/lib/services/config';
import { QueueService } from '@/lib/services/queue';

export async function GET() {
  try {
    console.log('🔍 Starting comprehensive automation diagnostics...');
    
    const diagnostics = {
      timestamp: new Date().toISOString(),
      overall: { status: 'unknown', issues: [] as string[], blockers: [] as string[] },
      components: {
        automation: { status: 'unknown', details: {} },
        whatsapp: { status: 'unknown', details: {} },
        googleSheets: { status: 'unknown', details: {} },
        configuration: { status: 'unknown', details: {} },
        queue: { status: 'unknown', details: {} }
      },
      recommendations: [] as string[]
    };

    // 1. Test Automation Engine
    try {
      const engineStatus = AutomationEngine.getStatus();
      const performanceStats = AutomationEngine.getPerformanceStats();
      
      diagnostics.components.automation = {
        status: engineStatus.isRunning ? 'healthy' : 'stopped',
        details: {
          isRunning: engineStatus.isRunning,
          lastCheck: engineStatus.lastCheck,
          nextCheck: engineStatus.nextCheck,
          performance: performanceStats
        }
      };

      if (!engineStatus.isRunning) {
        diagnostics.overall.issues.push('⚠️ Automation engine is not running');
      }
    } catch (error) {
      diagnostics.components.automation = {
        status: 'error',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
      diagnostics.overall.blockers.push('❌ Automation engine initialization failed');
    }

    // 2. Test WhatsApp Connection
    try {
      const whatsapp = WhatsAppService.getInstance();
      const status = whatsapp.getStatus();
      const health = whatsapp.getConnectionHealth();
      const sessionInfo = await whatsapp.getDetailedSessionInfo();

      diagnostics.components.whatsapp = {
        status: status.isConnected ? 'healthy' : 'disconnected',
        details: {
          isConnected: status.isConnected,
          sessionExists: status.sessionExists,
          qrCodeAvailable: !!status.qrCode,
          clientInfo: status.clientInfo,
          health: health,
          sessionDetails: sessionInfo
        }
      };

      if (!status.isConnected) {
        if (!status.sessionExists) {
          diagnostics.overall.blockers.push('❌ WhatsApp not connected - needs QR scan');
        } else {
          diagnostics.overall.issues.push('⚠️ WhatsApp session exists but not connected');
        }
      }
    } catch (error) {
      diagnostics.components.whatsapp = {
        status: 'error',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
      diagnostics.overall.blockers.push('❌ WhatsApp service initialization failed');
    }

    // 3. Test Google Sheets Connection
    try {
      const configHealth = await ConfigService.getConfigHealth();
      const sheetsValidation = await GoogleSheetsService.validateConfiguration();
      
      // Try to get sheet data
      let sheetData = [];
      let dataFetchError = null;
      try {
        sheetData = await GoogleSheetsService.getSheetData();
      } catch (error) {
        dataFetchError = error instanceof Error ? error.message : 'Unknown error';
      }

      diagnostics.components.googleSheets = {
        status: sheetsValidation.isValid ? 'healthy' : 'error',
        details: {
          configurationValid: sheetsValidation.isValid,
          errors: sheetsValidation.errors,
          warnings: sheetsValidation.warnings,
          sheetInfo: sheetsValidation.sheetInfo,
          dataCount: sheetData.length,
          dataFetchError
        }
      };

      if (!sheetsValidation.isValid) {
        diagnostics.overall.blockers.push('❌ Google Sheets configuration invalid');
        sheetsValidation.errors.forEach(error => {
          diagnostics.overall.blockers.push(`❌ Google Sheets: ${error}`);
        });
      } else if (sheetData.length === 0) {
        diagnostics.overall.issues.push('⚠️ No data found in Google Sheets');
      }
    } catch (error) {
      diagnostics.components.googleSheets = {
        status: 'error',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
      diagnostics.overall.blockers.push('❌ Google Sheets service failed');
    }

    // 4. Test Configuration
    try {
      const configHealth = await ConfigService.getConfigHealth();
      const allConfigs = await ConfigService.getAllConfigs();

      diagnostics.components.configuration = {
        status: 'healthy',
        details: {
          health: configHealth,
          configs: {
            google: !!allConfigs.google.spreadsheetUrl,
            messages: !!allConfigs.messages.newOrder,
            timing: !!allConfigs.timing.checkIntervalSeconds,
            statusSettings: !!allConfigs.statusSettings.enabledStatuses
          }
        }
      };

      if (!configHealth.google.configured) {
        diagnostics.overall.blockers.push('❌ Google configuration not complete');
      }
    } catch (error) {
      diagnostics.components.configuration = {
        status: 'error',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
      diagnostics.overall.blockers.push('❌ Configuration service failed');
    }

    // 5. Test Queue Service
    try {
      // Try to get queue stats
      let queueStats = null;
      let queueError = null;
      try {
        queueStats = await QueueService.getQueueStats();
      } catch (error) {
        queueError = error instanceof Error ? error.message : 'Unknown error';
      }

      diagnostics.components.queue = {
        status: queueStats ? 'healthy' : 'error',
        details: {
          stats: queueStats,
          error: queueError,
          redisConfig: {
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || '6379',
            passwordSet: !!process.env.REDIS_PASSWORD
          }
        }
      };

      if (!queueStats) {
        diagnostics.overall.issues.push('⚠️ Queue service not working - Redis may be down');
      }
    } catch (error) {
      diagnostics.components.queue = {
        status: 'error',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
      diagnostics.overall.issues.push('⚠️ Queue service test failed');
    }

    // 6. Determine Overall Status
    const hasBlockers = diagnostics.overall.blockers.length > 0;
    const hasIssues = diagnostics.overall.issues.length > 0;

    if (hasBlockers) {
      diagnostics.overall.status = 'blocked';
    } else if (hasIssues) {
      diagnostics.overall.status = 'issues';
    } else {
      diagnostics.overall.status = 'healthy';
    }

    // 7. Generate Recommendations
    if (diagnostics.overall.blockers.length > 0) {
      diagnostics.recommendations.push('🔴 Critical Issues Found - Fix these first:');
      diagnostics.overall.blockers.forEach(blocker => {
        diagnostics.recommendations.push(`  ${blocker}`);
      });
    }

    if (diagnostics.overall.issues.length > 0) {
      diagnostics.recommendations.push('🟡 Issues Found - Should be addressed:');
      diagnostics.overall.issues.forEach(issue => {
        diagnostics.recommendations.push(`  ${issue}`);
      });
    }

    if (diagnostics.overall.status === 'healthy') {
      diagnostics.recommendations.push('✅ All systems are healthy - Automation should work properly');
      diagnostics.recommendations.push('💡 Try starting the automation engine with POST /api/automation/start');
    } else {
      diagnostics.recommendations.push('🔧 Fix the above issues and run diagnostics again');
    }

    // Add specific startup guidance
    if (diagnostics.components.whatsapp.status === 'healthy' || diagnostics.components.whatsapp.status === 'disconnected') {
      const whatsappDetails = diagnostics.components.whatsapp.details as any;
      if (!whatsappDetails.isConnected) {
        diagnostics.recommendations.push('📱 WhatsApp Setup: Use POST /api/whatsapp/initialize to connect');
      }
    }

    if (diagnostics.components.googleSheets.status === 'healthy' || diagnostics.components.googleSheets.status === 'error') {
      const sheetsDetails = diagnostics.components.googleSheets.details as any;
      if (!sheetsDetails.configurationValid) {
        diagnostics.recommendations.push('📊 Google Sheets Setup: Configure Google Sheets access in settings');
      }
    }

    console.log('✅ Automation diagnostics completed');
    console.log(`Status: ${diagnostics.overall.status}`);
    console.log(`Blockers: ${diagnostics.overall.blockers.length}`);
    console.log(`Issues: ${diagnostics.overall.issues.length}`);

    return NextResponse.json({
      success: true,
      diagnostics
    });

  } catch (error) {
    console.error('❌ Diagnostics failed:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to run automation diagnostics',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 