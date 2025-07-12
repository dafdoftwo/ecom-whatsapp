import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
  try {
    console.log('🔍 Testing Puppeteer and Chromium configuration...');
    
    // Test environment variables
    const envVars = {
      NODE_ENV: process.env.NODE_ENV,
      DOCKER_CONTAINER: process.env.DOCKER_CONTAINER,
      RAILWAY_PROJECT_ID: process.env.RAILWAY_PROJECT_ID,
      RAILWAY_PROJECT_NAME: process.env.RAILWAY_PROJECT_NAME,
      PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD,
      PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH,
      CHROME_BIN: process.env.CHROME_BIN,
      CHROME_PATH: process.env.CHROME_PATH
    };

    console.log('📋 Environment variables:', envVars);

    // Test Chromium availability
    let chromiumTest = { available: false, path: '', version: '', error: '' };
    
    try {
      // Test different possible paths
      const chromiumPaths = [
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable'
      ];

      for (const path of chromiumPaths) {
        try {
          const { stdout } = await execAsync(`${path} --version 2>/dev/null || echo "not found"`);
          if (!stdout.includes('not found')) {
            chromiumTest = {
              available: true,
              path: path,
              version: stdout.trim(),
              error: ''
            };
            break;
          }
        } catch (error) {
          // Continue to next path
        }
      }

      if (!chromiumTest.available) {
        chromiumTest.error = 'Chromium not found in any standard path';
      }
    } catch (error) {
      chromiumTest.error = `Error testing Chromium: ${error}`;
    }

    // Test basic Puppeteer import
    let puppeteerTest = { importable: false, error: '' };
    try {
      const puppeteer = require('puppeteer');
      puppeteerTest.importable = true;
      console.log('✅ Puppeteer import successful');
    } catch (error) {
      puppeteerTest.error = `Error importing Puppeteer: ${error}`;
      console.error('❌ Puppeteer import failed:', error);
    }

    // Test whatsapp-web.js import
    let whatsappTest = { importable: false, error: '' };
    try {
      const { Client } = require('whatsapp-web.js');
      whatsappTest.importable = true;
      console.log('✅ whatsapp-web.js import successful');
    } catch (error) {
      whatsappTest.error = `Error importing whatsapp-web.js: ${error}`;
      console.error('❌ whatsapp-web.js import failed:', error);
    }

    // Test file system permissions
    let fsTest = { writable: false, sessionPath: '', error: '' };
    try {
      const fs = require('fs');
      const path = require('path');
      
      const sessionPath = path.resolve('./whatsapp-session-pro');
      fsTest.sessionPath = sessionPath;
      
      // Test if we can create directory
      if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
      }
      
      // Test if we can write to directory
      const testFile = path.join(sessionPath, 'test.txt');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      
      fsTest.writable = true;
      console.log('✅ File system test successful');
    } catch (error) {
      fsTest.error = `File system error: ${error}`;
      console.error('❌ File system test failed:', error);
    }

    // Environment detection
    const isRailway = !!(process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_PROJECT_NAME);
    const isDocker = !!(process.env.DOCKER_CONTAINER || process.env.NODE_ENV === 'production');

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (!chromiumTest.available) {
      recommendations.push('❌ Chromium not found - ensure it\'s installed in Docker image');
    } else {
      recommendations.push('✅ Chromium is available and working');
    }

    if (!puppeteerTest.importable) {
      recommendations.push('❌ Puppeteer import failed - check dependencies');
    } else {
      recommendations.push('✅ Puppeteer is importable');
    }

    if (!whatsappTest.importable) {
      recommendations.push('❌ whatsapp-web.js import failed - check dependencies');
    } else {
      recommendations.push('✅ whatsapp-web.js is importable');
    }

    if (!fsTest.writable) {
      recommendations.push('❌ File system not writable - check permissions');
    } else {
      recommendations.push('✅ File system is writable');
    }

    if (isRailway && chromiumTest.available && puppeteerTest.importable && whatsappTest.importable && fsTest.writable) {
      recommendations.push('🎉 All systems ready for WhatsApp initialization!');
    }

    const diagnostics = {
      environment: {
        isRailway,
        isDocker,
        isProduction: process.env.NODE_ENV === 'production',
        platform: process.platform,
        arch: process.arch
      },
      envVars,
      chromium: chromiumTest,
      puppeteer: puppeteerTest,
      whatsapp: whatsappTest,
      filesystem: fsTest,
      recommendations
    };

    return NextResponse.json({
      success: true,
      message: 'Puppeteer diagnostics completed',
      diagnostics,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in Puppeteer test:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to run Puppeteer diagnostics',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 