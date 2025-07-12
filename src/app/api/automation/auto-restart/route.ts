import { NextResponse } from 'next/server';
import { AutomationEngine } from '@/lib/services/automation-engine';
import { WhatsAppService } from '@/lib/services/whatsapp';
import { GoogleSheetsService } from '@/lib/services/google-sheets';
import { ConfigService } from '@/lib/services/config';

// Global monitoring state
let monitoringInterval: NodeJS.Timeout | null = null;
let restartAttempts = 0;
const MAX_RESTART_ATTEMPTS = 5;

export async function POST() {
  try {
    console.log('🔄 Starting AUTO-RESTART monitoring system...');
    
    // Clear any existing monitoring
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
      monitoringInterval = null;
    }
    
    // Reset restart attempts
    restartAttempts = 0;
    
    // Initial start
    const initialStart = await startEngine();
    
    if (!initialStart.success) {
      return NextResponse.json({
        success: false,
        message: 'Failed to start automation engine initially',
        error: initialStart.error
      }, { status: 500 });
    }
    
    // Start monitoring loop
    monitoringInterval = setInterval(async () => {
      try {
        console.log('🔍 Checking automation engine status...');
        
        const status = AutomationEngine.getStatus();
        
        if (!status.isRunning) {
          console.log('⚠️ Engine stopped! Attempting auto-restart...');
          
          if (restartAttempts >= MAX_RESTART_ATTEMPTS) {
            console.error('❌ Max restart attempts reached. Stopping monitoring.');
            if (monitoringInterval) {
              clearInterval(monitoringInterval);
              monitoringInterval = null;
            }
            return;
          }
          
          restartAttempts++;
          console.log(`🔄 Restart attempt ${restartAttempts}/${MAX_RESTART_ATTEMPTS}`);
          
          const restartResult = await startEngine();
          
          if (restartResult.success) {
            console.log('✅ Engine restarted successfully!');
            restartAttempts = 0; // Reset counter on successful restart
          } else {
            console.error(`❌ Restart attempt ${restartAttempts} failed:`, restartResult.error);
          }
        } else {
          console.log('✅ Engine is running normally');
          restartAttempts = 0; // Reset counter when running normally
        }
        
      } catch (error) {
        console.error('❌ Error in monitoring loop:', error);
      }
    }, 30000); // Check every 30 seconds
    
    return NextResponse.json({
      success: true,
      message: 'Auto-restart monitoring system activated',
      status: {
        monitoring: true,
        checkInterval: '30 seconds',
        maxRestartAttempts: MAX_RESTART_ATTEMPTS,
        engineStatus: AutomationEngine.getStatus()
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to start auto-restart monitoring:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to start auto-restart monitoring',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
      monitoringInterval = null;
    }
    
    return NextResponse.json({
      success: true,
      message: 'Auto-restart monitoring stopped'
    });
    
  } catch (error) {
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to stop monitoring',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

async function startEngine() {
  try {
    console.log('🚀 Starting automation engine...');
    
    // Basic validation first
    const configHealth = await ConfigService.getConfigHealth();
    
    if (!configHealth.google.configured || !configHealth.messages.valid) {
      throw new Error('Configuration is incomplete');
    }
    
    // Check Google Sheets
    const sheetsValidation = await GoogleSheetsService.validateConfiguration();
    
    if (!sheetsValidation.isValid) {
      throw new Error(`Google Sheets validation failed: ${sheetsValidation.errors.join(', ')}`);
    }
    
    // Start the engine
    await AutomationEngine.start();
    
    // Verify it's running
    await new Promise(resolve => setTimeout(resolve, 2000));
    const status = AutomationEngine.getStatus();
    
    if (!status.isRunning) {
      throw new Error('Engine started but not running');
    }
    
    return { success: true };
    
  } catch (error) {
    console.error('❌ Engine start failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
} 