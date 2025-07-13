import { Client, LocalAuth, ClientInfo } from 'whatsapp-web.js';
import fs from 'fs';
import path from 'path';

// 🔧 PROFESSIONAL SESSION MANAGEMENT CONFIGURATION
const PERSISTENT_SESSION_CONFIG = {
  CLIENT_ID: 'whatsapp-automation-pro-v2',
  // 🔧 CRITICAL: Use Railway persistent storage
  SESSION_PATH: process.env.RAILWAY_PROJECT_ID ? '/app/persistent-session' : './persistent-session',
  BACKUP_SESSION_PATH: process.env.RAILWAY_PROJECT_ID ? '/tmp/session-backup' : './session-backup',
  MAX_SESSION_SIZE_MB: 150,
  SESSION_TIMEOUT_MS: 45000,
  PUPPETEER_TIMEOUT_MS: 30000,
  MAX_INIT_RETRIES: 3,
  HEALTH_CHECK_INTERVAL_MS: 15000, // More frequent health checks
  RECONNECT_DELAY_MS: 5000,
  MAX_RECONNECT_ATTEMPTS: 5,
  // 🔧 NEW: Session backup settings
  BACKUP_INTERVAL_MS: 300000, // 5 minutes
  SESSION_VALIDATION_INTERVAL_MS: 60000, // 1 minute
  FORCE_SAVE_INTERVAL_MS: 120000, // 2 minutes
};

// 🔧 NEW: Ensure fetch polyfill
async function ensureFetchPolyfill(): Promise<void> {
  if (typeof globalThis.fetch === 'undefined') {
    try {
      const { default: fetch } = await import('node-fetch');
      globalThis.fetch = fetch as any;
      console.log('✅ Fetch polyfill applied');
    } catch (error) {
      console.warn('⚠️ Could not apply fetch polyfill:', error);
    }
  }
}

interface SessionHealth {
  isValid: boolean;
  lastValidated: Date;
  size: number;
  hasBackup: boolean;
  criticalFiles: string[];
  missingFiles: string[];
}

export class WhatsAppPersistentSession {
  private static instance: WhatsAppPersistentSession | null = null;
  private client: Client | null = null;
  private qrCode: string | null = null;
  private isConnected: boolean = false;
  private clientInfo: ClientInfo | null = null;
  private isInitializing: boolean = false;
  private initializationPromise: Promise<void> | null = null;
  
  // 🔧 NEW: Enhanced session management
  private sessionHealth: SessionHealth | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private backupInterval: NodeJS.Timeout | null = null;
  private forceSaveInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private lastSessionSave: Date = new Date();
  private sessionValidationInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.startPersistentSessionManagement();
    this.setupGracefulShutdown();
  }

  public static getInstance(): WhatsAppPersistentSession {
    if (!WhatsAppPersistentSession.instance) {
      WhatsAppPersistentSession.instance = new WhatsAppPersistentSession();
    }
    return WhatsAppPersistentSession.instance;
  }

  // 🔧 NEW: Start comprehensive session management
  private startPersistentSessionManagement(): void {
    console.log('🔧 Starting persistent session management system...');
    
    // Create necessary directories
    this.ensureDirectoriesExist();
    
    // Start health monitoring
    this.startHealthMonitoring();
    
    // Start session backup system
    this.startSessionBackup();
    
    // Start forced session saving
    this.startForcedSessionSaving();
    
    // Start session validation
    this.startSessionValidation();
  }

  // 🔧 NEW: Ensure all necessary directories exist
  private ensureDirectoriesExist(): void {
    const directories = [
      PERSISTENT_SESSION_CONFIG.SESSION_PATH,
      PERSISTENT_SESSION_CONFIG.BACKUP_SESSION_PATH,
      path.dirname(PERSISTENT_SESSION_CONFIG.SESSION_PATH),
      path.dirname(PERSISTENT_SESSION_CONFIG.BACKUP_SESSION_PATH)
    ];

    directories.forEach(dir => {
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          console.log(`📁 Created directory: ${dir}`);
        }
      } catch (error) {
        console.warn(`⚠️ Could not create directory ${dir}:`, error);
      }
    });
  }

  // 🔧 NEW: Enhanced health monitoring
  private startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        console.error('❌ Health check failed:', error);
      }
    }, PERSISTENT_SESSION_CONFIG.HEALTH_CHECK_INTERVAL_MS);
  }

  // 🔧 NEW: Session backup system
  private startSessionBackup(): void {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
    }

    this.backupInterval = setInterval(async () => {
      try {
        await this.backupSession();
      } catch (error) {
        console.error('❌ Session backup failed:', error);
      }
    }, PERSISTENT_SESSION_CONFIG.BACKUP_INTERVAL_MS);
  }

  // 🔧 NEW: Forced session saving
  private startForcedSessionSaving(): void {
    if (this.forceSaveInterval) {
      clearInterval(this.forceSaveInterval);
    }

    this.forceSaveInterval = setInterval(async () => {
      try {
        await this.forceSaveSession();
      } catch (error) {
        console.error('❌ Forced session save failed:', error);
      }
    }, PERSISTENT_SESSION_CONFIG.FORCE_SAVE_INTERVAL_MS);
  }

  // 🔧 NEW: Session validation
  private startSessionValidation(): void {
    if (this.sessionValidationInterval) {
      clearInterval(this.sessionValidationInterval);
    }

    this.sessionValidationInterval = setInterval(async () => {
      try {
        await this.validateSession();
      } catch (error) {
        console.error('❌ Session validation failed:', error);
      }
    }, PERSISTENT_SESSION_CONFIG.SESSION_VALIDATION_INTERVAL_MS);
  }

  // 🔧 NEW: Comprehensive health check
  private async performHealthCheck(): Promise<void> {
    if (!this.client) return;

    try {
      // Check connection status
      const isClientReady = this.client.info !== undefined;
      
      if (this.isConnected && !isClientReady) {
        console.log('⚠️ Connection lost detected, attempting reconnect...');
        await this.attemptReconnect();
      }

      // Validate session files
      await this.validateSessionFiles();

      // Check memory usage
      const memUsage = process.memoryUsage();
      if (memUsage.heapUsed > 500 * 1024 * 1024) { // 500MB
        console.log('⚠️ High memory usage detected, consider restart');
      }

    } catch (error) {
      console.error('❌ Health check error:', error);
    }
  }

  // 🔧 NEW: Backup session to secondary location
  private async backupSession(): Promise<void> {
    if (!this.isConnected || !fs.existsSync(PERSISTENT_SESSION_CONFIG.SESSION_PATH)) {
      return;
    }

    try {
      const backupPath = PERSISTENT_SESSION_CONFIG.BACKUP_SESSION_PATH;
      
      // Create backup directory if it doesn't exist
      if (!fs.existsSync(backupPath)) {
        fs.mkdirSync(backupPath, { recursive: true });
      }

      // Copy session files to backup location
      await this.copyDirectory(PERSISTENT_SESSION_CONFIG.SESSION_PATH, backupPath);
      
      console.log('💾 Session backup completed successfully');
    } catch (error) {
      console.error('❌ Session backup failed:', error);
    }
  }

  // 🔧 NEW: Force save session
  private async forceSaveSession(): Promise<void> {
    if (!this.client || !this.isConnected) return;

    try {
      // Trigger session save by simulating a small operation
      await this.client.getState();
      this.lastSessionSave = new Date();
      console.log('💾 Forced session save completed');
    } catch (error) {
      console.error('❌ Forced session save failed:', error);
    }
  }

  // 🔧 NEW: Validate session files
  private async validateSession(): Promise<void> {
    try {
      const sessionPath = PERSISTENT_SESSION_CONFIG.SESSION_PATH;
      const clientSessionPath = path.join(sessionPath, `session-${PERSISTENT_SESSION_CONFIG.CLIENT_ID}`);

      if (!fs.existsSync(clientSessionPath)) {
        console.log('⚠️ Session files not found');
        return;
      }

      // Check critical files
      const criticalFiles = [
        'Default/Local Storage/leveldb',
        'Default/Session Storage',
        'Default/Preferences'
      ];

      const missingFiles: string[] = [];
      const existingFiles: string[] = [];

      for (const file of criticalFiles) {
        const filePath = path.join(clientSessionPath, file);
        if (fs.existsSync(filePath)) {
          existingFiles.push(file);
        } else {
          missingFiles.push(file);
        }
      }

      // Calculate session size
      const sessionSize = await this.getDirectorySize(sessionPath);

      this.sessionHealth = {
        isValid: missingFiles.length === 0,
        lastValidated: new Date(),
        size: sessionSize,
        hasBackup: fs.existsSync(PERSISTENT_SESSION_CONFIG.BACKUP_SESSION_PATH),
        criticalFiles: existingFiles,
        missingFiles: missingFiles
      };

      if (missingFiles.length > 0) {
        console.log(`⚠️ Session validation failed: Missing files: ${missingFiles.join(', ')}`);
        
        // Try to restore from backup
        if (this.sessionHealth.hasBackup) {
          console.log('🔄 Attempting to restore from backup...');
          await this.restoreFromBackup();
        }
      }

    } catch (error) {
      console.error('❌ Session validation error:', error);
    }
  }

  // 🔧 NEW: Restore session from backup
  private async restoreFromBackup(): Promise<void> {
    try {
      const backupPath = PERSISTENT_SESSION_CONFIG.BACKUP_SESSION_PATH;
      const sessionPath = PERSISTENT_SESSION_CONFIG.SESSION_PATH;

      if (!fs.existsSync(backupPath)) {
        console.log('❌ No backup found to restore from');
        return;
      }

      // Clear current session
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
      }

      // Copy backup to session location
      await this.copyDirectory(backupPath, sessionPath);
      
      console.log('✅ Session restored from backup successfully');
    } catch (error) {
      console.error('❌ Session restore failed:', error);
    }
  }

  // 🔧 NEW: Copy directory recursively
  private async copyDirectory(src: string, dest: string): Promise<void> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      // Use system cp command for better performance
      await execAsync(`cp -r "${src}" "${dest}"`);
    } catch (error) {
      // Fallback to manual copy
      this.copyDirectorySync(src, dest);
    }
  }

  // 🔧 NEW: Synchronous directory copy
  private copyDirectorySync(src: string, dest: string): void {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDirectorySync(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  // 🔧 NEW: Get directory size
  private async getDirectorySize(dirPath: string): Promise<number> {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const { stdout } = await execAsync(`du -sm "${dirPath}"`);
      return parseInt(stdout.split('\t')[0]);
    } catch (error) {
      return 0;
    }
  }

  // 🔧 NEW: Enhanced reconnection logic
  private async attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= PERSISTENT_SESSION_CONFIG.MAX_RECONNECT_ATTEMPTS) {
      console.log('❌ Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`🔄 Reconnection attempt ${this.reconnectAttempts}/${PERSISTENT_SESSION_CONFIG.MAX_RECONNECT_ATTEMPTS}`);

    try {
      if (this.client) {
        await this.client.destroy();
      }

      // Wait before reconnecting
      await new Promise(resolve => setTimeout(resolve, PERSISTENT_SESSION_CONFIG.RECONNECT_DELAY_MS));

      // Reinitialize
      await this.initialize();
      
      console.log('✅ Reconnection successful');
      this.reconnectAttempts = 0;
    } catch (error) {
      console.error(`❌ Reconnection attempt ${this.reconnectAttempts} failed:`, error);
      
      if (this.reconnectAttempts >= PERSISTENT_SESSION_CONFIG.MAX_RECONNECT_ATTEMPTS) {
        console.log('🔄 Max attempts reached, clearing session for fresh start');
        await this.clearSession();
      }
    }
  }

  // 🔧 NEW: Enhanced initialization with persistent session
  public async initialize(): Promise<void> {
    if (this.isInitializing) {
      console.log('⏳ Initialization already in progress, waiting...');
      return this.initializationPromise || Promise.resolve();
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
      console.log('🔄 Starting persistent WhatsApp initialization...');

      // Ensure directories exist
      this.ensureDirectoriesExist();

      // Setup fetch polyfill
      await ensureFetchPolyfill();

      // Check if we can restore from backup
      if (!fs.existsSync(PERSISTENT_SESSION_CONFIG.SESSION_PATH) && 
          fs.existsSync(PERSISTENT_SESSION_CONFIG.BACKUP_SESSION_PATH)) {
        console.log('🔄 Restoring session from backup...');
        await this.restoreFromBackup();
      }

      // Validate existing session
      await this.validateSession();

      // Clean up any existing client
      if (this.client) {
        await this.client.destroy();
        this.client = null;
      }

      // Detect environment
      const isRailway = process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_PROJECT_NAME;
      const isDocker = process.env.DOCKER_CONTAINER || process.env.NODE_ENV === 'production';

      // Enhanced Puppeteer configuration
      let puppeteerConfig: any = {
        headless: true,
        timeout: PERSISTENT_SESSION_CONFIG.PUPPETEER_TIMEOUT_MS,
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
          '--disable-ipc-flooding-protection',
          // 🔧 CRITICAL: Enhanced process isolation
          '--disable-browser-side-navigation',
          '--disable-blink-features=AutomationControlled',
          '--disable-component-extensions-with-background-pages',
          '--disable-sync',
          '--disable-background-networking',
          '--force-process-singleton-off',
          '--user-data-dir-name=' + PERSISTENT_SESSION_CONFIG.CLIENT_ID,
          '--disable-file-system',
          '--no-first-run-extensions',
          // 🔧 NEW: Enhanced stability flags
          '--disable-background-downloads',
          '--disable-add-to-shelf',
          '--disable-client-side-phishing-detection',
          '--no-crash-upload',
          '--disable-hang-monitor',
          '--disable-prompt-on-repost',
          '--disable-component-update',
          '--disable-default-apps',
          '--disable-domain-reliability'
        ]
      };

      // Railway/Docker specific configuration
      if (isRailway || isDocker) {
        console.log('🐳 Detected Railway/Docker environment - using optimized settings');
        puppeteerConfig.executablePath = '/usr/bin/chromium-browser';
        puppeteerConfig.args.push(
          '--disable-gpu-sandbox',
          '--disable-software-rasterizer',
          '--no-process-per-site',
          '--disable-site-isolation-trials',
          '--disable-features=VizDisplayCompositor,VizServiceDisplay',
          '--remote-debugging-port=0',
          '--disable-logging'
        );
      }

      // Create client with enhanced LocalAuth
      console.log('🏗️ Creating WhatsApp client with persistent session...');
      this.client = new Client({
        authStrategy: new LocalAuth({
          clientId: PERSISTENT_SESSION_CONFIG.CLIENT_ID,
          dataPath: PERSISTENT_SESSION_CONFIG.SESSION_PATH
        }),
        puppeteer: puppeteerConfig,
        takeoverOnConflict: true,
        takeoverTimeoutMs: 20000
      });

      // Setup event handlers
      this.setupEventHandlers();

      // Initialize with retry logic
      await this.initializeWithRetry();

      console.log('✅ Persistent WhatsApp initialization completed successfully');

    } catch (error) {
      console.error('❌ Persistent initialization failed:', error);
      throw error;
    }
  }

  // 🔧 NEW: Initialize with enhanced retry logic
  private async initializeWithRetry(): Promise<void> {
    let attempt = 1;
    const maxAttempts = PERSISTENT_SESSION_CONFIG.MAX_INIT_RETRIES;

    while (attempt <= maxAttempts) {
      try {
        console.log(`🚀 Initialization attempt ${attempt}/${maxAttempts}...`);
        
        const initPromise = this.client!.initialize();
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Initialization timeout after ${PERSISTENT_SESSION_CONFIG.SESSION_TIMEOUT_MS / 1000} seconds`));
          }, PERSISTENT_SESSION_CONFIG.SESSION_TIMEOUT_MS);
        });

        await Promise.race([initPromise, timeoutPromise]);
        
        console.log('✅ WhatsApp client initialized successfully');
        return;

      } catch (error) {
        console.error(`❌ Initialization attempt ${attempt} failed:`, error);
        
        if (attempt < maxAttempts) {
          console.log(`🔄 Retrying in ${PERSISTENT_SESSION_CONFIG.RECONNECT_DELAY_MS / 1000} seconds...`);
          
          // Clean up failed client
          if (this.client) {
            try {
              await this.client.destroy();
            } catch (cleanupError) {
              console.warn('Cleanup error:', cleanupError);
            }
          }

          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, PERSISTENT_SESSION_CONFIG.RECONNECT_DELAY_MS));
          
          // Recreate client
          this.client = new Client({
            authStrategy: new LocalAuth({
              clientId: PERSISTENT_SESSION_CONFIG.CLIENT_ID,
              dataPath: PERSISTENT_SESSION_CONFIG.SESSION_PATH
            }),
            puppeteer: {
              headless: true,
              timeout: PERSISTENT_SESSION_CONFIG.PUPPETEER_TIMEOUT_MS,
              args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process',
                '--force-process-singleton-off'
              ]
            },
            takeoverOnConflict: true,
            takeoverTimeoutMs: 20000
          });

          this.setupEventHandlers();
        }
        
        attempt++;
      }
    }

    throw new Error(`Failed to initialize after ${maxAttempts} attempts`);
  }

  // 🔧 NEW: Enhanced event handlers
  private setupEventHandlers(): void {
    if (!this.client) return;

    // QR code generation
    this.client.on('qr', (qr) => {
      console.log('📱 QR Code generated');
      this.qrCode = qr;
    });

    // Authentication successful
    this.client.on('authenticated', () => {
      console.log('✅ WhatsApp authenticated successfully');
      this.qrCode = null;
    });

    // Client ready
    this.client.on('ready', () => {
      console.log('🚀 WhatsApp client is ready');
      this.isConnected = true;
      this.clientInfo = this.client!.info;
      this.reconnectAttempts = 0;
      
      // Force save session immediately after connection
      this.forceSaveSession();
    });

    // Authentication failure
    this.client.on('auth_failure', (message) => {
      console.log('❌ Authentication failed:', message);
      this.isConnected = false;
      this.qrCode = null;
    });

    // Disconnection
    this.client.on('disconnected', (reason) => {
      console.log('🔌 WhatsApp disconnected:', reason);
      this.isConnected = false;
      this.qrCode = null;
      
      // Attempt reconnection for certain disconnect reasons
      const reasonStr = String(reason);
      if (reasonStr.includes('NAVIGATION') || reasonStr.includes('KICKED')) {
        console.log('🔄 Connection lost, attempting reconnect...');
        setTimeout(() => this.attemptReconnect(), 3000);
      }
    });

    // Remote session saved
    this.client.on('remote_session_saved', () => {
      console.log('💾 Remote session saved successfully');
      this.lastSessionSave = new Date();
    });

    // Loading screen
    this.client.on('loading_screen', (percent, message) => {
      console.log(`⏳ Loading: ${percent}% - ${message}`);
    });
  }

  // 🔧 NEW: Enhanced status information
  public getStatus(): {
    isConnected: boolean;
    isInitializing: boolean;
    qrCode: string | null;
    clientInfo: ClientInfo | null;
    sessionExists: boolean;
    sessionHealth: SessionHealth | null;
    lastSessionSave: Date;
    reconnectAttempts: number;
  } {
    return {
      isConnected: this.isConnected,
      isInitializing: this.isInitializing,
      qrCode: this.qrCode,
      clientInfo: this.clientInfo,
      sessionExists: fs.existsSync(PERSISTENT_SESSION_CONFIG.SESSION_PATH),
      sessionHealth: this.sessionHealth,
      lastSessionSave: this.lastSessionSave,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  // 🔧 NEW: Send message with enhanced error handling
  public async sendMessage(phoneNumber: string, message: string): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      console.log('❌ WhatsApp not connected');
      return false;
    }

    try {
      const chatId = `${phoneNumber}@c.us`;
      await this.client.sendMessage(chatId, message);
      console.log(`✅ Message sent to ${phoneNumber}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to send message to ${phoneNumber}:`, error);
      return false;
    }
  }

  // 🔧 NEW: Clear session with backup
  public async clearSession(): Promise<void> {
    try {
      console.log('🧹 Clearing persistent session...');
      
      // Stop all intervals
      this.stopAllIntervals();

      // Logout if connected
      if (this.client && this.isConnected) {
        try {
          await this.client.logout();
        } catch (error) {
          console.warn('Logout error:', error);
        }
      }

      // Destroy client
      if (this.client) {
        try {
          await this.client.destroy();
        } catch (error) {
          console.warn('Client destroy error:', error);
        }
        this.client = null;
      }

      // Clear session files
      const sessionPath = PERSISTENT_SESSION_CONFIG.SESSION_PATH;
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log('✅ Session files cleared');
      }

      // Clear backup files
      const backupPath = PERSISTENT_SESSION_CONFIG.BACKUP_SESSION_PATH;
      if (fs.existsSync(backupPath)) {
        fs.rmSync(backupPath, { recursive: true, force: true });
        console.log('✅ Backup files cleared');
      }

      // Reset state
      this.isConnected = false;
      this.qrCode = null;
      this.clientInfo = null;
      this.sessionHealth = null;
      this.reconnectAttempts = 0;

      console.log('✅ Persistent session cleared successfully');
    } catch (error) {
      console.error('❌ Error clearing persistent session:', error);
    }
  }

  // 🔧 NEW: Stop all intervals
  private stopAllIntervals(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.backupInterval) {
      clearInterval(this.backupInterval);
      this.backupInterval = null;
    }

    if (this.forceSaveInterval) {
      clearInterval(this.forceSaveInterval);
      this.forceSaveInterval = null;
    }

    if (this.sessionValidationInterval) {
      clearInterval(this.sessionValidationInterval);
      this.sessionValidationInterval = null;
    }
  }

  // 🔧 NEW: Graceful shutdown
  private setupGracefulShutdown(): void {
    const cleanup = async () => {
      console.log('🛑 Graceful shutdown initiated...');
      
      // Force save session before shutdown
      if (this.client && this.isConnected) {
        try {
          await this.forceSaveSession();
          await this.backupSession();
        } catch (error) {
          console.warn('Shutdown save error:', error);
        }
      }

      this.stopAllIntervals();
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('SIGQUIT', cleanup);
    process.on('exit', cleanup);
  }

  // 🔧 NEW: Validate session files
  private async validateSessionFiles(): Promise<boolean> {
    const sessionPath = PERSISTENT_SESSION_CONFIG.SESSION_PATH;
    const clientSessionPath = path.join(sessionPath, `session-${PERSISTENT_SESSION_CONFIG.CLIENT_ID}`);

    if (!fs.existsSync(clientSessionPath)) {
      return false;
    }

    // Check critical files
    const criticalFiles = [
      'Default/Local Storage/leveldb',
      'Default/Session Storage'
    ];

    for (const file of criticalFiles) {
      const filePath = path.join(clientSessionPath, file);
      if (!fs.existsSync(filePath)) {
        return false;
      }
    }

    return true;
  }

  // 🔧 NEW: Get detailed session information
  public async getDetailedSessionInfo(): Promise<{
    exists: boolean;
    isValid: boolean;
    size: number;
    lastModified: Date | null;
    hasBackup: boolean;
    backupSize: number;
    health: SessionHealth | null;
  }> {
    const sessionPath = PERSISTENT_SESSION_CONFIG.SESSION_PATH;
    const backupPath = PERSISTENT_SESSION_CONFIG.BACKUP_SESSION_PATH;

    const info = {
      exists: fs.existsSync(sessionPath),
      isValid: false,
      size: 0,
      lastModified: null as Date | null,
      hasBackup: fs.existsSync(backupPath),
      backupSize: 0,
      health: this.sessionHealth
    };

    if (info.exists) {
      try {
        const stats = fs.statSync(sessionPath);
        info.lastModified = stats.mtime;
        info.size = await this.getDirectorySize(sessionPath);
        info.isValid = await this.validateSessionFiles();
      } catch (error) {
        console.error('Error getting session info:', error);
      }
    }

    if (info.hasBackup) {
      try {
        info.backupSize = await this.getDirectorySize(backupPath);
      } catch (error) {
        console.error('Error getting backup size:', error);
      }
    }

    return info;
  }

  // 🔧 NEW: Destroy instance
  public async destroy(): Promise<void> {
    console.log('🔧 Destroying persistent session instance...');
    
    this.stopAllIntervals();
    
    if (this.client) {
      try {
        await this.client.destroy();
      } catch (error) {
        console.warn('Client destroy error:', error);
      }
      this.client = null;
    }

    this.isConnected = false;
    this.qrCode = null;
    this.clientInfo = null;
    this.sessionHealth = null;
    this.reconnectAttempts = 0;
  }
} 