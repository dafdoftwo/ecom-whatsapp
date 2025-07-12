import { NextResponse } from 'next/server';
import { ConfigService } from '@/lib/services/config';
import path from 'path';
import fs from 'fs';

export async function GET() {
  try {
    console.log('🔍 Starting system information check...');
    
    // Environment information
    const environment = {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      nodeEnv: process.env.NODE_ENV,
      isRailway: !!(process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_PROJECT_NAME),
      isDocker: !!(process.env.DOCKER_CONTAINER || process.env.NODE_ENV === 'production'),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cwd: process.cwd()
    };

    // Config directory check
    const configDir = path.join(process.cwd(), 'config');
    const configStatus = {
      exists: fs.existsSync(configDir),
      readable: false,
      files: [] as string[]
    };

    if (configStatus.exists) {
      try {
        const files = fs.readdirSync(configDir);
        configStatus.files = files;
        configStatus.readable = true;
      } catch (error) {
        console.error('Error reading config directory:', error);
      }
    }

    // Check configuration health
    const configHealth = await ConfigService.getConfigHealth();

    // Environment variables (safe ones only)
    const envVars = {
      NODE_ENV: process.env.NODE_ENV,
      RAILWAY_PROJECT_ID: process.env.RAILWAY_PROJECT_ID ? 'Set' : 'Not set',
      RAILWAY_PROJECT_NAME: process.env.RAILWAY_PROJECT_NAME ? 'Set' : 'Not set',
      DOCKER_CONTAINER: process.env.DOCKER_CONTAINER ? 'Set' : 'Not set',
      PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD,
      PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH,
      CHROME_BIN: process.env.CHROME_BIN,
      CHROME_PATH: process.env.CHROME_PATH,
      REDIS_HOST: process.env.REDIS_HOST ? 'Set' : 'Not set',
      REDIS_PORT: process.env.REDIS_PORT ? 'Set' : 'Not set',
      REDIS_PASSWORD: process.env.REDIS_PASSWORD ? 'Set' : 'Not set'
    };

    const systemInfo = {
      environment,
      configDirectory: configStatus,
      configHealth,
      envVars,
      timestamp: new Date().toISOString()
    };

    console.log('✅ System information check completed');
    
    return NextResponse.json({
      success: true,
      systemInfo
    });

  } catch (error) {
    console.error('❌ System information check failed:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: 'System information check failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
} 