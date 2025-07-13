import { NextResponse } from 'next/server';
import { WhatsAppService } from '@/lib/services/whatsapp';
import { ConfigService } from '@/lib/services/config';
import { GoogleSheetsService } from '@/lib/services/google-sheets';
import { AutomationEngine } from '@/lib/services/automation-engine';

export async function GET() {
  try {
    console.log('🏥 Starting comprehensive system health check...');
    
    const healthReport = {
      timestamp: new Date().toISOString(),
      overall: 'checking',
      services: {
        whatsapp: { status: 'checking', details: {} },
        googleSheets: { status: 'checking', details: {} },
        automationEngine: { status: 'checking', details: {} },
        configuration: { status: 'checking', details: {} }
      },
      recommendations: [] as string[],
      criticalIssues: [] as string[],
      warnings: [] as string[]
    };

    // 1. Check WhatsApp Service
    try {
      console.log('📱 Checking WhatsApp service...');
      const whatsapp = WhatsAppService.getInstance();
      const whatsappStatus = whatsapp.getStatus();
      const whatsappHealth = whatsapp.getConnectionHealth();
      
      healthReport.services.whatsapp = {
        status: whatsappStatus.isConnected ? 'healthy' : 'degraded',
        details: {
          isConnected: whatsappStatus.isConnected,
          sessionExists: whatsappStatus.sessionExists,
          hasQRCode: !!whatsappStatus.qrCode,
          sessionHealth: whatsappHealth.sessionHealth,
          reconnectAttempts: whatsappHealth.reconnectAttempts,
          browserRestarts: whatsappHealth.browserRestarts,
          totalUptime: whatsappHealth.totalUptime
        }
      };

      if (!whatsappStatus.isConnected) {
        if (whatsappStatus.qrCode) {
          healthReport.recommendations.push('WhatsApp QR Code is available - scan to connect');
        } else if (whatsappHealth.sessionHealth === 'critical') {
          healthReport.criticalIssues.push('WhatsApp session is corrupted - clear session recommended');
          healthReport.recommendations.push('Clear WhatsApp session and reinitialize');
        } else {
          healthReport.recommendations.push('Initialize WhatsApp connection');
        }
      }

      if (whatsappHealth.reconnectAttempts > 3) {
        healthReport.warnings.push(`Multiple WhatsApp reconnection attempts: ${whatsappHealth.reconnectAttempts}`);
      }

    } catch (error) {
      healthReport.services.whatsapp.status = 'error';
      healthReport.services.whatsapp.details = { error: error instanceof Error ? error.message : 'Unknown error' };
      healthReport.criticalIssues.push('WhatsApp service error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }

    // 2. Check Google Sheets
    try {
      console.log('📊 Checking Google Sheets service...');
      const googleConfig = await ConfigService.getGoogleConfig();
      
      if (!googleConfig.spreadsheetUrl || !googleConfig.credentials || Object.keys(googleConfig.credentials).length === 0) {
        healthReport.services.googleSheets = {
          status: 'not_configured',
          details: {
            hasSpreadsheetUrl: !!googleConfig.spreadsheetUrl,
            hasCredentials: !!googleConfig.credentials && Object.keys(googleConfig.credentials).length > 0,
            error: 'Google Sheets configuration missing'
          }
        };
        healthReport.criticalIssues.push('Google Sheets not configured');
        healthReport.recommendations.push('Configure Google Sheets credentials and spreadsheet URL');
      } else {
        // Try to fetch data
        const sheetData = await GoogleSheetsService.getSheetData();
        healthReport.services.googleSheets = {
          status: 'healthy',
          details: {
            hasSpreadsheetUrl: true,
            hasCredentials: true,
            dataRows: sheetData.length,
            lastCheck: new Date().toISOString()
          }
        };

        if (sheetData.length === 0) {
          healthReport.warnings.push('Google Sheets contains no data');
        }
      }

    } catch (error) {
      healthReport.services.googleSheets.status = 'error';
      healthReport.services.googleSheets.details = { error: error instanceof Error ? error.message : 'Unknown error' };
      
      if (error instanceof Error && error.message.includes('Google configuration not found')) {
        healthReport.criticalIssues.push('Google Sheets configuration missing');
      } else {
        healthReport.criticalIssues.push('Google Sheets access error: ' + (error instanceof Error ? error.message : String(error)));
      }
    }

    // 3. Check Automation Engine
    try {
      console.log('🤖 Checking Automation Engine...');
      const engineStatus = AutomationEngine.getStatus();
      
      healthReport.services.automationEngine = {
        status: engineStatus.isRunning ? 'healthy' : 'stopped',
        details: {
          isRunning: engineStatus.isRunning,
          performance: engineStatus.performance,
          cacheStats: engineStatus.cacheStats,
          whatsappConnectionHealth: engineStatus.whatsappConnectionHealth
        }
      };

      if (!engineStatus.isRunning) {
        healthReport.recommendations.push('Start the automation engine');
      }

    } catch (error) {
      healthReport.services.automationEngine.status = 'error';
      healthReport.services.automationEngine.details = { error: error instanceof Error ? error.message : 'Unknown error' };
      healthReport.criticalIssues.push('Automation Engine error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }

    // 4. Check Configuration
    try {
      console.log('⚙️ Checking configuration...');
      const configHealth = await ConfigService.getConfigHealth();
      
      healthReport.services.configuration = {
        status: configHealth.google.configured && configHealth.messages.valid ? 'healthy' : 'degraded',
        details: configHealth
      };

      if (!configHealth.google.configured) {
        healthReport.criticalIssues.push('Google configuration not complete');
      }
      
      if (!configHealth.messages.valid) {
        healthReport.warnings.push('Message templates configuration issues');
      }

    } catch (error) {
      healthReport.services.configuration.status = 'error';
      healthReport.services.configuration.details = { error: error instanceof Error ? error.message : 'Unknown error' };
      healthReport.criticalIssues.push('Configuration error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }

    // Determine overall health
    const criticalCount = healthReport.criticalIssues.length;
    const errorServices = Object.values(healthReport.services).filter(s => s.status === 'error').length;
    
    if (criticalCount > 0 || errorServices > 0) {
      healthReport.overall = 'critical';
    } else if (healthReport.warnings.length > 0) {
      healthReport.overall = 'warning';
    } else {
      healthReport.overall = 'healthy';
    }

    console.log(`🏥 Health check completed - Overall status: ${healthReport.overall}`);

    return NextResponse.json({
      success: true,
      health: healthReport
    });

  } catch (error) {
    console.error('❌ Health check failed:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Health check failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 