import { NextResponse } from 'next/server';
import { WhatsAppService } from '@/lib/services/whatsapp';

// Global state for tracking initialization progress
let initializationState = {
  isInitializing: false,
  startTime: 0,
  currentStep: '',
  attempts: 0,
  lastError: null as string | null
};

export async function POST() {
  try {
    console.log('🔧 ROBUST INITIALIZE: Starting enhanced WhatsApp initialization...');
    
    // Check if already initializing
    if (initializationState.isInitializing) {
      const elapsed = Date.now() - initializationState.startTime;
      return NextResponse.json({
        success: false,
        message: 'التهيئة جارية بالفعل',
        isInitializing: true,
        currentStep: initializationState.currentStep,
        elapsedSeconds: Math.round(elapsed / 1000),
        attempts: initializationState.attempts
      });
    }
    
    // Reset state
    initializationState = {
      isInitializing: true,
      startTime: Date.now(),
      currentStep: 'بدء التهيئة',
      attempts: initializationState.attempts + 1,
      lastError: null
    };

    const whatsapp = WhatsAppService.getInstance();
    
    // Check current status first
    const currentStatus = whatsapp.getStatus();
    if (currentStatus.isConnected) {
      initializationState.isInitializing = false;
      return NextResponse.json({
        success: true,
        message: 'الواتساب متصل بالفعل',
        isConnected: true,
        status: currentStatus,
        skipInitialization: true
      });
    }

    try {
      // Step 1: Pre-initialization checks
      initializationState.currentStep = 'فحص الجلسة الحالية';
      console.log(`📋 Step 1: ${initializationState.currentStep}...`);
      
      // Check if session is corrupted
      const isCorrupted = await whatsapp.isSessionCorrupted();
      if (isCorrupted) {
        initializationState.currentStep = 'مسح الجلسة المعطلة';
        console.log('🗑️ Corrupted session detected, clearing...');
        await whatsapp.clearSession();
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Step 2: Start initialization with progress tracking
      initializationState.currentStep = 'بدء تهيئة الواتساب';
      console.log(`🚀 Step 2: ${initializationState.currentStep}...`);
      
      // Start initialization with timeout monitoring
      const initPromise = whatsapp.initialize();
      const progressMonitor = startProgressMonitoring(whatsapp);
      
      // Wait for initialization to complete or timeout
      await Promise.race([
        initPromise,
        new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('Initialization timeout after 90 seconds'));
          }, 90000); // 90 seconds total timeout
        })
      ]);
      
      // Stop progress monitoring
      clearInterval(progressMonitor);
      
      // Step 3: Verify final status
      initializationState.currentStep = 'التحقق من حالة الاتصال';
      console.log(`✅ Step 3: ${initializationState.currentStep}...`);
      
      const finalStatus = whatsapp.getStatus();
      
      if (finalStatus.isConnected) {
        initializationState.isInitializing = false;
        return NextResponse.json({
          success: true,
          message: 'تم الاتصال بنجاح!',
          isConnected: true,
          status: finalStatus,
          initializationTime: Date.now() - initializationState.startTime,
          attempts: initializationState.attempts
        });
      } else if (finalStatus.qrCode) {
        initializationState.isInitializing = false;
        return NextResponse.json({
          success: true,
          message: 'تم توليد QR Code - امسح الكود للاتصال',
          isConnected: false,
          needsQRScan: true,
          qrCode: finalStatus.qrCode,
          status: finalStatus,
          initializationTime: Date.now() - initializationState.startTime,
          attempts: initializationState.attempts
        });
      } else {
        throw new Error('Failed to generate QR code or establish connection');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      initializationState.lastError = errorMessage;
      initializationState.isInitializing = false;
      
      console.error('❌ Robust initialization failed:', error);
      
      // Provide specific error guidance
      let userMessage = 'فشل في تهيئة الواتساب';
      let recommendation = 'حاول مرة أخرى';
      
      if (errorMessage.includes('timeout')) {
        userMessage = 'انتهت مهلة الاتصال بالواتساب';
        recommendation = 'قد يكون السرفر بطيء. انتظر قليلاً ثم حاول مرة أخرى، أو امسح الجلسة';
      } else if (errorMessage.includes('Protocol error') || errorMessage.includes('Target closed')) {
        userMessage = 'خطأ في بروتوكول المتصفح';
        recommendation = 'امسح الجلسة وحاول مرة أخرى';
      } else if (errorMessage.includes('net::ERR_')) {
        userMessage = 'خطأ في الشبكة';
        recommendation = 'تحقق من اتصال الإنترنت وحاول مرة أخرى';
      }
      
      return NextResponse.json({
        success: false,
        message: userMessage,
        recommendation,
        error: errorMessage,
        isConnected: false,
        needsSessionClear: errorMessage.includes('Protocol error') || errorMessage.includes('corrupted'),
        initializationTime: Date.now() - initializationState.startTime,
        attempts: initializationState.attempts,
        currentStep: initializationState.currentStep
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('❌ Critical error in robust initialization:', error);
    initializationState.isInitializing = false;
    
    return NextResponse.json({
      success: false,
      message: 'خطأ حرج في تهيئة الواتساب',
      error: error instanceof Error ? error.message : 'Unknown error',
      isConnected: false
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    // Return current initialization status
    const whatsapp = WhatsAppService.getInstance();
    const status = whatsapp.getStatus();
    
    return NextResponse.json({
      ...initializationState,
      currentStatus: status,
      elapsedSeconds: initializationState.isInitializing 
        ? Math.round((Date.now() - initializationState.startTime) / 1000)
        : 0
    });
    
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to get initialization status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Helper function to monitor initialization progress
function startProgressMonitoring(whatsapp: WhatsAppService): NodeJS.Timeout {
  return setInterval(() => {
    const status = whatsapp.getStatus();
    const elapsed = Math.round((Date.now() - initializationState.startTime) / 1000);
    
    if (status.qrCode && !status.isConnected) {
      initializationState.currentStep = 'في انتظار مسح QR Code';
    } else if (status.isConnected) {
      initializationState.currentStep = 'متصل بنجاح';
    } else if (elapsed > 30) {
      initializationState.currentStep = 'تهيئة مطولة - يرجى الانتظار';
    } else if (elapsed > 15) {
      initializationState.currentStep = 'جاري تحميل واجهة الواتساب';
    } else {
      initializationState.currentStep = 'إنشاء اتصال المتصفح';
    }
    
    console.log(`⏱️ Initialization progress: ${elapsed}s - ${initializationState.currentStep}`);
  }, 5000); // Update every 5 seconds
} 