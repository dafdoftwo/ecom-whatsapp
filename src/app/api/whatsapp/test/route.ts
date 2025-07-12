import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppService } from '@/lib/services/whatsapp';
import { PhoneProcessor } from '@/lib/services/phone-processor';

export async function POST(request: NextRequest) {
  try {
    console.log('🧪 TEST MESSAGE API: Starting test message endpoint');
    
    const body = await request.json();
    console.log('📥 Received body:', JSON.stringify(body, null, 2));
    
    const { phoneNumber, message } = body;

    // Validate input
    if (!phoneNumber || !message) {
      console.log('❌ Missing required fields:', { phoneNumber: !!phoneNumber, message: !!message });
      return NextResponse.json(
        { 
          success: false,
          error: 'رقم الهاتف والرسالة مطلوبان',
          debug: {
            phoneNumber: phoneNumber || 'missing',
            message: message || 'missing'
          }
        },
        { status: 400 }
      );
    }

    // Check WhatsApp connection - Enhanced check
    const whatsapp = WhatsAppService.getInstance();
    const status = whatsapp.getStatus();
    const health = whatsapp.getConnectionHealth();
    console.log('📱 WhatsApp status:', JSON.stringify(status, null, 2));
    console.log('🏥 WhatsApp health:', JSON.stringify(health, null, 2));

    // If not connected but session exists, try to restore connection
    if (!status.isConnected && status.sessionExists) {
      console.log('🔄 Session exists but not connected, attempting restore...');
      try {
        // Try to initialize/restore the connection
        await whatsapp.initialize();
        
        // Wait a moment for connection to establish
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Re-check status
        const newStatus = whatsapp.getStatus();
        console.log('🔄 Status after restore attempt:', JSON.stringify(newStatus, null, 2));
        
        if (!newStatus.isConnected) {
          console.log('⚠️ Restore failed, but proceeding with testing anyway');
          // We'll continue anyway for testing purposes
        }
      } catch (error) {
        console.log('❌ Restore attempt failed:', error);
        // Continue anyway for testing
      }
    }

    // Final check - if still not connected and no session, fail
    const finalStatus = whatsapp.getStatus();
    if (!finalStatus.isConnected && !finalStatus.sessionExists) {
      console.log('❌ WhatsApp not connected and no session');
      return NextResponse.json(
        { 
          success: false,
          error: 'الواتساب غير متصل ولا توجد جلسة محفوظة. يرجى مسح QR كود أولاً',
          debug: {
            whatsappStatus: finalStatus,
            healthStatus: health
          }
        },
        { status: 400 }
      );
    }

    // Smart Test Mode - إذا لم يكن متصل ولكن الجلسة موجودة، نفعل وضع المحاكاة
    const isSmartTestMode = !finalStatus.isConnected && finalStatus.sessionExists;
    if (isSmartTestMode) {
      console.log('🧪 SMART TEST MODE: Simulating message send (WhatsApp not connected but session exists)');
    } else {
      console.log('📱 NORMAL MODE: Proceeding with real WhatsApp message send');
    }

    // For testing purposes, proceed even if connection seems unstable
    console.log('📱 Proceeding with message test (session exists, connection state may be unstable)');

    // Validate and process phone number
    console.log('🔍 Analyzing phone number:', phoneNumber);
    const phoneAnalysis = PhoneProcessor.analyzePhoneNumber(phoneNumber);
    console.log('📊 Phone analysis result:', JSON.stringify(phoneAnalysis, null, 2));
    
    if (!phoneAnalysis.isValid) {
      console.log('❌ Invalid phone number');
      return NextResponse.json(
        { 
          success: false,
          error: `رقم هاتف غير صالح: ${phoneAnalysis.validationErrors.join(', ')}`,
          suggestions: phoneAnalysis.suggestions,
          debug: {
            phoneAnalysis,
            originalNumber: phoneNumber
          }
        },
        { status: 400 }
      );
    }

    // For testing - reduce strictness on Egyptian numbers
    console.log('🌍 Checking if number is Egyptian:', phoneAnalysis.isEgyptian);
    if (!phoneAnalysis.isEgyptian) {
      console.log('⚠️ Non-Egyptian number detected, but allowing for testing');
      // Instead of rejecting, let's allow it but warn the user
    }

    // Validate WhatsApp registration
    console.log('📱 Validating WhatsApp registration for:', phoneAnalysis.formatted);
    let validation;
    try {
      validation = await whatsapp.validatePhoneNumber(phoneAnalysis.formatted);
      console.log('✅ WhatsApp validation result:', JSON.stringify(validation, null, 2));
    } catch (error) {
      console.log('❌ WhatsApp validation failed:', error);
      validation = {
        isRegistered: false,
        isValid: false,
        error: `Validation failed: ${error}`,
        processedNumber: phoneAnalysis.formatted
      };
    }

    // For testing purposes - be more lenient with WhatsApp registration check
    if (!validation.isRegistered) {
      console.log('⚠️ Number not registered on WhatsApp, but proceeding with test');
      // We'll proceed anyway for testing purposes
      validation.processedNumber = phoneAnalysis.formatted;
      validation.isValid = true;
    }

    // Add test message prefix
    const testMessage = `🧪 رسالة تجريبية من نظام الأتمتة المصري:\n\n${message}\n\n⚠️ هذه رسالة تجريبية - يرجى تجاهلها.`;
    console.log('📝 Prepared test message:', testMessage);

    // Send test message with Smart Mode support
    console.log('📤 Attempting to send message to:', validation.processedNumber);
    let sent = false;
    let sendError = null;
    
    try {
      if (isSmartTestMode) {
        // Smart Test Mode - محاكاة إرسال الرسالة
        console.log('🧪 SIMULATING MESSAGE SEND...');
        console.log('📱 To:', validation.processedNumber);
        console.log('💬 Message:', testMessage.substring(0, 100) + '...');
        
        // محاكاة وقت الإرسال
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // محاكاة نجاح الإرسال (90% نجاح)
        const simulatedSuccess = Math.random() > 0.1;
        
        if (simulatedSuccess) {
          sent = true;
          console.log('✅ SIMULATED: Message sent successfully');
        } else {
          sent = false;
          sendError = new Error('SIMULATED: Random failure for testing');
          console.log('❌ SIMULATED: Message failed (random simulation)');
        }
      } else {
        // Normal Mode - إرسال حقيقي
        sent = await whatsapp.sendMessage(validation.processedNumber, testMessage);
        console.log('📬 Real message send result:', sent);
      }
    } catch (error) {
      console.log('❌ Failed to send message:', error);
      sendError = error;
      sent = false;
    }

    if (sent) {
      console.log('✅ Test message sent successfully');
      return NextResponse.json({
        success: true,
        message: isSmartTestMode 
          ? '🧪 تم محاكاة إرسال الرسالة بنجاح! (وضع الاختبار الذكي)' 
          : 'تم إرسال الرسالة التجريبية بنجاح! 🎉',
        details: {
          processedNumber: validation.processedNumber,
          sentAt: new Date().toISOString(),
          phoneAnalysis,
          validation,
          isEgyptian: phoneAnalysis.isEgyptian,
          whatsappRegistered: validation.isRegistered,
          testMode: isSmartTestMode ? 'Smart Simulation' : 'Real WhatsApp',
          simulationNote: isSmartTestMode ? 'هذه رسالة محاكاة لأن الواتساب غير متصل حالياً' : undefined
        }
      });
    } else {
      console.log('❌ Failed to send message');
      return NextResponse.json(
        { 
          success: false,
          error: isSmartTestMode 
            ? 'فشلت محاكاة الإرسال (اختبار عشوائي)' 
            : 'فشل في إرسال الرسالة. تحقق من الاتصال والرقم.',
          debug: {
          phoneAnalysis,
            validation,
            sendError: sendError?.toString(),
            whatsappStatus: finalStatus,
            testMode: isSmartTestMode ? 'Smart Simulation' : 'Real WhatsApp'
          }
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('❌ Unexpected error in test message API:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'حدث خطأ أثناء إرسال الرسالة التجريبية',
        details: error instanceof Error ? error.message : 'Unknown error',
        debug: {
          errorType: error?.constructor?.name,
          errorMessage: error?.toString(),
          stack: error instanceof Error ? error.stack : undefined
        }
      },
      { status: 500 }
    );
  }
} 