import { NextResponse } from 'next/server';
import { WhatsAppService } from '@/lib/services/whatsapp';

export async function GET() {
  try {
    const whatsapp = WhatsAppService.getInstance();
    const detailedInfo = await whatsapp.getDetailedSessionInfo();
    const connectionHealth = whatsapp.getConnectionHealth();
    const status = whatsapp.getStatus();

    return NextResponse.json({
      session: detailedInfo,
      connection: {
        isConnected: status.isConnected,
        health: connectionHealth,
        clientInfo: status.clientInfo
      },
      recommendations: {
        shouldClearSession: !detailedInfo.isValid && detailedInfo.exists,
        shouldReconnect: detailedInfo.isValid && !status.isConnected,
        needsQRScan: !detailedInfo.exists || !detailedInfo.isValid
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting session info:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get session information',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 