import { NextResponse } from 'next/server';
import { AutomationEngine } from '@/lib/services/automation-engine';
import { ConfigService } from '@/lib/services/config';
import { WhatsAppService } from '@/lib/services/whatsapp';
import { GoogleSheetsService } from '@/lib/services/google-sheets';
import { QueueService } from '@/lib/services/queue';

export async function GET() {
  try {
    console.log('🔍 Starting comprehensive automation diagnostics...');

    // 1. Check timing configuration
    const timingConfig = await ConfigService.getTimingConfig();
    console.log('⏰ Timing configuration:', timingConfig);

    // 2. Check WhatsApp status
    const whatsapp = WhatsAppService.getInstance();
    const whatsappStatus = whatsapp.getStatus();
    const whatsappHealth = whatsapp.getConnectionHealth();
    console.log('📱 WhatsApp status:', { isConnected: whatsappStatus.isConnected, health: whatsappHealth });

    // 3. Check Google Sheets configuration
    let googleSheetsStatus: { configured: boolean; accessible: boolean; error: string | null } = { configured: false, accessible: false, error: null };
    try {
      const validation = await GoogleSheetsService.validateConfiguration();
      googleSheetsStatus = {
        configured: validation.isValid,
        accessible: validation.isValid,
        error: validation.errors.join(', ') || null
      };
    } catch (error) {
      googleSheetsStatus.error = error instanceof Error ? error.message : 'Unknown error';
    }
    console.log('📊 Google Sheets status:', googleSheetsStatus);

    // 4. Check Queue Service status
    let queueStatus: { initialized: boolean; error: string | null } = { initialized: false, error: null };
    try {
      await QueueService.initialize();
      queueStatus.initialized = true;
    } catch (error) {
      queueStatus.error = error instanceof Error ? error.message : 'Unknown error';
    }
    console.log('📬 Queue status:', queueStatus);

    // 5. Check if automation engine is running
    const automationRunning = await AutomationEngine.getStatus();
    console.log('🤖 Automation engine status:', automationRunning);

    // 6. Calculate expected processing time
    const expectedNextCheck = timingConfig.checkIntervalSeconds;
    const nextCheckTime = new Date(Date.now() + (expectedNextCheck * 1000)).toISOString();

    // 7. Identify potential issues
    const issues = [];
    const recommendations = [];

    if (!automationRunning.isRunning) {
      issues.push('Automation engine is not running');
      recommendations.push('Start the automation engine using /api/automation/start');
    }

    if (!whatsappStatus.isConnected) {
      issues.push('WhatsApp is not connected');
      recommendations.push('Initialize WhatsApp connection using /api/whatsapp/initialize');
    }

    if (!googleSheetsStatus.configured) {
      issues.push('Google Sheets not configured');
      recommendations.push('Configure Google Sheets credentials in settings');
    }

    if (!queueStatus.initialized) {
      issues.push('Queue service not initialized');
      recommendations.push('Check Redis connection and configuration');
    }

    if (timingConfig.checkIntervalSeconds > 300) {
      issues.push(`Check interval is very long (${timingConfig.checkIntervalSeconds} seconds)`);
      recommendations.push('Consider reducing check interval to 30-60 seconds for faster processing');
    }

    // 8. System health score
    let healthScore = 100;
    if (!automationRunning.isRunning) healthScore -= 40;
    if (!whatsappStatus.isConnected) healthScore -= 30;
    if (!googleSheetsStatus.configured) healthScore -= 20;
    if (!queueStatus.initialized) healthScore -= 10;

    const healthStatus = healthScore >= 90 ? 'excellent' : 
                        healthScore >= 70 ? 'good' : 
                        healthScore >= 50 ? 'warning' : 'critical';

    const diagnostics = {
      timestamp: new Date().toISOString(),
      systemHealth: {
        score: healthScore,
        status: healthStatus,
        issues: issues.length,
        recommendations: recommendations.length
      },
      components: {
        automationEngine: {
          isRunning: automationRunning.isRunning,
          status: automationRunning.isRunning ? 'running' : 'stopped'
        },
        whatsapp: {
          isConnected: whatsappStatus.isConnected,
          health: whatsappHealth,
          status: whatsappStatus.isConnected ? 'connected' : 'disconnected'
        },
        googleSheets: googleSheetsStatus,
        queueService: queueStatus,
        timing: {
          checkIntervalSeconds: timingConfig.checkIntervalSeconds,
          reminderDelayHours: timingConfig.reminderDelayHours,
          rejectedOfferDelayHours: timingConfig.rejectedOfferDelayHours,
          expectedNextCheck: nextCheckTime
        }
      },
      issues,
      recommendations,
      quickActions: [
        {
          action: 'start_automation',
          url: '/api/automation/start',
          description: 'Start the automation engine',
          needed: !automationRunning.isRunning
        },
        {
          action: 'connect_whatsapp',
          url: '/api/whatsapp/initialize',
          description: 'Initialize WhatsApp connection',
          needed: !whatsappStatus.isConnected
        },
        {
          action: 'test_system',
          url: '/api/automation/test',
          description: 'Run a test automation cycle',
          needed: issues.length > 0
        }
      ]
    };

    console.log(`✅ Diagnostics complete. System health: ${healthStatus} (${healthScore}/100)`);

    return NextResponse.json({
      success: true,
      message: `System diagnostics completed. Health: ${healthStatus}`,
      diagnostics
    });

  } catch (error) {
    console.error('❌ Diagnostics failed:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to run system diagnostics',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 