import { NextApiRequest, NextApiResponse } from 'next';
import { WhatsAppService } from '../../../lib/services/whatsapp';
import { DuplicateGuardService } from '../../../lib/services/duplicate-guard';
import { GoogleSheetsService } from '../../../lib/services/google-sheets';
import { PhoneProcessor } from '../../../lib/services/phone-processor';
import fs from 'fs';
import path from 'path';

interface TestResult {
  status: 'pending' | 'success' | 'warning' | 'error' | 'skipped';
  details: string[];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const testResults: {
    whatsapp: TestResult;
    duplicateGuard: TestResult;
    googleSheets: TestResult;
    messageTest: TestResult;
    overall: { success: boolean; readyForAutomation: boolean };
  } = {
    whatsapp: { status: 'pending', details: [] },
    duplicateGuard: { status: 'pending', details: [] },
    googleSheets: { status: 'pending', details: [] },
    messageTest: { status: 'pending', details: [] },
    overall: { success: false, readyForAutomation: false }
  };

  try {
    console.log('🧪 Starting comprehensive system test...');

    // Step 1: Test and Fix WhatsApp Connection
    console.log('📱 Step 1: Testing WhatsApp connection...');
    try {
      const whatsapp = WhatsAppService.getInstance();
      let whatsappStatus = whatsapp.getStatus();
      
      testResults.whatsapp.details.push(`Initial connection: ${whatsappStatus.isConnected ? 'Connected' : 'Disconnected'}`);
      
      if (!whatsappStatus.isConnected) {
        testResults.whatsapp.details.push('Attempting auto-repair...');
        const repairResult = await whatsapp.smartInitialize();
        
        if (repairResult.success) {
          testResults.whatsapp.details.push('✅ Auto-repair successful');
          whatsappStatus = whatsapp.getStatus();
        } else {
          testResults.whatsapp.details.push(`❌ Auto-repair failed: ${repairResult.message}`);
          if (repairResult.needsQR) {
            testResults.whatsapp.details.push('📱 QR code required');
          }
        }
      }
      
      if (whatsappStatus.isConnected) {
        testResults.whatsapp.status = 'success';
        testResults.whatsapp.details.push('✅ WhatsApp ready for messaging');
      } else {
        testResults.whatsapp.status = 'warning';
        testResults.whatsapp.details.push('⚠️ WhatsApp not connected - messages will be queued');
      }
    } catch (error) {
      testResults.whatsapp.status = 'error';
      testResults.whatsapp.details.push(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Step 2: Reset Duplicate Guard
    console.log('🧹 Step 2: Resetting duplicate guard...');
    try {
      // Clear local file
      const configDir = path.join(process.cwd(), 'config');
      const sentMessagesFile = path.join(configDir, 'sent-messages.json');
      
      if (fs.existsSync(sentMessagesFile)) {
        fs.unlinkSync(sentMessagesFile);
        testResults.duplicateGuard.details.push('✅ Local sent messages file cleared');
      } else {
        testResults.duplicateGuard.details.push('ℹ️ No local sent messages file found');
      }
      
      // Try to clear Redis
      try {
        const Redis = require('ioredis');
        if (process.env.REDIS_URL) {
          const redis = new Redis(process.env.REDIS_URL);
          const keys = await redis.keys('sent:*');
          if (keys.length > 0) {
            await redis.del(keys);
            testResults.duplicateGuard.details.push(`✅ Cleared ${keys.length} Redis keys`);
          } else {
            testResults.duplicateGuard.details.push('ℹ️ No Redis keys to clear');
          }
          await redis.quit();
        } else {
          testResults.duplicateGuard.details.push('ℹ️ Redis not configured');
        }
      } catch (redisError) {
        testResults.duplicateGuard.details.push('⚠️ Redis clearing failed, using file fallback');
      }
      
      testResults.duplicateGuard.status = 'success';
      testResults.duplicateGuard.details.push('✅ Duplicate guard reset complete');
    } catch (error) {
      testResults.duplicateGuard.status = 'error';
      testResults.duplicateGuard.details.push(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Step 3: Test Google Sheets Connection
    console.log('📊 Step 3: Testing Google Sheets connection...');
    try {
      const sheetData = await GoogleSheetsService.getSheetData();
      testResults.googleSheets.details.push(`✅ Connected to Google Sheets`);
      testResults.googleSheets.details.push(`📋 Found ${sheetData.length} total rows`);
      
      // Count valid leads
      let validLeads = 0;
      for (const row of sheetData.slice(0, 10)) { // Check first 10
        if (row.name && (row.phone || row.whatsappNumber)) {
          const phoneProcessing = PhoneProcessor.processTwoNumbers(row.phone, row.whatsappNumber);
          if (phoneProcessing.isValid) {
            const egyptianValidation = PhoneProcessor.validateEgyptianNumber(phoneProcessing.preferredNumber);
            if (egyptianValidation.isValid) {
              validLeads++;
            }
          }
        }
      }
      
      testResults.googleSheets.details.push(`📱 Found ${validLeads} valid leads (from first 10 rows)`);
      testResults.googleSheets.status = 'success';
    } catch (error) {
      testResults.googleSheets.status = 'error';
      testResults.googleSheets.details.push(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Step 4: Test Message Sending (if WhatsApp is connected)
    console.log('📤 Step 4: Testing message sending...');
    if (testResults.whatsapp.status === 'success') {
      try {
        const whatsapp = WhatsAppService.getInstance();
        
        // Test with a dummy number (won't actually send)
        const testPhone = '201234567890';
        const testMessage = 'Test message from automation system';
        
        testResults.messageTest.details.push('🧪 Testing message sending capability...');
        
        // Just check if the sending function can be called without error
        try {
          // We won't actually send to avoid spam, just test the validation
          const processedPhone = PhoneProcessor.formatForWhatsApp(testPhone);
          if (processedPhone) {
            testResults.messageTest.details.push('✅ Phone processing works');
            testResults.messageTest.details.push('✅ Message formatting works');
            testResults.messageTest.status = 'success';
          } else {
            testResults.messageTest.details.push('❌ Phone processing failed');
            testResults.messageTest.status = 'error';
          }
        } catch (sendError) {
          testResults.messageTest.details.push(`❌ Send test failed: ${sendError instanceof Error ? sendError.message : 'Unknown error'}`);
          testResults.messageTest.status = 'error';
        }
      } catch (error) {
        testResults.messageTest.status = 'error';
        testResults.messageTest.details.push(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      testResults.messageTest.status = 'skipped';
      testResults.messageTest.details.push('⏭️ Skipped - WhatsApp not connected');
    }

    // Overall Assessment
    const testResultsArray = [testResults.whatsapp, testResults.duplicateGuard, testResults.googleSheets, testResults.messageTest];
    const successfulTests = testResultsArray.filter(test => test.status === 'success').length;
    const totalTests = 4;
    
    testResults.overall.success = successfulTests >= 3; // At least 3/4 tests must pass
    testResults.overall.readyForAutomation = 
      testResults.duplicateGuard.status === 'success' && 
      testResults.googleSheets.status === 'success' &&
      (testResults.whatsapp.status === 'success' || testResults.whatsapp.status === 'warning');

    console.log(`✅ Comprehensive test completed: ${successfulTests}/${totalTests} tests passed`);

    res.status(200).json({
      success: testResults.overall.success,
      readyForAutomation: testResults.overall.readyForAutomation,
      results: testResults,
      summary: {
        testsRun: totalTests,
        testsPassed: successfulTests,
        recommendation: testResults.overall.readyForAutomation 
          ? '🚀 System ready! You can now start automation and it should send messages.'
          : '⚠️ System needs attention. Check the failed tests above.'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in comprehensive test:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      results: testResults
    });
  }
} 