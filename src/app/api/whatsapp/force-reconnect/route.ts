import { NextResponse } from 'next/server';
import { WhatsAppService } from '@/lib/services/whatsapp';

export async function POST() {
  try {
    const whatsapp = WhatsAppService.getInstance();
    
    console.log('🔄 Force reconnection API called');
    
    // Attempt force reconnection
    await whatsapp.forceReconnect();
    
    return NextResponse.json({
      success: true,
      message: 'تم إعادة الاتصال بنجاح',
      status: whatsapp.getStatus()
    });
  } catch (error) {
    console.error('Error during force reconnect:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'فشل في إعادة الاتصال',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 