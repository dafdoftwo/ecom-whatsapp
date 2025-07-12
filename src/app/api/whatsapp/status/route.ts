import { NextResponse } from 'next/server';
import { WhatsAppService } from '@/lib/services/whatsapp';

export async function GET() {
  try {
    const whatsapp = WhatsAppService.getInstance();
    const status = whatsapp.getStatus();
    const health = whatsapp.getConnectionHealth();
    
    // Get detailed session info
    const sessionInfo = await whatsapp.getDetailedSessionInfo();
    const canRestore = await whatsapp.canRestoreSession();
    const isCorrupted = await whatsapp.isSessionCorrupted();
    
    // Determine action suggestion based on current state
    let actionSuggestion = 'needs_initialization';
    let message = 'يحتاج إلى تهيئة';
    
    if (status.isConnected) {
      actionSuggestion = 'connected';
      message = 'متصل ويعمل بشكل طبيعي';
    } else if (health.isInitializing) {
      actionSuggestion = 'connecting';
      message = 'جاري الاتصال...';
    } else if (isCorrupted) {
      actionSuggestion = 'corrupted_session';
      message = 'الجلسة معطلة - يُنصح بالمسح وإعادة التشغيل';
    } else if (canRestore) {
      actionSuggestion = 'can_restore';
      message = 'يمكن إعادة الاتصال - جلسة محفوظة';
    } else if (status.sessionExists && !status.isConnected) {
      actionSuggestion = 'session_exists_disconnected';
      message = 'جلسة محفوظة - يمكن إعادة الاتصال';
    }

    const response = {
      isConnected: status.isConnected,
      sessionExists: status.sessionExists,
      hasQrCode: !!status.qrCode,
      qrCode: status.qrCode || null,
      needsQRScan: !!status.qrCode && !status.isConnected,
      sessionStatus: sessionInfo.isValid ? 'valid' : 'invalid',
      message,
      canRestoreSession: canRestore,
      isSessionCorrupted: isCorrupted,
      actionSuggestion,
      health: {
        isHealthy: health.isHealthy,
        lastHealthCheck: health.lastHealthCheck.toISOString(),
        uptime: health.uptime,
        status: health.status,
        reconnectAttempts: health.reconnectAttempts,
        isInitializing: health.isInitializing
      },
      debug: {
        reconnectAttempts: health.reconnectAttempts,
        isInitializing: health.isInitializing,
        lastHealthCheck: health.lastHealthCheck.toISOString(),
        uptime: health.uptime
      },
      clientInfo: status.clientInfo || null,
      sessionInfo: {
        exists: sessionInfo.exists,
        isValid: sessionInfo.isValid,
        sizeMB: sessionInfo.sizeMB,
        path: sessionInfo.path
      },
      timestamp: new Date().toISOString()
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error getting WhatsApp status:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get WhatsApp status',
        details: error instanceof Error ? error.message : 'Unknown error',
        isConnected: false,
        sessionExists: false,
        hasQrCode: false,
        needsQRScan: false
      },
      { status: 500 }
    );
  }
} 