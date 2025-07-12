import { NextResponse } from 'next/server';
import { WhatsAppService } from '@/lib/services/whatsapp';

export async function POST() {
  try {
    const whatsapp = WhatsAppService.getInstance();
    
    // Logout from WhatsApp
    await whatsapp.logout();
    
    return NextResponse.json({
      success: true,
      message: 'تم تسجيل الخروج من الواتساب بنجاح',
      status: whatsapp.getStatus()
    });
  } catch (error) {
    console.error('Error logging out from WhatsApp:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'فشل في تسجيل الخروج من الواتساب',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 