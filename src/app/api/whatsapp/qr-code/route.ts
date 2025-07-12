import { NextResponse } from 'next/server';
import { WhatsAppService } from '@/lib/services/whatsapp';

export async function GET() {
  try {
    const whatsapp = WhatsAppService.getInstance();
    const status = whatsapp.getStatus();
    
    // Return current status with QR code if available
    const response = {
      hasQRCode: !!status.qrCode,
      qrCode: status.qrCode || null,
      isConnected: status.isConnected,
      sessionExists: status.sessionExists,
      message: status.isConnected 
        ? 'WhatsApp is connected and ready'
        : status.qrCode 
          ? 'QR Code ready - please scan with your WhatsApp mobile app'
          : 'No QR Code available - please initialize WhatsApp first',
      clientInfo: status.clientInfo || null,
      timestamp: new Date().toISOString()
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error getting QR code:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get QR code',
        details: error instanceof Error ? error.message : 'Unknown error',
        hasQRCode: false,
        isConnected: false
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const whatsapp = WhatsAppService.getInstance();
    
    // Force generate new QR code by reinitializing
    await whatsapp.initialize();
    
    const status = whatsapp.getStatus();
    
    return NextResponse.json({
      success: true,
      hasQRCode: !!status.qrCode,
      qrCode: status.qrCode || null,
      isConnected: status.isConnected,
      message: status.qrCode 
        ? 'New QR Code generated - please scan with your WhatsApp mobile app'
        : 'Failed to generate QR Code'
    });
  } catch (error) {
    console.error('Error generating QR code:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate QR code',
        details: error instanceof Error ? error.message : 'Unknown error',
        success: false
      },
      { status: 500 }
    );
  }
} 