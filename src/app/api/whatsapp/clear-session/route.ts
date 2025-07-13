import { NextResponse } from 'next/server';
import { WhatsAppService } from '@/lib/services/whatsapp';

export async function POST() {
  try {
    const whatsapp = WhatsAppService.getInstance();
    
    console.log('🗑️ Session clear requested by user');
    
    // Clear the current session
    await whatsapp.clearSession();
    
    return NextResponse.json({
      success: true,
      message: 'تم حذف الجلسة بنجاح. يمكنك الآن مسح QR كود جديد.',
      needsQR: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error clearing WhatsApp session:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'فشل في حذف الجلسة',
        message: 'حدث خطأ أثناء محاولة حذف الجلسة',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  // Allow DELETE method as well
  return POST();
} 