import { NextResponse } from 'next/server';
import { GoogleSheetsService } from '@/lib/services/google-sheets';

export async function GET() {
  try {
    const validation = await GoogleSheetsService.validateConfiguration();
    return NextResponse.json(validation);
  } catch (error) {
    console.error('Error validating Google configuration:', error);
    return NextResponse.json(
      { 
        isValid: false, 
        errors: ['خطأ في التحقق من الإعدادات'], 
        warnings: [] 
      },
      { status: 500 }
    );
  }
} 