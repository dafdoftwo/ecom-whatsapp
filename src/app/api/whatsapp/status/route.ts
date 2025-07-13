import { NextResponse } from 'next/server';
import { WhatsAppService } from '@/lib/services/whatsapp';

export async function GET() {
  try {
    const whatsapp = WhatsAppService.getInstance();
    const status = whatsapp.getStatus();
    const health = whatsapp.getConnectionHealth();
    
    // Get detailed session info
    const sessionInfo = await whatsapp.getDetailedSessionInfo();
    
    // Determine action suggestion based on current state
    let actionSuggestion = 'needs_initialization';
    let message = 'يحتاج إلى تهيئة';
    
    if (status.isConnected) {
      actionSuggestion = 'connected';
      message = 'متصل ويعمل بشكل طبيعي';
    } else if (health.sessionHealth === 'critical') {
      actionSuggestion = 'corrupted_session';
      message = 'الجلسة معطلة - يُنصح بالمسح وإعادة التشغيل';
    } else if (sessionInfo.canRestore) {
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
      canRestoreSession: sessionInfo.canRestore,
      isSessionCorrupted: health.sessionHealth === 'critical',
      actionSuggestion,
      health: {
        isHealthy: health.sessionHealth === 'healthy',
        lastHealthCheck: health.lastHeartbeat ? new Date(health.lastHeartbeat).toISOString() : new Date().toISOString(),
        uptime: health.totalUptime,
        status: health.sessionHealth,
        reconnectAttempts: health.reconnectAttempts,
        isInitializing: health.isInitializing
      },
      debug: {
        reconnectAttempts: health.reconnectAttempts,
        isInitializing: health.isInitializing,
        lastHealthCheck: health.lastHeartbeat ? new Date(health.lastHeartbeat).toISOString() : new Date().toISOString(),
        uptime: health.totalUptime
      },
      clientInfo: status.clientInfo || null,
      sessionInfo: {
        exists: sessionInfo.exists,
        isValid: sessionInfo.isValid,
        sizeMB: sessionInfo.size,
        path: 'whatsapp-session-persistent'
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