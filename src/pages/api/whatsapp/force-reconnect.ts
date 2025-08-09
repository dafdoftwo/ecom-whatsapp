import { NextApiRequest, NextApiResponse } from 'next';
import { WhatsAppService } from '../../../lib/services/whatsapp';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔄 Force reconnecting WhatsApp...');
    
    const whatsapp = WhatsAppService.getInstance();
    
    // Get current status
    const currentStatus = whatsapp.getStatus();
    console.log('📊 Current WhatsApp Status:', {
      isConnected: currentStatus.isConnected,
      sessionExists: currentStatus.sessionExists,
      clientInfo: !!currentStatus.clientInfo
    });
    
    // Force reconnection
    const result = await whatsapp.smartInitialize();
    
    console.log('🔄 Reconnection result:', result);
    
    // Get updated status
    const newStatus = whatsapp.getStatus();
    
    res.status(200).json({
      success: result.success,
      message: result.message,
      previousStatus: {
        isConnected: currentStatus.isConnected,
        sessionExists: currentStatus.sessionExists,
        hasClientInfo: !!currentStatus.clientInfo
      },
      newStatus: {
        isConnected: newStatus.isConnected,
        sessionExists: newStatus.sessionExists,
        hasClientInfo: !!newStatus.clientInfo
      },
      needsQR: result.needsQR,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error forcing WhatsApp reconnection:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 