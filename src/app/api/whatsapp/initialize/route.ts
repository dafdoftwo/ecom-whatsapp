import { NextResponse } from 'next/server';
import { WhatsAppService } from '@/lib/services/whatsapp';

export async function POST() {
  try {
    const whatsapp = WhatsAppService.getInstance();
    
    // Check if already connected
    const currentStatus = whatsapp.getStatus();
    if (currentStatus.isConnected) {
      return NextResponse.json({
        success: true,
        message: 'الواتساب متصل بالفعل',
        status: currentStatus
      });
    }

    // Initialize WhatsApp
    await whatsapp.initialize();
    
    return NextResponse.json({
      success: true,
      message: 'تم بدء تهيئة الواتساب - انتظر رمز QR',
      status: whatsapp.getStatus()
    });
  } catch (error) {
    console.error('Error initializing WhatsApp:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'فشل في تهيئة الواتساب',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 