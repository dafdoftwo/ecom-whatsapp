import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppSessionManager } from '@/lib/services/whatsapp-session-manager';

export async function GET() {
  try {
    const sessionManager = WhatsAppSessionManager.getInstance();
    const state = sessionManager.getState();
    const health = await sessionManager.monitorHealth();
    
    return NextResponse.json({
      success: true,
      state,
      health,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting session state:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'فشل في الحصول على حالة الجلسة',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;
    
    const sessionManager = WhatsAppSessionManager.getInstance();
    
    switch (action) {
      case 'initialize': {
        console.log('🚀 Session initialization requested');
        const result = await sessionManager.smartInitialize();
        return NextResponse.json(result);
      }
      
      case 'regenerate-qr': {
        console.log('🔄 QR regeneration requested');
        const result = await sessionManager.regenerateQR();
        return NextResponse.json({
          ...result,
          state: sessionManager.getState()
        });
      }
      
      case 'clear': {
        console.log('🗑️ Session clear requested');
        const result = await sessionManager.clearSession();
        return NextResponse.json({
          ...result,
          state: sessionManager.getState()
        });
      }
      
      case 'health-check': {
        console.log('🏥 Health check requested');
        const health = await sessionManager.monitorHealth();
        return NextResponse.json({
          success: true,
          health,
          state: sessionManager.getState()
        });
      }
      
      default:
        return NextResponse.json(
          { 
            success: false,
            error: 'إجراء غير صالح',
            validActions: ['initialize', 'regenerate-qr', 'clear', 'health-check']
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error in session action:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'فشل في تنفيذ الإجراء',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 