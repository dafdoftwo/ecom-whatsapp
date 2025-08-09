import { NextApiRequest, NextApiResponse } from 'next';
import { QueueService } from '../../../lib/services/queue';
import { WhatsAppService } from '../../../lib/services/whatsapp';
import { ConfigService } from '../../../lib/services/config';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { phoneNumber, message, testType = 'direct' } = req.body;
    
    if (!phoneNumber || !message) {
      return res.status(400).json({
        success: false,
        error: 'Phone number and message are required'
      });
    }

    console.log(`📱 Testing message send to ${phoneNumber} via ${testType}...`);
    
    if (testType === 'direct') {
      // Test direct WhatsApp send
      const whatsapp = WhatsAppService.getInstance();
      const status = whatsapp.getStatus();
      
      if (!status.isConnected) {
        return res.status(400).json({
          success: false,
          error: 'WhatsApp is not connected'
        });
      }
      
      const result = await whatsapp.sendMessage(phoneNumber, message);
      
      res.status(200).json({
        success: result,
        method: 'direct',
        message: result ? 'Message sent directly via WhatsApp' : 'Failed to send message',
        details: { sent: result },
        timestamp: new Date().toISOString()
      });
      
    } else if (testType === 'queue') {
      // Test via queue system
      try {
        await QueueService.initialize();
      } catch (error) {
        console.warn('Queue initialization failed, continuing with default:', error);
      }
      
      const messageJob = {
        phoneNumber,
        message,
        orderId: `test_${Date.now()}`,
        rowIndex: 999,
        messageType: 'newOrder' as const
      };
      
      await QueueService.addMessageJob(messageJob);
      
      res.status(200).json({
        success: true,
        method: 'queue',
        message: 'Message added to queue successfully',
        jobData: messageJob,
        timestamp: new Date().toISOString()
      });
      
    } else {
      res.status(400).json({
        success: false,
        error: 'Invalid test type. Use "direct" or "queue"'
      });
    }
    
  } catch (error) {
    console.error('❌ Error testing message send:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 