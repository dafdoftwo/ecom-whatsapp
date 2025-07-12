import { NextResponse } from 'next/server';
import { AutomationEngine } from '@/lib/services/automation-engine';
import { WhatsAppService } from '@/lib/services/whatsapp';
import { ConfigService } from '@/lib/services/config';

export async function POST() {
  try {
    console.log('🚀 Quick-start automation system...');

    // Check current status
    const automationStatus = AutomationEngine.getStatus();
    const whatsapp = WhatsAppService.getInstance();
    const whatsappStatus = whatsapp.getStatus();

    const results = {
      automationEngine: { 
        wasRunning: automationStatus.isRunning, 
        isRunning: false,
        action: 'none' 
      },
      whatsapp: { 
        wasConnected: whatsappStatus.isConnected, 
        isConnected: false,
        action: 'none' 
      },
      timing: null as any,
      message: '',
      recommendations: [] as string[]
    };

    // 1. Check timing configuration
    const timingConfig = await ConfigService.getTimingConfig();
    results.timing = timingConfig;

    // 2. Start automation engine if not running
    if (!automationStatus.isRunning) {
      console.log('🔄 Starting automation engine...');
      await AutomationEngine.start();
      results.automationEngine.isRunning = true;
      results.automationEngine.action = 'started';
      console.log('✅ Automation engine started successfully');
    } else {
      console.log('✅ Automation engine already running');
      results.automationEngine.isRunning = true;
      results.automationEngine.action = 'already_running';
    }

    // 3. Initialize WhatsApp if not connected
    if (!whatsappStatus.isConnected) {
      console.log('🔄 Initializing WhatsApp...');
      try {
        // Check if we can restore session
        const canRestore = await whatsapp.canRestoreSession();
        if (canRestore) {
          console.log('🔄 Attempting to restore WhatsApp session...');
          await whatsapp.initialize();
          
          // Wait a bit for connection
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          const newStatus = whatsapp.getStatus();
          results.whatsapp.isConnected = newStatus.isConnected;
          results.whatsapp.action = newStatus.isConnected ? 'restored' : 'initialization_attempted';
        } else {
          console.log('📱 WhatsApp needs QR code scan - cannot auto-connect');
          results.whatsapp.action = 'needs_qr_scan';
          results.recommendations.push('WhatsApp needs QR code scan - visit /whatsapp page to scan');
        }
      } catch (error) {
        console.error('❌ WhatsApp initialization failed:', error);
        results.whatsapp.action = 'initialization_failed';
        results.recommendations.push('WhatsApp initialization failed - check logs');
      }
    } else {
      console.log('✅ WhatsApp already connected');
      results.whatsapp.isConnected = true;
      results.whatsapp.action = 'already_connected';
    }

    // 4. Generate final message
    const automationStarted = results.automationEngine.action === 'started';
    const whatsappConnected = results.whatsapp.isConnected;
    
    if (automationStarted && whatsappConnected) {
      results.message = `🎉 النظام جاهز للعمل! المحرك بدأ التشغيل والواتساب متصل. سيتم فحص الطلبات كل ${timingConfig.checkIntervalSeconds} ثانية.`;
    } else if (automationStarted && !whatsappConnected) {
      results.message = `⚠️ المحرك بدأ التشغيل لكن الواتساب غير متصل. يرجى مسح QR كود أولاً.`;
      results.recommendations.push('Scan WhatsApp QR code to enable message sending');
    } else if (!automationStarted && whatsappConnected) {
      results.message = `✅ المحرك كان يعمل والواتساب متصل. النظام جاهز للعمل.`;
    } else {
      results.message = `🔄 المحرك يعمل الآن لكن الواتساب يحتاج اتصال. يرجى مسح QR كود.`;
      results.recommendations.push('Scan WhatsApp QR code to complete setup');
    }

    // 5. Add timing recommendations
    if (timingConfig.checkIntervalSeconds > 60) {
      results.recommendations.push(`Consider reducing check interval from ${timingConfig.checkIntervalSeconds}s to 30-60s for faster processing`);
    }

    console.log('✅ Quick-start completed:', results.message);

    return NextResponse.json({
      success: true,
      message: results.message,
      results,
      nextSteps: results.recommendations,
      systemStatus: {
        automationRunning: results.automationEngine.isRunning,
        whatsappConnected: results.whatsapp.isConnected,
        readyToProcess: results.automationEngine.isRunning && results.whatsapp.isConnected,
        checkIntervalSeconds: timingConfig.checkIntervalSeconds
      }
    });

  } catch (error) {
    console.error('❌ Quick-start failed:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'فشل في التشغيل السريع للنظام',
        details: error instanceof Error ? error.message : 'Unknown error',
        recommendations: [
          'Check system logs for detailed error information',
          'Verify Google Sheets configuration',
          'Check WhatsApp connection status',
          'Try starting components individually'
        ]
      },
      { status: 500 }
    );
  }
} 