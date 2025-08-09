import { NextApiRequest, NextApiResponse } from 'next';
import { GoogleSheetsService } from '../../../lib/services/google-sheets';
import { ConfigService } from '../../../lib/services/config';
import { PhoneProcessor } from '../../../lib/services/phone-processor';
import { QueueService } from '../../../lib/services/queue';
import { DuplicateGuardService } from '../../../lib/services/duplicate-guard';
import { WhatsAppService } from '../../../lib/services/whatsapp';
import fs from 'fs';
import path from 'path';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🚀 Force sending messages for all current leads...');
    
    const results = {
      duplicateGuardReset: false,
      whatsappStatus: 'unknown',
      leadsProcessed: 0,
      messagesQueued: 0,
      errors: [] as string[],
      leadDetails: [] as any[]
    };

    // Step 1: Reset duplicate guard to allow all messages
    console.log('🧹 Step 1: Resetting duplicate guard...');
    try {
      const configDir = path.join(process.cwd(), 'config');
      const sentMessagesFile = path.join(configDir, 'sent-messages.json');
      
      if (fs.existsSync(sentMessagesFile)) {
        fs.unlinkSync(sentMessagesFile);
        console.log('✅ Local sent messages file cleared');
      }
      
      // Clear Redis if available
      try {
        const Redis = require('ioredis');
        if (process.env.REDIS_URL) {
          const redis = new Redis(process.env.REDIS_URL);
          const keys = await redis.keys('sent:*');
          if (keys.length > 0) {
            await redis.del(keys);
            console.log(`✅ Cleared ${keys.length} Redis keys`);
          }
          await redis.quit();
        }
      } catch (redisError) {
        console.log('⚠️ Redis not available, using file fallback');
      }
      
      results.duplicateGuardReset = true;
    } catch (error) {
      results.errors.push(`Duplicate guard reset failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Step 2: Check WhatsApp status
    console.log('📱 Step 2: Checking WhatsApp status...');
    try {
      const whatsapp = WhatsAppService.getInstance();
      const status = whatsapp.getStatus();
      
      if (!status.isConnected) {
        console.log('⚠️ WhatsApp not connected, attempting to connect...');
        const initResult = await whatsapp.smartInitialize();
        if (initResult.success) {
          console.log('✅ WhatsApp connected successfully');
          results.whatsappStatus = 'connected';
        } else {
          console.log(`❌ WhatsApp connection failed: ${initResult.message}`);
          results.whatsappStatus = 'disconnected';
          if (initResult.needsQR) {
            results.errors.push('WhatsApp needs QR code authentication');
          }
        }
      } else {
        console.log('✅ WhatsApp already connected');
        results.whatsappStatus = 'connected';
      }
    } catch (error) {
      results.whatsappStatus = 'error';
      results.errors.push(`WhatsApp check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Step 3: Get leads and force send messages
    console.log('📊 Step 3: Processing leads and forcing message sends...');
    try {
      const sheetData = await GoogleSheetsService.getSheetData();
      console.log(`📋 Found ${sheetData.length} leads in sheet`);
      
      // Get message templates
      const templatesConfig = await ConfigService.getMessageTemplates();
      const templates = templatesConfig.templates;
      
      // Initialize queue service
      try {
        await QueueService.initialize();
      } catch (queueError) {
        console.warn('Queue initialization failed, continuing with fallback');
      }
      
      // Process each lead
      for (let i = 0; i < Math.min(sheetData.length, 10); i++) { // Process first 10 leads
        const row = sheetData[i];
        const leadDetail: any = {
          rowIndex: row.rowIndex || i + 1,
          name: row.name,
          phone: row.phone,
          orderStatus: row.orderStatus,
          action: 'skipped',
          reason: ''
        };
        
        try {
          // Validate basic data
          if (!row.name || (!row.phone && !row.whatsappNumber)) {
            leadDetail.reason = 'Missing name or phone';
            results.leadDetails.push(leadDetail);
            continue;
          }
          
          // Process phone number
          const phoneProcessing = PhoneProcessor.processTwoNumbers(row.phone, row.whatsappNumber);
          if (!phoneProcessing.isValid) {
            leadDetail.reason = 'Invalid phone number';
            results.leadDetails.push(leadDetail);
            continue;
          }
          
          const egyptianValidation = PhoneProcessor.validateEgyptianNumber(phoneProcessing.preferredNumber);
          if (!egyptianValidation.isValid) {
            leadDetail.reason = 'Invalid Egyptian phone number';
            results.leadDetails.push(leadDetail);
            continue;
          }
          
          // Set processed phone and generate orderId
          const processedPhone = egyptianValidation.finalFormat;
          const orderId = row.orderId || PhoneProcessor.generateOrderId(
            row.name || 'عميل',
            processedPhone,
            row.orderDate || ''
          );
          
          leadDetail.processedPhone = processedPhone;
          leadDetail.orderId = orderId;
          
          // Determine message type based on status
          const status = (row.orderStatus || '').trim();
          let messageType: 'newOrder' | 'noAnswer' | 'shipped' | 'rejectedOffer' | null = null;
          let messageTemplate = '';
          
          // Map status to message type
          switch (status) {
            case 'جديد':
            case 'طلب جديد':
            case 'قيد المراجعة':
            case 'قيد المراجعه':
            case '':
              messageType = 'newOrder';
              messageTemplate = templates.newOrder;
              break;
            case 'لم يرد':
            case 'لم يتم الرد':
            case 'لا يرد':
            case 'عدم الرد':
              messageType = 'noAnswer';
              messageTemplate = templates.noAnswer;
              break;
            case 'تم التأكيد':
            case 'تم التاكيد':
            case 'مؤكد':
            case 'تم الشحن':
            case 'قيد الشحن':
              messageType = 'shipped';
              messageTemplate = templates.shipped;
              break;
            case 'تم الرفض':
            case 'مرفوض':
            case 'رفض الاستلام':
            case 'رفض الأستلام':
              messageType = 'rejectedOffer';
              messageTemplate = templates.rejectedOffer;
              break;
          }
          
          if (messageType && messageTemplate) {
            // Replace message variables
            const finalMessage = messageTemplate
              .replace(/\{name\}/g, row.name || 'عميل عزيز')
              .replace(/\{product\}/g, row.productName || 'المنتج')
              .replace(/\{productName\}/g, row.productName || 'المنتج')
              .replace(/\{price\}/g, row.totalPrice?.toString() || 'السعر')
              .replace(/\{orderId\}/g, orderId)
              .replace(/\{phone\}/g, processedPhone);
            
            // Add message to queue
            const messageJob = {
              phoneNumber: processedPhone,
              message: finalMessage,
              orderId: orderId,
              rowIndex: row.rowIndex || i + 1,
              messageType: messageType
            };
            
            await QueueService.addMessageJob(messageJob);
            
            leadDetail.action = 'queued';
            leadDetail.messageType = messageType;
            leadDetail.reason = `Message queued for ${messageType}`;
            results.messagesQueued++;
          } else {
            leadDetail.reason = `Unsupported status: ${status}`;
          }
          
          results.leadsProcessed++;
          
        } catch (error) {
          leadDetail.action = 'error';
          leadDetail.reason = error instanceof Error ? error.message : 'Unknown error';
          results.errors.push(`Lead ${i + 1}: ${leadDetail.reason}`);
        }
        
        results.leadDetails.push(leadDetail);
      }
      
    } catch (error) {
      results.errors.push(`Lead processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    console.log(`✅ Force send completed: ${results.messagesQueued} messages queued for ${results.leadsProcessed} leads`);
    
    res.status(200).json({
      success: results.messagesQueued > 0,
      message: `Successfully queued ${results.messagesQueued} messages for ${results.leadsProcessed} leads`,
      results,
      recommendation: results.messagesQueued > 0 
        ? '🚀 Messages have been queued and should start sending now!'
        : '⚠️ No messages were queued. Check the errors above.',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error in force send messages:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 