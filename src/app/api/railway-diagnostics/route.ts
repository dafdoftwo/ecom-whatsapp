import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { WhatsAppService } from '@/lib/services/whatsapp';
import { ConfigService } from '@/lib/services/config';
import { GoogleSheetsService } from '@/lib/services/google-sheets';

export async function GET() {
  try {
    console.log('🚂 Running Railway diagnostics...');
    
    const diagnostics: {
      timestamp: string;
      environment: any;
      directories: any;
      environmentVariables: any;
      fileSystem: {
        configFiles: any;
        directories: {
          whatsappSession?: any;
        };
        permissions: {
          tempWrite?: boolean;
        };
        error?: string;
      };
      services: {
        whatsapp: any;
        config: any;
        googleSheets: any;
      };
      issues: string[];
      recommendations: string[];
    } = {
      timestamp: new Date().toISOString(),
      environment: {
        nodeEnv: process.env.NODE_ENV,
        isProduction: process.env.NODE_ENV === 'production',
        platform: process.platform,
        nodeVersion: process.version,
        isRailway: !!process.env.RAILWAY_ENVIRONMENT
      },
      directories: {
        cwd: process.cwd(),
        configDir: path.join(process.cwd(), 'config'),
        whatsappSessionDir: process.env.WHATSAPP_SESSION_PATH || 'Not set',
        tempDir: '/tmp'
      },
      environmentVariables: {
        redisUrl: process.env.REDIS_URL ? 'Set' : 'Missing',
        googleSpreadsheetId: process.env.GOOGLE_SPREADSHEET_ID ? 'Set' : 'Missing',
        googleServiceKey: process.env.GOOGLE_SERVICE_ACCOUNT_KEY ? 'Set (length: ' + process.env.GOOGLE_SERVICE_ACCOUNT_KEY.length + ')' : 'Missing',
        port: process.env.PORT || '3000',
        railwayEnv: process.env.RAILWAY_ENVIRONMENT || 'Not on Railway'
      },
      fileSystem: {
        configFiles: {},
        directories: {},
        permissions: {}
      },
      services: {
        whatsapp: {},
        config: {},
        googleSheets: {}
      },
      issues: [],
      recommendations: []
    };

    // Check file system
    try {
      // Check config directory
      const configDir = path.join(process.cwd(), 'config');
      try {
        const configFiles = await fs.readdir(configDir);
        diagnostics.fileSystem.configFiles = {
          exists: true,
          files: configFiles
        };
      } catch (error) {
        diagnostics.fileSystem.configFiles = {
          exists: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
        diagnostics.issues.push('❌ Config directory not found or not accessible');
      }

      // Check if we can write to temp
      try {
        const testFile = path.join('/tmp', 'railway-test.txt');
        await fs.writeFile(testFile, 'test');
        await fs.unlink(testFile);
        diagnostics.fileSystem.permissions.tempWrite = true;
      } catch (error) {
        diagnostics.fileSystem.permissions.tempWrite = false;
        diagnostics.issues.push('❌ Cannot write to /tmp directory');
      }

      // Check WhatsApp session directory
      const sessionPath = process.env.WHATSAPP_SESSION_PATH || path.join(process.cwd(), 'whatsapp-session');
      try {
        await fs.access(sessionPath, fs.constants.W_OK);
        diagnostics.fileSystem.directories.whatsappSession = {
          exists: true,
          writable: true,
          path: sessionPath
        };
      } catch (error) {
        diagnostics.fileSystem.directories.whatsappSession = {
          exists: false,
          writable: false,
          path: sessionPath,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
        
        // Try to create it
        try {
          await fs.mkdir(sessionPath, { recursive: true });
          diagnostics.fileSystem.directories.whatsappSession.created = true;
        } catch (createError) {
          diagnostics.issues.push('❌ Cannot create WhatsApp session directory');
        }
      }
    } catch (error) {
      diagnostics.fileSystem.error = error instanceof Error ? error.message : 'Unknown error';
    }

    // Check WhatsApp service
    try {
      const whatsapp = WhatsAppService.getInstance();
      const status = whatsapp.getStatus();
      diagnostics.services.whatsapp = {
        initialized: true,
        status: status,
        sessionPath: 'See whatsappSessionDir in directories section'
      };
      
      if (!status.isConnected) {
        diagnostics.issues.push('⚠️ WhatsApp not connected');
      }
    } catch (error) {
      diagnostics.services.whatsapp = {
        initialized: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      diagnostics.issues.push('❌ WhatsApp service initialization failed');
    }

    // Check Config service
    try {
      const configHealth = await ConfigService.getConfigHealth();
      diagnostics.services.config = {
        initialized: true,
        health: configHealth
      };
      
      if (!configHealth.google.configured) {
        diagnostics.issues.push('❌ Google configuration not complete');
      }
    } catch (error) {
      diagnostics.services.config = {
        initialized: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      diagnostics.issues.push('❌ Config service initialization failed');
    }

    // Check Google Sheets
    try {
      const validation = await GoogleSheetsService.validateConfiguration();
      diagnostics.services.googleSheets = {
        initialized: true,
        validation: validation
      };
      
      if (!validation.isValid) {
        diagnostics.issues.push('❌ Google Sheets configuration invalid');
        validation.errors.forEach(error => {
          diagnostics.issues.push(`  • ${error}`);
        });
      }
    } catch (error) {
      diagnostics.services.googleSheets = {
        initialized: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      diagnostics.issues.push('❌ Google Sheets service initialization failed');
    }

    // Generate recommendations
    if (diagnostics.issues.length === 0) {
      diagnostics.recommendations.push('✅ All systems operational on Railway');
    } else {
      diagnostics.recommendations.push('🔧 Fix the following issues:');
      
      if (!diagnostics.environmentVariables.redisUrl) {
        diagnostics.recommendations.push('1️⃣ Add Redis service in Railway and set REDIS_URL');
      }
      
      if (!diagnostics.environmentVariables.googleSpreadsheetId || !diagnostics.environmentVariables.googleServiceKey) {
        diagnostics.recommendations.push('2️⃣ Set Google Sheets environment variables:');
        diagnostics.recommendations.push('   - GOOGLE_SPREADSHEET_ID');
        diagnostics.recommendations.push('   - GOOGLE_SERVICE_ACCOUNT_KEY');
      }
      
      if (diagnostics.fileSystem.configFiles && !diagnostics.fileSystem.configFiles.exists) {
        diagnostics.recommendations.push('3️⃣ Ensure config files are included in deployment');
        diagnostics.recommendations.push('   - Check Dockerfile COPY commands');
        diagnostics.recommendations.push('   - Verify .dockerignore is not excluding config/');
      }
      
      if (diagnostics.services.whatsapp.status && !diagnostics.services.whatsapp.status.isConnected) {
        diagnostics.recommendations.push('4️⃣ WhatsApp needs to be reconnected after deployment');
        diagnostics.recommendations.push('   - Use POST /api/whatsapp/initialize');
        diagnostics.recommendations.push('   - Scan QR code to establish new session');
      }
    }

    return NextResponse.json({
      success: true,
      diagnostics
    });

  } catch (error) {
    console.error('❌ Railway diagnostics failed:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Railway diagnostics failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 