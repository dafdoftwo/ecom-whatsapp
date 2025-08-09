import { NextApiRequest, NextApiResponse } from 'next';
import { DuplicateGuardService } from '../../../lib/services/duplicate-guard';
import fs from 'fs';
import path from 'path';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🧹 Resetting duplicate guard state for testing...');
    
    // Clear the local file store
    const configDir = path.join(process.cwd(), 'config');
    const sentMessagesFile = path.join(configDir, 'sent-messages.json');
    
    if (fs.existsSync(sentMessagesFile)) {
      fs.unlinkSync(sentMessagesFile);
      console.log('✅ Local sent-messages.json file cleared');
    }
    
    // Try to clear Redis (if available)
    try {
      // We'll need to access the Redis store directly
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
      console.log('⚠️ Redis clearing failed (using file fallback):', redisError);
    }
    
    console.log('✅ Duplicate guard state reset completed');
    
    res.status(200).json({
      success: true,
      message: 'Duplicate guard state reset successfully. All messages can now be sent again.',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error resetting duplicate guard:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 