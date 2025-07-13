import { NextResponse } from 'next/server';
import { WhatsAppService } from '@/lib/services/whatsapp';

export async function GET() {
  try {
    console.log('🧪 Testing QR code generation...');
    
    const whatsapp = WhatsAppService.getInstance();
    
    // Clear any existing session first
    await whatsapp.clearSession();
    
    // Initialize to generate QR code
    console.log('🚀 Initializing WhatsApp for QR generation...');
    await whatsapp.initialize();
    
    // Wait a bit for QR generation
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const status = whatsapp.getStatus();
    
    return NextResponse.json({
      success: true,
      hasQRCode: !!status.qrCode,
      qrCodeLength: status.qrCode?.length || 0,
      qrCodeFormat: status.qrCode?.startsWith('data:') ? 'data-url' : 'raw-string',
      isConnected: status.isConnected,
      sessionExists: status.sessionExists,
      qrCode: status.qrCode,
      health: status.health,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error testing QR code:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to test QR code generation',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 