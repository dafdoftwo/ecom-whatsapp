import { NextRequest, NextResponse } from 'next/server';
import { ConfigService } from '@/lib/services/config';

export async function GET() {
  try {
    const config = await ConfigService.getGoogleConfig();
    return NextResponse.json(config);
  } catch (error) {
    console.error('Error getting Google config:', error);
    return NextResponse.json(
      { error: 'Failed to get Google configuration' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { spreadsheetUrl, credentials } = body;

    if (!spreadsheetUrl || !credentials) {
      return NextResponse.json(
        { error: 'Missing required fields: spreadsheetUrl and credentials' },
        { status: 400 }
      );
    }

    // Validate Google credentials format
    if (typeof credentials === 'string') {
      try {
        JSON.parse(credentials);
      } catch {
        return NextResponse.json(
          { error: 'Invalid JSON format for credentials' },
          { status: 400 }
        );
      }
    }

    const config = {
      spreadsheetUrl,
      credentials: typeof credentials === 'string' ? JSON.parse(credentials) : credentials,
    };

    await ConfigService.setGoogleConfig(config);
    return NextResponse.json({ success: true, message: 'Google configuration saved successfully' });
  } catch (error) {
    console.error('Error saving Google config:', error);
    return NextResponse.json(
      { error: 'Failed to save Google configuration' },
      { status: 500 }
    );
  }
} 