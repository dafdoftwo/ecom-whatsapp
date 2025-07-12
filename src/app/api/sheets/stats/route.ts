import { NextResponse } from 'next/server';
import { GoogleSheetsService } from '@/lib/services/google-sheets';

export async function GET() {
  try {
    const stats = await GoogleSheetsService.getSheetStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error getting sheet stats:', error);
    return NextResponse.json(
      { error: 'Failed to get sheet statistics' },
      { status: 500 }
    );
  }
} 