import { NextResponse } from 'next/server';
import { WhatsAppService } from '@/lib/services/whatsapp';

export async function POST() {
  try {
    const whatsapp = WhatsAppService.getInstance();
    
    // Clear the session
    await whatsapp.clearSession();
    
    return NextResponse.json({
      success: true,
      message: 'تم مسح جلسة الواتساب بنجاح - يمكنك الآن مسح QR كود جديد',
      status: whatsapp.getStatus()
    });
  } catch (error) {
    console.error('Error clearing WhatsApp session:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'فشل في مسح جلسة الواتساب',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 