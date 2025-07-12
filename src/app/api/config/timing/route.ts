import { NextRequest, NextResponse } from 'next/server';
import { ConfigService } from '@/lib/services/config';

export async function GET() {
  try {
    const config = await ConfigService.getTimingConfig();
    return NextResponse.json(config);
  } catch (error) {
    console.error('Error getting timing config:', error);
    return NextResponse.json(
      { error: 'Failed to get timing configuration' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { checkIntervalSeconds, reminderDelayHours, rejectedOfferDelayHours } = body;

    // Validate timing values
    if (checkIntervalSeconds < 10 || checkIntervalSeconds > 3600) {
      return NextResponse.json(
        { error: 'Check interval must be between 10 and 3600 seconds' },
        { status: 400 }
      );
    }

    if (reminderDelayHours < 1 || reminderDelayHours > 168) {
      return NextResponse.json(
        { error: 'Reminder delay must be between 1 and 168 hours' },
        { status: 400 }
      );
    }

    if (rejectedOfferDelayHours < 1 || rejectedOfferDelayHours > 336) {
      return NextResponse.json(
        { error: 'Rejected offer delay must be between 1 and 336 hours' },
        { status: 400 }
      );
    }

    const config = {
      checkIntervalSeconds: Number(checkIntervalSeconds),
      reminderDelayHours: Number(reminderDelayHours),
      rejectedOfferDelayHours: Number(rejectedOfferDelayHours),
    };

    await ConfigService.setTimingConfig(config);
    return NextResponse.json({ success: true, message: 'Timing configuration saved successfully' });
  } catch (error) {
    console.error('Error saving timing config:', error);
    return NextResponse.json(
      { error: 'Failed to save timing configuration' },
      { status: 500 }
    );
  }
} 