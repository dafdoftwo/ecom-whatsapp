import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppService } from '@/lib/services/whatsapp';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phoneNumber } = body;

    if (!phoneNumber) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }

    const whatsapp = WhatsAppService.getInstance();
    const validation = await whatsapp.validatePhoneNumber(phoneNumber);

    return NextResponse.json(validation);
  } catch (error) {
    console.error('Error validating phone number:', error);
    return NextResponse.json(
      { error: 'Failed to validate phone number' },
      { status: 500 }
    );
  }
} 