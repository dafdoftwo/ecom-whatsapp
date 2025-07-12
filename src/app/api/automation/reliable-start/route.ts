import { NextResponse } from 'next/server';
import { AutomationEngine } from '@/lib/services/automation-engine';
import { WhatsAppService } from '@/lib/services/whatsapp';
import { GoogleSheetsService } from '@/lib/services/google-sheets';
import { ConfigService } from '@/lib/services/config';
import { QueueService } from '@/lib/services/queue';

export async function POST() {
  try {
    console.log('🚀 Starting RELIABLE automation engine with comprehensive checks...');
    
    const startupLog = [];
    const warnings = [];
    const errors = [];

    // Step 1: Pre-flight checks
    startupLog.push('📋 Step 1: Running pre-flight checks...');
    
    // Check if already running
    const currentStatus = AutomationEngine.getStatus();
    if (currentStatus.isRunning) {
      return NextResponse.json({
        success: true,
        message: 'Automation engine is already running',
        status: currentStatus,
        alreadyRunning: true
      });
    }

    // Step 2: Validate Configuration
    startupLog.push('⚙️ Step 2: Validating configuration...');
    try {
      const configHealth = await ConfigService.getConfigHealth();
      
      if (!configHealth.google.configured) {
        errors.push('❌ Google Sheets configuration is incomplete');
      }
      
      if (!configHealth.messages.valid) {
        errors.push('❌ Message templates are invalid or missing');
      }
      
      if (!configHealth.timing.valid) {
        errors.push('❌ Timing configuration is invalid');
      }

      startupLog.push(`✅ Configuration check complete: Google=${configHealth.google.configured}, Messages=${configHealth.messages.valid}, Timing=${configHealth.timing.valid}`);
    } catch (error) {
      errors.push(`❌ Configuration validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Step 3: Test Google Sheets Connection
    startupLog.push('📊 Step 3: Testing Google Sheets connection...');
    try {
      const sheetsValidation = await GoogleSheetsService.validateConfiguration();
      
      if (!sheetsValidation.isValid) {
        errors.push('❌ Google Sheets validation failed');
        sheetsValidation.errors.forEach(error => {
          errors.push(`  • ${error}`);
        });
      } else {
        // Try to fetch data
        try {
          const sheetData = await GoogleSheetsService.getSheetData();
          startupLog.push(`✅ Google Sheets connected successfully - ${sheetData.length} orders found`);
          
          if (sheetData.length === 0) {
            warnings.push('⚠️ No orders found in Google Sheets - system will wait for data');
          }
        } catch (dataError) {
          errors.push(`❌ Could not fetch data from Google Sheets: ${dataError instanceof Error ? dataError.message : 'Unknown error'}`);
        }
      }
    } catch (error) {
      errors.push(`❌ Google Sheets connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Step 4: Test WhatsApp Connection (Warning only, not blocking)
    startupLog.push('📱 Step 4: Checking WhatsApp connection...');
    try {
      const whatsapp = WhatsAppService.getInstance();
      const status = whatsapp.getStatus();
      
      if (status.isConnected) {
        startupLog.push('✅ WhatsApp is connected and ready');
      } else if (status.sessionExists) {
        warnings.push('⚠️ WhatsApp session exists but not connected - will attempt reconnect');
        startupLog.push('🔄 WhatsApp session found but not connected - attempting restore...');
        
        // Try to restore connection
        try {
          await whatsapp.initialize();
          await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
          
          const newStatus = whatsapp.getStatus();
          if (newStatus.isConnected) {
            startupLog.push('✅ WhatsApp connection restored successfully');
          } else {
            warnings.push('⚠️ WhatsApp auto-reconnect failed - messages will be queued');
          }
        } catch (reconnectError) {
          warnings.push(`⚠️ WhatsApp reconnect failed: ${reconnectError instanceof Error ? reconnectError.message : 'Unknown error'}`);
        }
      } else {
        warnings.push('⚠️ WhatsApp not connected - needs QR scan. Messages will be queued.');
      }
    } catch (error) {
      warnings.push(`⚠️ WhatsApp status check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Step 5: Test Queue Service (Warning only, not blocking)
    startupLog.push('🔄 Step 5: Testing queue service...');
    try {
      // Try to initialize queue service
      await QueueService.initialize();
      
      try {
        const queueStats = await QueueService.getQueueStats();
        startupLog.push('✅ Queue service initialized successfully');
      } catch (statsError) {
        warnings.push('⚠️ Queue service stats unavailable - Redis may not be connected');
        startupLog.push('⚠️ Queue stats unavailable but will continue with local fallback');
      }
    } catch (error) {
      warnings.push(`⚠️ Queue service initialization warning: ${error instanceof Error ? error.message : 'Unknown error'}`);
      startupLog.push('⚠️ Queue service has issues but automation can continue');
    }

    // Step 6: Check for blocking errors
    if (errors.length > 0) {
      console.error('❌ Cannot start automation engine due to critical errors:', errors);
      return NextResponse.json({
        success: false,
        message: 'Cannot start automation engine due to critical errors',
        errors,
        warnings,
        startupLog,
        recommendations: [
          '🔧 Fix the critical errors listed above',
          '📊 Ensure Google Sheets configuration is complete',
          '⚙️ Check all configuration settings',
          '🔄 Run GET /api/automation/diagnostics for detailed analysis'
        ]
      }, { status: 400 });
    }

    // Step 7: Start the automation engine
    startupLog.push('🚀 Step 6: Starting automation engine...');
    try {
      await AutomationEngine.start();
      startupLog.push('✅ Automation engine started successfully');
    } catch (startError) {
      console.error('❌ Failed to start automation engine:', startError);
      return NextResponse.json({
        success: false,
        message: 'Failed to start automation engine',
        error: startError instanceof Error ? startError.message : 'Unknown error',
        startupLog,
        warnings,
        recommendations: [
          '🔄 Try running diagnostics: GET /api/automation/diagnostics',
          '🛠️ Check system logs for detailed error information',
          '🔄 Try restarting individual services first'
        ]
      }, { status: 500 });
    }

    // Step 8: Final validation
    startupLog.push('🎯 Step 7: Final validation...');
    const finalStatus = AutomationEngine.getStatus();
    
    if (!finalStatus.isRunning) {
      return NextResponse.json({
        success: false,
        message: 'Automation engine started but not running properly',
        status: finalStatus,
        startupLog,
        warnings
      }, { status: 500 });
    }

    // Success!
    startupLog.push('🎉 Automation engine is now running successfully!');
    
    const response = {
      success: true,
      message: 'تم تشغيل محرك الأتمتة بنجاح! System is now processing orders.',
      status: finalStatus,
      startupLog,
      warnings,
      systemReady: true,
      nextSteps: [
        '📊 Monitor performance: GET /api/automation/performance',
        '📈 Check status: GET /api/automation/status', 
        '🔍 View detailed stats: GET /api/automation/status'
      ]
    };

    if (warnings.length > 0) {
      response.warnings = warnings;
      response.message += ' (Some warnings noted - check warnings for details)';
    }

    console.log('🎉 RELIABLE automation engine startup completed successfully!');
    console.log(`Warnings: ${warnings.length}`);
    console.log('Next check in 30 seconds...');

    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ Critical error in reliable automation startup:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Critical startup failure',
        details: error instanceof Error ? error.message : 'Unknown error',
        recommendations: [
          '🔍 Run diagnostics: GET /api/automation/diagnostics',
          '🛠️ Check system configuration',
          '🔄 Try individual service initialization'
        ]
      },
      { status: 500 }
    );
  }
} 