import { NextResponse } from 'next/server';
import { WhatsAppService } from '@/lib/services/whatsapp';

export async function GET() {
  try {
    const whatsapp = WhatsAppService.getInstance();
    const status = whatsapp.getStatus();

    if (!status.qrCode) {
      return NextResponse.json(
        { error: 'No QR code available' },
        { status: 404 }
      );
    }

    // If it's a data URL, extract the base64 part
    if (status.qrCode.startsWith('data:image/png;base64,')) {
      const base64Data = status.qrCode.replace('data:image/png;base64,', '');
      const buffer = Buffer.from(base64Data, 'base64');
      
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'no-cache',
        },
      });
    }

    // Return the data URL directly for browser display
    return NextResponse.json({
      qrCode: status.qrCode,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting QR code:', error);
    return NextResponse.json(
      { error: 'Failed to get QR code' },
      { status: 500 }
    );
  }
} 