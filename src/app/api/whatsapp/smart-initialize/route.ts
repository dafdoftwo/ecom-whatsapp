import { NextResponse } from 'next/server';
import { WhatsAppService } from '@/lib/services/whatsapp';

export async function POST() {
  try {
    const whatsapp = WhatsAppService.getInstance();
    
    console.log('🧠 Smart initialization requested');
    
    // Use smart initialization
    const result = await whatsapp.smartInitialize();
    
    return NextResponse.json({
      success: result.success,
      needsQR: result.needsQR,
      message: result.message,
      status: whatsapp.getStatus(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error during smart initialization:', error);
    return NextResponse.json(
      { 
        success: false,
        needsQR: true,
        error: 'فشل في التهيئة الذكية',
        message: 'حدث خطأ غير متوقع أثناء محاولة الاتصال',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 