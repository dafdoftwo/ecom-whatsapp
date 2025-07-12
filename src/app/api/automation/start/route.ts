import { NextResponse } from 'next/server';
import { AutomationEngine } from '@/lib/services/automation-engine';

export async function POST() {
  try {
    await AutomationEngine.start();
    
    return NextResponse.json({
      success: true,
      message: 'تم بدء تشغيل محرك الأتمتة بنجاح',
      status: AutomationEngine.getStatus()
    });
  } catch (error) {
    console.error('Error starting automation engine:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'فشل في تشغيل محرك الأتمتة',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 