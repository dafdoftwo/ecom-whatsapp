import { NextResponse } from 'next/server';
import { GoogleSheetsService } from '@/lib/services/google-sheets';

export async function GET() {
  try {
    const data = await GoogleSheetsService.getSheetData();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error getting sheet data:', error);
    return NextResponse.json(
      { error: 'Failed to get sheet data' },
      { status: 500 }
    );
  }
} 