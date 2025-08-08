import { NextResponse } from 'next/server';
import { WhatsAppService } from '@/lib/services/whatsapp';
import { ConfigService } from '@/lib/services/config';

export async function GET() {
  try {
    const env = process.env.NODE_ENV;
    const port = process.env.PORT;
    const whatsapp = WhatsAppService.getInstance().getStatus();
    const configHealth = await ConfigService.getConfigHealth();

    return NextResponse.json({
      status: 'healthy',
      environment: env,
      port,
      whatsapp: {
        connected: whatsapp.isConnected,
        sessionExists: whatsapp.sessionExists,
        health: whatsapp.health?.sessionHealth
      },
      config: configHealth,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    return NextResponse.json({ status: 'error', error: (e as Error).message }, { status: 500 });
  }
} 