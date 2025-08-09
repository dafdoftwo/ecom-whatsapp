import { NextApiRequest, NextApiResponse } from 'next';
import { WhatsAppService } from '../../../lib/services/whatsapp';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔍 Checking and fixing WhatsApp connection...');
    
    const whatsapp = WhatsAppService.getInstance();
    let fixApplied = false;
    let fixDetails = [];
    
    // Step 1: Check current status
    const initialStatus = whatsapp.getStatus();
    console.log('📊 Initial WhatsApp Status:', {
      isConnected: initialStatus.isConnected,
      sessionExists: initialStatus.sessionExists,
      hasClientInfo: !!initialStatus.clientInfo,
      qrCode: !!initialStatus.qrCode
    });
    
    // Step 2: If not connected, try to fix
    if (!initialStatus.isConnected) {
      console.log('⚠️ WhatsApp not connected, attempting to fix...');
      
      try {
        // Force reconnection
        fixDetails.push('Attempting smart initialization...');
        const initResult = await whatsapp.smartInitialize();
        
        if (initResult.success) {
          fixDetails.push('✅ Smart initialization successful');
          fixApplied = true;
        } else {
          fixDetails.push(`❌ Smart initialization failed: ${initResult.message}`);
          
          // If needs QR code, that's expected
          if (initResult.needsQR) {
            fixDetails.push('📱 QR code required for authentication');
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        fixDetails.push(`❌ Reconnection failed: ${errorMessage}`);
      }
    } else {
      fixDetails.push('✅ WhatsApp already connected');
    }
    
    // Step 3: Test message sending capability
    const finalStatus = whatsapp.getStatus();
    let canSendMessages = false;
    
    if (finalStatus.isConnected) {
      try {
        // Try to get connection health
        const connectionHealth = whatsapp.getConnectionHealth();
        canSendMessages = connectionHealth.isConnected;
        fixDetails.push(`📊 Connection health: ${connectionHealth.sessionHealth}`);
      } catch (error) {
        canSendMessages = false;
        fixDetails.push('⚠️ Could not assess message sending capability');
      }
    }
    
    // Step 4: Provide recommendations
    const recommendations = [];
    
    if (!finalStatus.isConnected) {
      if (finalStatus.qrCode) {
        recommendations.push('📱 Scan the QR code to authenticate WhatsApp');
      } else {
        recommendations.push('🔄 Try clearing session and reconnecting');
      }
    } else if (!canSendMessages) {
      recommendations.push('🔄 Connection exists but may be unstable - try force reconnect');
    } else {
      recommendations.push('✅ WhatsApp is ready for sending messages');
    }
    
    res.status(200).json({
      success: true,
      initialStatus: {
        isConnected: initialStatus.isConnected,
        sessionExists: initialStatus.sessionExists,
        hasClientInfo: !!initialStatus.clientInfo,
        hasQrCode: !!initialStatus.qrCode
      },
      finalStatus: {
        isConnected: finalStatus.isConnected,
        sessionExists: finalStatus.sessionExists,
        hasClientInfo: !!finalStatus.clientInfo,
        hasQrCode: !!finalStatus.qrCode
      },
      canSendMessages,
      fixApplied,
      fixDetails,
      recommendations,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error checking and fixing WhatsApp:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 