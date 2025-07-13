import { NextResponse } from 'next/server';
import { AutomationEngine } from '@/lib/services/automation-engine';

export async function POST() {
  try {
    console.log('🧹 API: Reset message tracking requested...');
    
    // Reset message tracking
    const result = AutomationEngine.resetMessageTracking();
    
    return NextResponse.json({
      success: true,
      message: 'Message tracking reset successfully',
      arabicMessage: 'تم إعادة تعيين تتبع الرسائل بنجاح',
      result: {
        clearedSentMessages: result.clearedSentMessages,
        clearedOrderHistory: result.clearedOrderHistory,
        clearedDuplicateAttempts: result.clearedDuplicateAttempts,
        resetTime: new Date().toISOString()
      },
      warning: 'This will allow previously sent messages to be sent again. Use with caution.',
      arabicWarning: 'هذا سيسمح بإعادة إرسال الرسائل المرسلة مسبقاً. استخدم بحذر.'
    });
    
  } catch (error) {
    console.error('❌ Error resetting message tracking:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to reset message tracking',
      arabicError: 'فشل في إعادة تعيين تتبع الرسائل',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 