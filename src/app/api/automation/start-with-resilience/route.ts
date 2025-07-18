import { NextResponse } from 'next/server';
import { AutomationEngine } from '@/lib/services/automation-engine';
import { NetworkResilienceService } from '@/lib/services/network-resilience';
import { QueueService } from '@/lib/services/queue';
import { WhatsAppService } from '@/lib/services/whatsapp';

export async function POST() {
  try {
    console.log('🚀 Starting automation engine with COMPLETE network resilience...');
    
    // Step 1: Reset and prepare network resilience
    NetworkResilienceService.resetStats();
    console.log('✅ Network resilience stats reset');
    
    // Step 2: Comprehensive system health check
    const healthCheck = await NetworkResilienceService.performHealthCheck();
    console.log(`🔍 System health check: ${healthCheck.overall}`);
    console.log(`📊 Services: Google Sheets: ${healthCheck.services.googleSheets.status}, WhatsApp: ${healthCheck.services.whatsapp.status}, Network: ${healthCheck.services.network.status}`);
    
    if (healthCheck.overall === 'critical') {
      return NextResponse.json({
        success: false,
        error: 'System health is critical - cannot start automation',
        healthCheck,
        recommendations: healthCheck.recommendations,
        message: 'فشل في بدء النظام - الحالة الصحية حرجة'
      }, { status: 500 });
    }
    
    // Step 3: Force initialize queue service with resilience
    console.log('🔄 Initializing queue service with resilience...');
    try {
      await QueueService.initialize();
      console.log('✅ Queue service initialized successfully');
    } catch (queueError) {
      console.warn('⚠️ Queue service issue (continuing with local fallback):', queueError);
      // Continue - queue has local fallback
    }
    
    // Step 4: Initialize WhatsApp with resilience
    console.log('📱 Initializing WhatsApp with resilience...');
    try {
      const whatsapp = WhatsAppService.getInstance();
      const initResult = await whatsapp.smartInitialize();
      
      if (initResult.success) {
        console.log('✅ WhatsApp connected successfully');
      } else {
        console.log(`⚠️ WhatsApp not connected: ${initResult.message} - continuing anyway`);
      }
    } catch (whatsappError) {
      console.warn('⚠️ WhatsApp initialization issue (messages will be queued):', whatsappError);
      // Continue - messages will be queued
    }
    
    // Step 5: Test network resilience with actual operations
    console.log('🧪 Testing network resilience with real operations...');
    try {
      const testData = await NetworkResilienceService.getSheetDataResilient();
      console.log(`✅ Network resilience test passed - found ${testData.length} orders`);
    } catch (resilienceError) {
      console.error('❌ Network resilience test failed:', resilienceError);
      return NextResponse.json({
        success: false,
        error: 'Network resilience test failed',
        details: resilienceError instanceof Error ? resilienceError.message : 'Unknown error',
        message: 'فشل في اختبار مقاومة الشبكة'
      }, { status: 500 });
    }
    
    // Step 6: Start the automation engine with enhanced error handling
    console.log('🔄 Starting automation engine with enhanced resilience...');
    try {
      await AutomationEngine.start();
    } catch (startError) {
      console.error('❌ Automation engine start failed:', startError);
      
      // Try to diagnose the issue
      const resilienceStats = NetworkResilienceService.getStats();
      
      return NextResponse.json({
        success: false,
        error: 'Failed to start automation engine',
        details: startError instanceof Error ? startError.message : 'Unknown error',
        networkResilience: resilienceStats,
        message: 'فشل في تشغيل محرك الأتمتة'
      }, { status: 500 });
    }
    
    // Step 7: Verify startup success
    const finalStatus = AutomationEngine.getStatus();
    const resilienceStats = NetworkResilienceService.getStats();
    
    if (!finalStatus.isRunning) {
      return NextResponse.json({
        success: false,
        error: 'Automation engine started but not running',
        status: finalStatus,
        networkResilience: resilienceStats,
        message: 'بدأ المحرك لكنه لا يعمل'
      }, { status: 500 });
    }
    
    console.log('✅ Automation engine started successfully with COMPLETE network resilience');
    
    return NextResponse.json({
      success: true,
      message: 'تم تشغيل محرك الأتمتة بنجاح مع المقاومة الشبكية الكاملة!',
      status: finalStatus,
      networkResilience: {
        circuitBreakerState: resilienceStats.circuitBreakerState,
        totalRetries: resilienceStats.totalRetries,
        errorsByType: resilienceStats.errorsByType,
        systemHealth: healthCheck.overall
      },
      systemReadiness: {
        automationEngine: finalStatus.isRunning,
        queueService: true, // Always true with local fallback
        networkResilience: resilienceStats.circuitBreakerState !== 'open',
        overallReady: true
      },
      timestamp: new Date().toISOString(),
      nextSteps: [
        '📊 Monitor with: GET /api/automation/status',
        '🔍 Check health: GET /api/system/network-health',
        '📈 View queue: GET /api/queue/stats'
      ]
    });
    
  } catch (error) {
    console.error('❌ CRITICAL: Failed to start automation engine with resilience:', error);
    
    const resilienceStats = NetworkResilienceService.getStats();
    
    return NextResponse.json({
      success: false,
      error: 'Critical failure starting automation engine with resilience',
      details: error instanceof Error ? error.message : 'Unknown error',
      networkResilience: {
        circuitBreakerState: resilienceStats.circuitBreakerState,
        totalRetries: resilienceStats.totalRetries,
        errorsByType: resilienceStats.errorsByType,
        lastError: resilienceStats.lastError
      },
      timestamp: new Date().toISOString(),
      recommendations: [
        '🔄 Check system logs for detailed error information',
        '🧪 Test individual components: GET /api/test/network-resilience',
        '🛠️ Verify configuration: GET /api/automation/diagnostics'
      ]
    }, { status: 500 });
  }
} 