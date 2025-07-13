import { NextResponse } from 'next/server';
import { WhatsAppService } from '@/lib/services/whatsapp';

export async function POST() {
  try {
    console.log('🚀 Initializing persistent WhatsApp connection...');
    
    const whatsapp = WhatsAppService.getInstance();
    
    // Check current status
    const currentStatus = whatsapp.getStatus();
    if (currentStatus.isConnected) {
      return NextResponse.json({
        success: true,
        message: 'Already connected',
        isConnected: true,
        needsQR: false,
        status: currentStatus
      });
    }
    
    // Smart initialize
    const result = await whatsapp.smartInitialize();
    
    // Get updated status
    const updatedStatus = whatsapp.getStatus();
    
    return NextResponse.json({
      success: result.success,
      message: result.message,
      needsQR: result.needsQR,
      isConnected: updatedStatus.isConnected,
      hasQRCode: !!updatedStatus.qrCode,
      qrCode: updatedStatus.qrCode,
      status: updatedStatus,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error initializing persistent connection:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to initialize persistent connection',
        details: error instanceof Error ? error.message : 'Unknown error',
        needsQR: true
      },
      { status: 500 }
    );
  }
} 