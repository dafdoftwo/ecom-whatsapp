import { NextResponse } from 'next/server';
import { WhatsAppService } from '@/lib/services/whatsapp';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export async function POST() {
  try {
    console.log('🚨 FORCE CLEANUP: Emergency Chrome process cleanup initiated...');
    
    const whatsapp = WhatsAppService.getInstance();
    
    // Step 1: Destroy current client if exists
    try {
      await whatsapp.destroy();
      console.log('✅ WhatsApp client destroyed');
    } catch (error) {
      console.warn('⚠️ Error destroying client (continuing):', error);
    }
    
    // Step 2: Force kill all Chrome processes related to our session
    try {
      console.log('🔫 Force killing Chrome processes...');
      
      // Kill any Chrome/Chromium processes with our client ID
      await execAsync(`pkill -f "chromium.*whatsapp-automation-pro" 2>/dev/null || true`);
      await execAsync(`pkill -f "chrome.*whatsapp-automation-pro" 2>/dev/null || true`);
      
      // Also kill any orphaned Chrome processes
      await execAsync(`pkill -f "chrome.*--user-data-dir.*whatsapp" 2>/dev/null || true`);
      await execAsync(`pkill -f "chromium.*--user-data-dir.*whatsapp" 2>/dev/null || true`);
      
      console.log('✅ Chrome processes terminated');
    } catch (error) {
      console.warn('⚠️ Error killing Chrome processes:', error);
    }
    
    // Step 3: Remove all lock files
    try {
      console.log('🗑️ Removing singleton lock files...');
      
      const sessionPath = path.resolve('./whatsapp-session-pro');
      if (fs.existsSync(sessionPath)) {
        // Remove singleton locks recursively
        await removeLockFilesRecursively(sessionPath);
      }
      
      console.log('✅ Lock files removed');
    } catch (error) {
      console.warn('⚠️ Error removing lock files:', error);
    }
    
    // Step 4: Reset WhatsApp service instance
    try {
      WhatsAppService.resetInstance();
      console.log('✅ WhatsApp service instance reset');
    } catch (error) {
      console.warn('⚠️ Error resetting instance:', error);
    }
    
    // Step 5: Wait a moment for cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    return NextResponse.json({
      success: true,
      message: 'Emergency cleanup completed successfully',
      timestamp: new Date().toISOString(),
      actions: [
        'Chrome processes terminated',
        'Singleton lock files removed', 
        'WhatsApp service instance reset',
        'System ready for fresh initialization'
      ]
    });
    
  } catch (error) {
    console.error('❌ Force cleanup failed:', error);
    
    return NextResponse.json({
      success: false,
      message: 'Emergency cleanup failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      recommendation: 'Try manual server restart if problem persists'
    }, { status: 500 });
  }
}

// Helper function to remove lock files recursively
async function removeLockFilesRecursively(dirPath: string): Promise<void> {
  try {
    const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);
      
      if (item.isDirectory()) {
        await removeLockFilesRecursively(fullPath);
      } else if (item.name.includes('Lock') || item.name.includes('lock') || 
                 item.name.includes('LOCK') || item.name === 'SingletonLock') {
        try {
          await fs.promises.unlink(fullPath);
          console.log(`🗑️ Removed lock file: ${item.name}`);
        } catch (error) {
          console.warn(`⚠️ Could not remove lock file ${item.name}:`, error);
        }
      }
    }
  } catch (error) {
    console.warn(`⚠️ Could not read directory ${dirPath}:`, error);
  }
}

export async function GET() {
  try {
    // Return current Chrome process status
    const { stdout: chromeProcs } = await execAsync(`ps aux | grep -E "(chrome|chromium).*whatsapp" | grep -v grep || echo "No Chrome processes found"`);
    
    const sessionPath = path.resolve('./whatsapp-session-pro');
    const lockFiles: string[] = [];
    
    if (fs.existsSync(sessionPath)) {
      await findLockFiles(sessionPath, lockFiles);
    }
    
    return NextResponse.json({
      chromeProcesses: chromeProcs.trim().split('\n').filter(line => line.length > 0),
      lockFiles,
      sessionExists: fs.existsSync(sessionPath),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to get cleanup status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Helper function to find lock files
async function findLockFiles(dirPath: string, lockFiles: string[]): Promise<void> {
  try {
    const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);
      
      if (item.isDirectory()) {
        await findLockFiles(fullPath, lockFiles);
      } else if (item.name.includes('Lock') || item.name.includes('lock') || 
                 item.name.includes('LOCK') || item.name === 'SingletonLock') {
        lockFiles.push(fullPath);
      }
    }
  } catch (error) {
    // Directory might not exist or be readable
  }
} 