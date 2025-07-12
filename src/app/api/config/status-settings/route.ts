import { NextRequest, NextResponse } from 'next/server';
import { ConfigService } from '@/lib/services/config';

export async function GET() {
  try {
    const settings = await ConfigService.getStatusSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error getting status settings:', error);
    return NextResponse.json(
      { error: 'Failed to get status settings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const settings = await request.json();
    
    // Validate that all required fields are present
    if (!settings.enabledStatuses) {
      return NextResponse.json(
        { error: 'Missing enabledStatuses configuration' },
        { status: 400 }
      );
    }

    await ConfigService.setStatusSettings(settings);
    return NextResponse.json({ success: true, message: 'Status settings saved successfully' });
  } catch (error) {
    console.error('Error saving status settings:', error);
    return NextResponse.json(
      { error: 'Failed to save status settings' },
      { status: 500 }
    );
  }
} 