import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔄 Resetting automation engine status history...');
    
    // Since we can't directly access the AutomationEngine's private static variables,
    // we'll create a flag that can be checked by the automation engine
    const statusResetFlag = {
      resetRequested: true,
      resetTime: Date.now(),
      reason: 'Manual reset via API to trigger fresh message sending'
    };
    
    // Store this flag in a temporary file that the automation engine can check
    const fs = require('fs');
    const path = require('path');
    
    const configDir = path.join(process.cwd(), 'config');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    const resetFlagFile = path.join(configDir, 'status-history-reset.json');
    fs.writeFileSync(resetFlagFile, JSON.stringify(statusResetFlag, null, 2));
    
    console.log('✅ Status history reset flag created');
    
    res.status(200).json({
      success: true,
      message: 'Status history reset flag created. The automation engine will detect this and reset on next cycle.',
      resetTime: new Date(statusResetFlag.resetTime).toISOString(),
      note: 'This will cause all current leads to be treated as new leads and trigger message sending.',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error resetting status history:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 