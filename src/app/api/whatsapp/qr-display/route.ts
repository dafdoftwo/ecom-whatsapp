import { NextResponse } from 'next/server';
import { WhatsAppService } from '@/lib/services/whatsapp';

export async function GET() {
  try {
    const whatsapp = WhatsAppService.getInstance();
    const status = whatsapp.getStatus();
    
    // Check if already connected
    if (status.isConnected) {
      return NextResponse.json({
        success: true,
        message: 'WhatsApp is already connected',
        isConnected: true,
        needsQR: false
      });
    }
    
    // If we have a QR code, return it
    if (status.qrCode) {
      return NextResponse.json({
        success: true,
        message: 'QR Code ready for scanning',
        isConnected: false,
        needsQR: true,
        qrCode: status.qrCode
      });
    }
    
    // Try to initialize to get QR code
    try {
      await whatsapp.initialize();
      
      // Wait a bit for QR generation
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const newStatus = whatsapp.getStatus();
      
      if (newStatus.isConnected) {
        return NextResponse.json({
          success: true,
          message: 'Connected successfully',
          isConnected: true,
          needsQR: false
        });
      }
      
      if (newStatus.qrCode) {
        return NextResponse.json({
          success: true,
          message: 'QR Code generated successfully',
          isConnected: false,
          needsQR: true,
          qrCode: newStatus.qrCode
        });
      }
    } catch (error) {
      console.error('Error initializing WhatsApp:', error);
    }
    
    return NextResponse.json({
      success: false,
      message: 'Unable to generate QR code at this time. Please try again.',
      isConnected: false,
      needsQR: true
    });
    
  } catch (error) {
    console.error('Error in QR display endpoint:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to process QR code request',
        details: error instanceof Error ? error.message : 'Unknown error',
        isConnected: false,
        needsQR: true
      },
      { status: 500 }
    );
  }
} 