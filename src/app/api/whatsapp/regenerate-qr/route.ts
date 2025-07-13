import { NextResponse } from 'next/server';
import { WhatsAppService } from '@/lib/services/whatsapp';

export async function POST() {
  try {
    const whatsapp = WhatsAppService.getInstance();
    
    console.log('🔄 QR Code regeneration requested by user');
    
    // Get current status
    const currentStatus = whatsapp.getStatus();
    
    // If already connected, disconnect first
    if (currentStatus.isConnected) {
      console.log('📱 Already connected, disconnecting first...');
      await whatsapp.destroy();
      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Force reconnect to generate new QR
    await whatsapp.forceReconnect();
    
    // Wait for QR generation
    let attempts = 0;
    let status = whatsapp.getStatus();
    
    while (!status.qrCode && attempts < 10) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      status = whatsapp.getStatus();
      attempts++;
    }
    
    if (status.qrCode) {
      return NextResponse.json({
        success: true,
        message: 'تم توليد QR Code جديد بنجاح',
        hasQRCode: true,
        qrCode: status.qrCode,
        isConnected: false,
        needsQR: true,
        timestamp: new Date().toISOString()
      });
    } else {
      return NextResponse.json({
        success: false,
        message: 'فشل في توليد QR Code جديد. حاول مسح الجلسة أولاً.',
        hasQRCode: false,
        isConnected: status.isConnected,
        needsQR: true
      });
    }
  } catch (error) {
    console.error('Error regenerating QR code:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'فشل في إعادة توليد QR Code',
        message: 'حدث خطأ أثناء محاولة إعادة توليد QR Code',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 