import { Client, LocalAuth, MessageMedia, Events, ClientInfo } from 'whatsapp-web.js';
import QRCode from 'qrcode';
import type { MessageJob } from './queue';
import { PhoneProcessor } from './phone-processor';
import path from 'path';
import fs from 'fs';

// Polyfill fetch for Node.js environment (required by whatsapp-web.js)
const setupFetchPolyfill = async () => {
  if (typeof global !== 'undefined' && !global.fetch) {
    try {
      // Use commonjs require for node-fetch v2
      const fetch = require('node-fetch');
      
      // Adding fetch to global scope
      (global as any).fetch = fetch;
      (global as any).Headers = fetch.Headers;
      (global as any).Request = fetch.Request;
      (global as any).Response = fetch.Response;
      
      console.log('✅ Fetch polyfill loaded successfully (v2)');
    } catch (error) {
      console.warn('❌ Could not load fetch polyfill:', error);
    }
  } else {
    console.log('📱 Fetch already available');
  }
};

// Initialize fetch polyfill immediately and wait for it
let fetchPolyfillReady: Promise<void> | null = null;

const ensureFetchPolyfill = async () => {
  if (!fetchPolyfillReady) {
    fetchPolyfillReady = setupFetchPolyfill();
  }
  await fetchPolyfillReady;
};

// Session management configuration
const SESSION_CONFIG = {
  CLIENT_ID: 'whatsapp-automation-pro',
  SESSION_PATH: './whatsapp-session-pro',
  MAX_SESSION_SIZE_MB: 200, // Maximum session size before cleanup
  SESSION_TIMEOUT_MS: 20000, // تقليل إلى 20 ثانية بدلاً من 45
  PUPPETEER_TIMEOUT_MS: 15000, // تقليل إلى 15 ثانية بدلاً من 30
  MAX_INIT_RETRIES: 2,
  HEALTH_CHECK_INTERVAL_MS: 30000, // 30 seconds
};

export class WhatsAppService {
  private static instance: WhatsAppService | null = null;
  private client: Client | null = null;
  private qrCode: string | null = null;
  private isConnected: boolean = false;
  private clientInfo: ClientInfo | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;
  private reconnectDelay: number = 5000; // 5 seconds
  private isInitializing: boolean = false;
  private initializationPromise: Promise<void> | null = null;
  private initRetries: number = 0;

  private constructor() {
    // Private constructor for singleton pattern
    // Start connection health monitoring
    this.startHealthMonitoring();
  }

  private healthCheckInterval: NodeJS.Timeout | null = null;
  private lastHealthCheck: Date = new Date();

  private startHealthMonitoring(): void {
    // Check connection health every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, SESSION_CONFIG.HEALTH_CHECK_INTERVAL_MS);
  }

  private async performHealthCheck(): Promise<void> {
    if (!this.client || !this.isConnected) {
      return;
    }

    try {
      // Simple ping test
      const state = await this.client.getState();
      this.lastHealthCheck = new Date();
      
      if (state !== 'CONNECTED') {
        console.warn(`⚠️ WhatsApp state changed to: ${state}`);
        if (state === 'UNPAIRED' || state === 'TIMEOUT') {
          this.isConnected = false;
          console.log('🔄 Auto-reconnecting due to health check failure...');
          this.attemptReconnect();
        }
      }
    } catch (error) {
      console.error('❌ Health check failed:', error);
      this.isConnected = false;
      // Auto-reconnect on health check failure
      this.attemptReconnect();
    }
  }

  private async attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log(`❌ Max reconnection attempts (${this.maxReconnectAttempts}) reached. Stopping auto-reconnect.`);
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts; // Exponential backoff
    
    console.log(`🔄 Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms...`);
    
    setTimeout(async () => {
      try {
        await this.initialize();
        console.log('✅ Reconnection successful!');
        this.reconnectAttempts = 0; // Reset on successful connection
      } catch (error) {
        console.error(`❌ Reconnection attempt ${this.reconnectAttempts} failed:`, error);
      }
    }, delay);
  }

  /**
   * Validate session integrity and size
   */
  private async validateSession(): Promise<{ isValid: boolean; reason?: string; shouldCleanup: boolean }> {
    try {
      const sessionPath = path.resolve(SESSION_CONFIG.SESSION_PATH);
      
      if (!fs.existsSync(sessionPath)) {
        return { isValid: false, reason: 'Session does not exist', shouldCleanup: false };
      }

      // Check session size
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      try {
        const { stdout } = await execAsync(`du -sm "${sessionPath}"`);
        const sizeMB = parseInt(stdout.split('\t')[0]);
        
        if (sizeMB > SESSION_CONFIG.MAX_SESSION_SIZE_MB) {
          return { 
            isValid: false, 
            reason: `Session too large: ${sizeMB}MB > ${SESSION_CONFIG.MAX_SESSION_SIZE_MB}MB`,
            shouldCleanup: true 
          };
        }
      } catch (error) {
        console.warn('Could not check session size:', error);
      }

      // Check for critical session files
      const criticalFiles = [
        'Default/Local Storage/leveldb',
        'Default/Session Storage',
      ];

      for (const file of criticalFiles) {
        const filePath = path.join(sessionPath, `session-${SESSION_CONFIG.CLIENT_ID}`, file);
        if (!fs.existsSync(filePath)) {
          return { 
            isValid: false, 
            reason: `Missing critical session file: ${file}`,
            shouldCleanup: true 
          };
        }
      }

      return { isValid: true, shouldCleanup: false };
    } catch (error) {
      console.error('Error validating session:', error);
      return { isValid: false, reason: 'Validation error', shouldCleanup: true };
    }
  }

  /**
   * Clean up old/corrupted sessions
   */
  private async cleanupOldSessions(): Promise<void> {
    try {
      console.log('🧹 Cleaning up old sessions...');
      
      // Remove old session directories
      const oldSessionPaths = [
        './whatsapp-session',
        './whatsapp-session-v2',
        './whatsapp-session-v3'
      ];

      for (const oldPath of oldSessionPaths) {
        const resolvedPath = path.resolve(oldPath);
        if (fs.existsSync(resolvedPath)) {
          await fs.promises.rm(resolvedPath, { recursive: true, force: true });
          console.log(`🗑️ Removed old session: ${oldPath}`);
        }
      }

      console.log('✅ Old sessions cleaned up');
    } catch (error) {
      console.error('Error cleaning up old sessions:', error);
    }
  }

  public getConnectionHealth(): {
    isHealthy: boolean;
    lastHealthCheck: Date;
    uptime: number;
    status: string;
    reconnectAttempts: number;
    isInitializing: boolean;
  } {
    const uptime = this.isConnected ? Date.now() - this.lastHealthCheck.getTime() : 0;
    return {
      isHealthy: this.isConnected && (Date.now() - this.lastHealthCheck.getTime()) < 300000, // 5 minutes
      lastHealthCheck: this.lastHealthCheck,
      uptime,
      status: this.isConnected ? 'healthy' : this.isInitializing ? 'initializing' : 'disconnected',
      reconnectAttempts: this.reconnectAttempts,
      isInitializing: this.isInitializing
    };
  }

  public static getInstance(): WhatsAppService {
    if (!WhatsAppService.instance) {
      WhatsAppService.instance = new WhatsAppService();
    }
    return WhatsAppService.instance;
  }

  public static resetInstance(): void {
    if (WhatsAppService.instance) {
      WhatsAppService.instance.cleanup();
      WhatsAppService.instance = null;
    }
  }

  public async initialize(): Promise<void> {
    // Prevent multiple concurrent initializations
    if (this.isInitializing && this.initializationPromise) {
      console.log('⏳ Initialization already in progress, waiting...');
      return this.initializationPromise;
    }

    this.isInitializing = true;
    
    this.initializationPromise = this.doInitialize();
    
    try {
      await this.initializationPromise;
    } finally {
      this.isInitializing = false;
      this.initializationPromise = null;
    }
  }

  private async doInitialize(): Promise<void> {
    try {
      console.log('🔄 Starting professional WhatsApp initialization...');

      // Step 1: Clean up old sessions first
      await this.cleanupOldSessions();

      // Step 2: Validate current session
      const sessionValidation = await this.validateSession();
      if (!sessionValidation.isValid && sessionValidation.shouldCleanup) {
        console.log(`🧹 Session invalid (${sessionValidation.reason}), cleaning up...`);
        await this.clearSession();
      }

      // Step 3: Force cleanup any existing client
      if (this.client) {
        console.log('🧹 Cleaning up existing WhatsApp client...');
        await this.cleanup();
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Step 4: Setup fetch polyfill
      console.log('📡 Setting up fetch polyfill...');
      await ensureFetchPolyfill();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Step 5: Detect environment and set Puppeteer path
      const isRailway = process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_PROJECT_NAME;
      const isDocker = process.env.DOCKER_CONTAINER || process.env.NODE_ENV === 'production';
      
      let puppeteerConfig: any = {
          headless: true,
        timeout: SESSION_CONFIG.PUPPETEER_TIMEOUT_MS,
        defaultViewport: { width: 1280, height: 720 },
        ignoreHTTPSErrors: true,
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-extensions',
            '--disable-plugins',
            '--disable-images',
            '--no-default-browser-check',
            '--disable-default-apps',
          '--single-process',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI,VizDisplayCompositor',
            '--memory-pressure-off',
          '--max_old_space_size=4096',
          '--disable-ipc-flooding-protection'
        ]
      };

      // Railway/Docker specific configuration
      if (isRailway || isDocker) {
        console.log('🐳 Detected Railway/Docker environment - using optimized settings');
        puppeteerConfig.executablePath = '/usr/bin/chromium-browser';
        puppeteerConfig.args.push(
          '--disable-gpu-sandbox',
          '--disable-software-rasterizer',
            '--disable-background-downloads',
            '--disable-add-to-shelf',
            '--disable-client-side-phishing-detection',
          '--no-crash-upload',
          '--disable-hang-monitor',
          '--disable-prompt-on-repost'
        );
      }
      
      // Step 6: Create new client with optimized settings
      console.log('🏗️ Creating WhatsApp client with Railway-optimized settings...');
      this.client = new Client({
        authStrategy: new LocalAuth({
          clientId: SESSION_CONFIG.CLIENT_ID,
          dataPath: SESSION_CONFIG.SESSION_PATH
        }),
        puppeteer: puppeteerConfig,
        takeoverOnConflict: true,
        takeoverTimeoutMs: 10000
      });

      // Step 7: Setup event handlers
      console.log('🎯 Setting up event handlers...');
      this.setupEventHandlers();
      
      // Step 8: Initialize with timeout
      console.log('🚀 Starting WhatsApp client initialization...');
      
      const initPromise = this.client.initialize();
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`WhatsApp initialization timeout after ${SESSION_CONFIG.SESSION_TIMEOUT_MS / 1000} seconds`));
        }, SESSION_CONFIG.SESSION_TIMEOUT_MS);
      });
      
      await Promise.race([initPromise, timeoutPromise]);
      
      console.log('✅ WhatsApp client initialized successfully');
      this.initRetries = 0; // Reset retry count on success
      
    } catch (error) {
      console.error('❌ Error initializing WhatsApp client:', error);
      
      // Clean up on error
      if (this.client) {
        try {
          await this.cleanup();
        } catch (cleanupError) {
          console.warn('Error during cleanup:', cleanupError);
        }
      }
      
      // Handle retries
      if (this.initRetries < SESSION_CONFIG.MAX_INIT_RETRIES) {
        this.initRetries++;
        console.log(`🔄 Retry ${this.initRetries}/${SESSION_CONFIG.MAX_INIT_RETRIES}: Clearing session and retrying...`);
        await this.clearSession();
        await new Promise(resolve => setTimeout(resolve, 3000));
        return this.doInitialize();
      }
      
      // Check if it's a timeout error and suggest clearing session
      if (error instanceof Error && error.message.includes('timeout')) {
        throw new Error(`WhatsApp initialization timed out after ${SESSION_CONFIG.SESSION_TIMEOUT_MS / 1000} seconds. Session may be corrupted. Please clear the session and try again.`);
      }
      
      throw new Error(`Failed to initialize WhatsApp client: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private setupEventHandlers(): void {
    if (!this.client) return;

    // QR Code generation
    this.client.on('qr', async (qr) => {
      try {
        console.log('📱 QR Code received from WhatsApp - waiting for scan...');
        // Generate QR code as data URL for proper display in browser
        this.qrCode = await QRCode.toDataURL(qr, {
          errorCorrectionLevel: 'M',
          type: 'image/png',
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          },
          width: 256
        });
        console.log('✅ QR Code generated successfully - length:', this.qrCode.length);
        console.log('👆 Please scan the QR code with your WhatsApp mobile app');
      } catch (error) {
        console.error('❌ Error generating QR code:', error);
        // Fallback: store raw QR string if image generation fails
        this.qrCode = `data:text/plain;base64,${Buffer.from(qr).toString('base64')}`;
        console.log('📝 Using raw QR as fallback');
      }
    });

    // Authentication events
    this.client.on('authenticated', () => {
      console.log('🔐 WhatsApp authenticated successfully - user scanned QR code!');
      this.isConnected = true;
      this.qrCode = null; // Clear QR code after successful authentication
      this.reconnectAttempts = 0; // Reset reconnect attempts on successful auth
    });

    this.client.on('auth_failure', (message) => {
      console.log('❌ WhatsApp authentication failed:', message);
      this.isConnected = false;
      this.qrCode = null;
    });

    // Ready event - This is when WhatsApp is fully connected and ready
    this.client.on('ready', () => {
      console.log('🎉 WhatsApp client is ready and fully connected!');
      this.isConnected = true;
      this.qrCode = null;
      this.reconnectAttempts = 0; // Reset reconnect attempts on ready
      
      // Get client info
      this.clientInfo = this.client?.info || null;
      this.lastHealthCheck = new Date();
      
      if (this.clientInfo) {
        console.log(`📞 Connected as: ${this.clientInfo.pushname} (${this.clientInfo.wid.user})`);
      }
    });

    // Disconnection events - Enhanced handling
    this.client.on('disconnected', (reason) => {
      console.log('🔌 WhatsApp disconnected:', reason);
      this.isConnected = false;
      this.qrCode = null;
      
      // Smart reconnection based on disconnect reason
      const reasonStr = String(reason);
      if (reasonStr.includes('NAVIGATION') || reasonStr.includes('navigation') || 
          reasonStr.includes('KICKED') || reasonStr.includes('kicked')) {
        console.log('🔄 Connection lost due to navigation or kick - attempting smart reconnect...');
        this.attemptReconnect();
      } else if (reasonStr === 'LOGOUT' || reasonStr.includes('logout')) {
        console.log('👋 User logged out - not attempting reconnect');
        this.resetState();
      } else {
        console.log('🔄 Unexpected disconnection - attempting reconnect after delay...');
        setTimeout(() => this.attemptReconnect(), 3000);
      }
    });

    // Loading screen events
    this.client.on('loading_screen', (percent, message) => {
      console.log(`⏳ WhatsApp loading: ${percent}% - ${message}`);
    });

    // Remote session saved event
    this.client.on('remote_session_saved', () => {
      console.log('💾 Remote session saved successfully');
    });

    // Additional debugging events
    this.client.on('change_state', (state) => {
      console.log(`🔄 WhatsApp state changed to: ${state}`);
    });

    this.client.on('change_battery', (batteryInfo) => {
      console.log(`🔋 Phone battery: ${batteryInfo.battery}% (${batteryInfo.plugged ? 'charging' : 'not charging'})`);
    });
  }

  public async sendMessage(phoneNumber: string, message: string): Promise<boolean> {
    // Check if client is ready or try to initialize if needed
    if (!this.client || !this.isConnected) {
      console.warn('⚠️ WhatsApp client not ready, attempting to reconnect...');
      
      // If we have a session but not connected, try to restore
      const sessionExists = await this.checkSessionExists();
      if (sessionExists && !this.isInitializing) {
        try {
          await this.initialize();
        } catch (error) {
          console.error('Failed to reconnect for message sending:', error);
          return false;
        }
      } else {
        console.error('WhatsApp client is not ready and no session exists');
        return false;
      }
    }

    try {
      // Process and validate phone number
      const processedPhone = PhoneProcessor.formatForWhatsApp(phoneNumber);
      if (!processedPhone) {
        console.error(`Invalid phone number format: ${phoneNumber}`);
        return false;
      }

      // Format for WhatsApp (add @c.us suffix)
      const whatsappId = `${processedPhone}@c.us`;
      
      console.log(`📤 Sending message to ${whatsappId}: ${message.substring(0, 50)}...`);

      // Check if number exists on WhatsApp with retry logic
      let numberDetails;
      let retries = 3;
      while (retries > 0) {
        try {
          numberDetails = await this.client!.getNumberId(whatsappId);
          break;
        } catch (error) {
          retries--;
          if (retries === 0) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      if (!numberDetails) {
        console.error(`Phone number ${processedPhone} is not registered on WhatsApp`);
        return false;
      }

      // Send the message with timeout
      const messagePromise = this.client!.sendMessage(numberDetails._serialized, message);
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Message timeout')), 30000)
      );

      await Promise.race([messagePromise, timeoutPromise]);
      console.log(`✅ Message sent successfully to ${processedPhone}`);
      return true;
    } catch (error) {
      console.error('❌ Error sending WhatsApp message:', error);
      
      // Check if it's a network error and client needs reconnection
      if (error instanceof Error && (
        error.message.includes('Session closed') || 
        error.message.includes('Protocol error') ||
        error.message.includes('Target closed') ||
        error.message.includes('Evaluation failed')
      )) {
        console.log('🔄 Connection issue detected, scheduling reconnection...');
        this.isConnected = false;
        // Schedule reconnection
        this.attemptReconnect();
      }
      
      return false;
    }
  }

  public async sendBulkMessages(contacts: Array<{ phone: string; message: string; name?: string }>): Promise<{
    successful: number;
    failed: number;
    details: Array<{ phone: string; success: boolean; error?: string }>;
  }> {
    const results = {
      successful: 0,
      failed: 0,
      details: [] as Array<{ phone: string; success: boolean; error?: string }>
    };

    // Process in smaller batches to avoid overwhelming WhatsApp
    const batchSize = 10;
    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize);
      
      for (const contact of batch) {
        try {
          const success = await this.sendMessage(contact.phone, contact.message);
          
          if (success) {
            results.successful++;
            results.details.push({ phone: contact.phone, success: true });
          } else {
            results.failed++;
            results.details.push({ phone: contact.phone, success: false, error: 'Failed to send message' });
          }

          // Smart delay based on success rate
          const successRate = results.successful / (results.successful + results.failed);
          const delay = successRate > 0.8 ? 1500 : 3000; // Shorter delay if success rate is high
          await new Promise(resolve => setTimeout(resolve, delay));
        } catch (error) {
          results.failed++;
          results.details.push({ 
            phone: contact.phone, 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      }

      // Longer pause between batches
      if (i + batchSize < contacts.length) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    return results;
  }

  public async validatePhoneNumber(phoneNumber: string): Promise<{
    isValid: boolean;
    isRegistered: boolean;
    processedNumber: string;
    error?: string;
  }> {
    try {
      const processedPhone = PhoneProcessor.formatForWhatsApp(phoneNumber);
      
      if (!processedPhone) {
        return {
          isValid: false,
          isRegistered: false,
          processedNumber: '',
          error: 'Invalid phone number format'
        };
      }

      if (!this.client || !this.isConnected) {
        return {
          isValid: true,
          isRegistered: false,
          processedNumber: processedPhone,
          error: 'WhatsApp client not ready'
        };
      }

      const whatsappId = `${processedPhone}@c.us`;
      const numberDetails = await this.client.getNumberId(whatsappId);
      
      return {
        isValid: true,
        isRegistered: !!numberDetails,
        processedNumber: processedPhone,
      };
    } catch (error) {
      return {
        isValid: false,
        isRegistered: false,
        processedNumber: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  public getStatus(): {
    isConnected: boolean;
    sessionExists: boolean;
    qrCode?: string;
    clientInfo?: ClientInfo;
    error?: string;
  } {
    // يجب أن نتحقق من الجلسة الفعلية وليس فقط من وجود الـ client object
    // سنستدعي checkSessionExists() بشكل متزامن للحصول على الحالة الحقيقية
    let sessionExists = false;
    try {
      // نستخدم existsSync للتحقق المتزامن من الجلسة
      const sessionPath = path.resolve(SESSION_CONFIG.SESSION_PATH);
      sessionExists = fs.existsSync(sessionPath) && fs.readdirSync(sessionPath).length > 0;
    } catch (error) {
      sessionExists = false;
    }

    return {
      isConnected: this.isConnected,
      sessionExists: sessionExists,
      qrCode: this.qrCode || undefined,
      clientInfo: this.clientInfo || undefined,
    };
  }

  public async logout(): Promise<void> {
    try {
      console.log('Logging out from WhatsApp...');
      
      if (this.client) {
        await this.client.logout();
        await this.cleanup();
      }
      
      this.resetState();
      this.clearQRCode(); // Clear QR code on logout
      console.log('WhatsApp logout completed');
    } catch (error) {
      console.error('Error during logout:', error);
      // Force cleanup even if logout fails
      await this.cleanup();
      this.resetState();
      this.clearQRCode(); // Clear QR code on logout
    }
  }

  public async destroy(): Promise<void> {
    try {
      console.log('Destroying WhatsApp client...');
      await this.cleanup();
      this.resetState();
      console.log('WhatsApp client destroyed');
    } catch (error) {
      console.error('Error destroying WhatsApp client:', error);
    }
  }

  private async cleanup(): Promise<void> {
    if (this.client) {
      try {
        console.log('🗑️ Destroying client...');
        
        // Stop health monitoring first
        if (this.healthCheckInterval) {
          clearInterval(this.healthCheckInterval);
          this.healthCheckInterval = null;
        }
        
        // Try to destroy the client gracefully with better error handling
        if (this.client && typeof this.client.destroy === 'function') {
        await this.client.destroy();
        console.log('✅ Client destroyed successfully');
        } else {
          console.log('⚠️ Client already destroyed or invalid');
        }
      } catch (error) {
        console.warn('⚠️ Error during client destruction (continuing):', error);
        // Force cleanup even if destroy fails
        try {
          if (this.client && this.client.pupPage) {
            await this.client.pupPage.close();
          }
          if (this.client && this.client.pupBrowser) {
            await this.client.pupBrowser.close();
          }
        } catch (forceError) {
          console.warn('⚠️ Force cleanup also failed:', forceError);
        }
      } finally {
        this.client = null;
        // Only reset connection state, not QR code
        this.isConnected = false;
        this.clientInfo = null;
      }
    }
  }

  private resetState(): void {
    this.isConnected = false;
    // Don't clear QR code here - only clear it on successful auth or logout
    // this.qrCode = null;
    this.clientInfo = null;
    this.reconnectAttempts = 0;
  }

  private clearQRCode(): void {
    this.qrCode = null;
  }

  public async getChats(): Promise<Array<{ id: string; name: string; isGroup: boolean; lastMessage?: string }>> {
    if (!this.client || !this.isConnected) {
      throw new Error('WhatsApp client is not ready');
    }

    try {
      const chats = await this.client.getChats();
      return chats.slice(0, 50).map(chat => ({
        id: chat.id._serialized,
        name: chat.name || 'Unknown',
        isGroup: chat.isGroup,
        lastMessage: chat.lastMessage?.body?.substring(0, 100)
      }));
    } catch (error) {
      console.error('Error getting chats:', error);
      throw new Error('Failed to get chats');
    }
  }

  public async getContacts(): Promise<Array<{ id: string; name: string; number: string; isMyContact: boolean }>> {
    if (!this.client || !this.isConnected) {
      throw new Error('WhatsApp client is not ready');
    }

    try {
      const contacts = await this.client.getContacts();
      return contacts
        .filter(contact => contact.isMyContact)
        .slice(0, 100)
        .map(contact => ({
          id: contact.id._serialized,
          name: contact.name || contact.pushname || 'Unknown',
          number: contact.number || '',
          isMyContact: contact.isMyContact
        }));
    } catch (error) {
      console.error('Error getting contacts:', error);
      throw new Error('Failed to get contacts');
    }
  }

  /**
   * إحصائيات متقدمة للواتساب
   */
  public async getAdvancedStats(): Promise<{
    connection: { status: string; uptime: number; reconnectAttempts: number };
    session: { exists: boolean; authenticated: boolean; clientInfo?: ClientInfo };
    messaging: { totalChats: number; totalContacts: number; unreadMessages: number };
  }> {
    try {
      let totalChats = 0;
      let totalContacts = 0;
      let unreadMessages = 0;

      if (this.client && this.isConnected) {
        try {
          const chats = await this.client.getChats();
          totalChats = chats.length;
          unreadMessages = chats.reduce((sum, chat) => sum + chat.unreadCount, 0);

          const contacts = await this.client.getContacts();
          totalContacts = contacts.filter(c => c.isMyContact).length;
        } catch (error) {
          console.error('Error getting advanced stats:', error);
        }
      }

      return {
        connection: {
          status: this.isConnected ? 'connected' : 'disconnected',
          uptime: this.isConnected ? Date.now() : 0,
          reconnectAttempts: this.reconnectAttempts
        },
        session: {
          exists: !!this.client,
          authenticated: this.isConnected,
          clientInfo: this.clientInfo || undefined
        },
        messaging: {
          totalChats,
          totalContacts,
          unreadMessages
        }
      };
    } catch (error) {
      console.error('Error getting advanced stats:', error);
      throw error;
    }
  }

  public async clearSession(): Promise<void> {
    try {
      console.log('🧹 Clearing WhatsApp session...');
      
      // First logout if connected
      if (this.client && this.isConnected) {
        await this.logout();
      }
      
      // Cleanup client
      await this.cleanup();
      
      // Clear current session files
      const sessionPath = path.resolve(SESSION_CONFIG.SESSION_PATH);
      if (fs.existsSync(sessionPath)) {
        await fs.promises.rm(sessionPath, { recursive: true, force: true });
        console.log('✅ Current session files cleared');
      }

      // Also clear any old session directories
      await this.cleanupOldSessions();
      
      this.resetState();
      console.log('✅ All session data cleared successfully');
    } catch (error) {
      console.error('❌ Error clearing session:', error);
      // Force reset even if cleanup fails
      this.resetState();
    }
  }

  public async checkSessionExists(): Promise<boolean> {
    try {
      const sessionPath = path.resolve(SESSION_CONFIG.SESSION_PATH);
      const sessionExists = fs.existsSync(sessionPath) && fs.readdirSync(sessionPath).length > 0;
      
      if (sessionExists) {
        // Additional validation
        const validation = await this.validateSession();
        return validation.isValid;
      }
      
      return false;
    } catch (error) {
      console.error('Error checking session:', error);
      return false;
    }
  }

  /**
   * Get session information (backward compatibility)
   */
  public async getSessionInfo(): Promise<{
    exists: boolean;
    isConnected: boolean;
    needsQR: boolean;
    clientInfo?: ClientInfo;
    status: string;
  }> {
    const sessionExists = await this.checkSessionExists();
    
    return {
      exists: sessionExists,
      isConnected: this.isConnected,
      needsQR: !sessionExists || !this.isConnected,
      clientInfo: this.clientInfo || undefined,
      status: this.isConnected ? 'connected' : sessionExists ? 'session_exists_but_disconnected' : 'needs_qr_scan'
    };
  }

  /**
   * Get detailed session information
   */
  public async getDetailedSessionInfo(): Promise<{
    exists: boolean;
    isValid: boolean;
    sizeMB: number;
    path: string;
    validationDetails?: string;
  }> {
    try {
      const sessionPath = path.resolve(SESSION_CONFIG.SESSION_PATH);
      const exists = fs.existsSync(sessionPath);
      
      if (!exists) {
        return {
          exists: false,
          isValid: false,
          sizeMB: 0,
          path: sessionPath
        };
      }

      // Get session size
      let sizeMB = 0;
      try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        const { stdout } = await execAsync(`du -sm "${sessionPath}"`);
        sizeMB = parseInt(stdout.split('\t')[0]);
      } catch (error) {
        console.warn('Could not get session size:', error);
      }

      // Validate session
      const validation = await this.validateSession();

      return {
        exists: true,
        isValid: validation.isValid,
        sizeMB,
        path: sessionPath,
        validationDetails: validation.reason
      };
    } catch (error) {
      console.error('Error getting detailed session info:', error);
      return {
        exists: false,
        isValid: false,
        sizeMB: 0,
        path: SESSION_CONFIG.SESSION_PATH,
        validationDetails: 'Error getting session info'
      };
    }
  }

  /**
   * Force a fresh reconnection - useful when user manually wants to reconnect
   */
  public async forceReconnect(): Promise<void> {
    console.log('🔄 Force reconnection requested...');
    
    // Reset reconnect attempts for fresh start
    this.reconnectAttempts = 0;
    
    // Cleanup existing client
    if (this.client) {
      await this.cleanup();
    }
    
    // Initialize fresh connection
    await this.initialize();
  }

  /**
   * Check if we can restore existing session without QR scan
   */
  public async canRestoreSession(): Promise<boolean> {
    const sessionExists = await this.checkSessionExists();
    
    // Don't try to restore if we've had too many failed attempts recently
    if (this.reconnectAttempts >= 2) {
      console.log('🚨 Too many reconnect attempts, session might be corrupted');
      return false;
    }
    
    return sessionExists && !this.isConnected && !this.isInitializing;
  }

  /**
   * Check if session appears to be corrupted based on repeated failures
   */
  public async isSessionCorrupted(): Promise<boolean> {
    const sessionExists = await this.checkSessionExists();
    
    // Consider session corrupted if:
    // 1. Session exists but we've failed to connect multiple times
    // 2. We're not currently initializing (to avoid false positives)
    return sessionExists && this.reconnectAttempts >= this.maxReconnectAttempts && !this.isInitializing;
  }

  /**
   * Smart initialization that handles corrupted sessions
   */
  public async smartInitialize(): Promise<{ success: boolean; needsQR: boolean; message: string }> {
    try {
      // Check if session might be corrupted
      const isCorrupted = await this.isSessionCorrupted();
      if (isCorrupted) {
        console.log('🗑️ Detected corrupted session, clearing automatically...');
        await this.clearSession();
        return {
          success: false,
          needsQR: true,
          message: 'تم اكتشاف جلسة معطلة وتم مسحها. يرجى مسح QR كود جديد.'
        };
      }

      // Try normal initialization
      await this.initialize();
      
      return {
        success: true,
        needsQR: false,
        message: 'تم الاتصال بنجاح!'
      };
    } catch (error) {
      console.error('Smart initialization failed:', error);
      
      // If it's a timeout error, suggest clearing session
      if (error instanceof Error && error.message.includes('timeout')) {
        return {
          success: false,
          needsQR: true,
          message: 'انتهت مهلة الاتصال. قد تكون الجلسة معطلة. يُنصح بمسح الجلسة والمحاولة مرة أخرى.'
        };
      }
      
      return {
        success: false,
        needsQR: await this.checkSessionExists() === false,
        message: `فشل في الاتصال: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`
      };
    }
  }
} 