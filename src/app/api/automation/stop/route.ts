import { NextResponse } from 'next/server';
import { AutomationEngine } from '@/lib/services/automation-engine';

export async function POST() {
  try {
    await AutomationEngine.stop();
    
    return NextResponse.json({
      success: true,
      message: 'تم إيقاف محرك الأتمتة بنجاح',
      status: AutomationEngine.getStatus()
    });
  } catch (error) {
    console.error('Error stopping automation engine:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'فشل في إيقاف محرك الأتمتة',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 