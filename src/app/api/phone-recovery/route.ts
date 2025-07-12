import { NextRequest, NextResponse } from 'next/server';
import { PhoneRecoveryService } from '@/lib/services/phone-recovery';

export async function GET(request: NextRequest) {
  try {
    console.log('🔧 Starting advanced phone recovery process...');
    
    const recoveryResult = await PhoneRecoveryService.recoverPhoneNumbers();
    
    if (!recoveryResult.success) {
      return NextResponse.json({
        success: false,
        error: 'Phone recovery process failed',
        recoveredData: [],
        totalRecovered: 0
      }, { status: 500 });
    }

    console.log(`✅ Recovery complete: ${recoveryResult.totalRecovered} numbers recovered`);

    return NextResponse.json({
      success: true,
      message: `Successfully recovered ${recoveryResult.totalRecovered} phone numbers from ${recoveryResult.recoveredData.length} problematic rows`,
      data: recoveryResult.recoveredData,
      summary: {
        totalRows: recoveryResult.recoveredData.length,
        totalRecovered: recoveryResult.totalRecovered,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Phone recovery API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Phone recovery failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      recoveredData: [],
      totalRecovered: 0
    }, { status: 500 });
  }
} 