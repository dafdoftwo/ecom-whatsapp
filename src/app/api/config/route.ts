import { NextResponse } from 'next/server';
import { ConfigService } from '@/lib/services/config';

export async function GET() {
  try {
    const configs = await ConfigService.getAllConfigs();
    return NextResponse.json(configs);
  } catch (error) {
    console.error('Error getting all configs:', error);
    return NextResponse.json(
      { error: 'Failed to get configurations' },
      { status: 500 }
    );
  }
} 