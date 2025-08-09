import { Client, LocalAuth, ClientInfo } from 'whatsapp-web.js';
import { ensureFetchPolyfill } from '../utils/fetch-polyfill';
import { setupGlobalErrorHandlers } from '../utils/error-handler';
import fs from 'fs';
import path from 'path';
import * as QRCode from 'qrcode';

// Setup global error handlers
setupGlobalErrorHandlers();

// Helper function to convert QR code to data URL
const qrCodeToDataURL = async (qrCode: string): Promise<string> => {
  try {
    // If it's already a data URL, return as is
    if (qrCode.startsWith('data:')) {
      return qrCode;
    }
    
    // Generate data URL from QR string
    const dataURL = await QRCode.toDataURL(qrCode, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    
    return dataURL;
  } catch (error) {
    console.error('Error converting QR code to data URL:', error);
    return qrCode; // Return original if conversion fails
  }
};

// Enhanced configuration for persistent connection
const PERSISTENT_CONFIG = {
  CLIENT_ID: 'whatsapp-automation-persistent',
  SESSION_PATH: process.env.WHATSAPP_SESSION_PATH || './whatsapp-session-persistent',
  MAX_RECONNECT_ATTEMPTS: 5,
  RECONNECT_DELAY_BASE: 3000, // 3 seconds
  RECONNECT_DELAY_MAX: 30000, // 30 seconds max
  HEALTH_CHECK_INTERVAL: 15000, // 15 seconds
  SESSION_VALIDATION_INTERVAL: 60000, // 1 minute
  HEARTBEAT_INTERVAL: 10000, // 10 seconds
  MAX_INITIALIZATION_TIME: 180000, // 3 minutes for Railway
  BROWSER_RESTART_THRESHOLD: 3, // Restart browser after 3 failures
  SESSION_CLEANUP_INTERVAL: 300000, // 5 minutes
} as const;

interface ConnectionHealth {
  isConnected: boolean;
  lastHeartbeat: Date | null;
  reconnectAttempts: number;
  lastReconnectTime: Date | null;
  sessionHealth: 'healthy' | 'degraded' | 'critical';
  browserRestarts: number;
  totalUptime: number;
  lastSuccessfulMessage: Date | null;
}

interface PersistentConnectionEvents {
  onConnected: () => void;
  onDisconnected: (reason: string) => void;
  onReconnecting: (attempt: number) => void;
  onSessionCorrupted: () => void;
  onBrowserRestart: () => void;
}

export class WhatsAppPersistentConnection {
  private static instance: WhatsAppPersistentConnection | null = null;
  private client: Client | null = null;
  private isConnected: boolean = false;
  private clientInfo: ClientInfo | null = null;
  private qrCode: string | null = null;
  
  // Connection management
  private connectionHealth: ConnectionHealth = {
    isConnected: false,
    lastHeartbeat: null,
    reconnectAttempts: 0,
    lastReconnectTime: null,
    sessionHealth: 'healthy',
    browserRestarts: 0,
    totalUptime: 0,
    lastSuccessfulMessage: null
  };
  
  // Timers and intervals
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private sessionValidationInterval: NodeJS.Timeout | null = null;
  private sessionCleanupInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  
  // State management
  private isInitializing: boolean = false;
  private isReconnecting: boolean = false;
  private shouldReconnect: boolean = true;
  private initializationStartTime: number = 0;
  private connectionStartTime: number = 0;
  
  // Event handlers
  private eventHandlers: Partial<PersistentConnectionEvents> = {};
  
  private constructor() {
    this.startBackgroundTasks();
  }
  
  public static getInstance(): WhatsAppPersistentConnection {
    if (!this.instance) {
      this.instance = new WhatsAppPersistentConnection();
    }
    return this.instance;
  }
  
  /**
   * Initialize persistent connection with automatic recovery
   */
  public async initialize(): Promise<void> {
    if (this.isInitializing) {
      console.log('🔄 Initialization already in progress, waiting...');
      // Wait for current initialization to complete
      while (this.isInitializing) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      return;
    }
    
    this.isInitializing = true;
    this.initializationStartTime = Date.now();
    
    try {
      console.log('🚀 Starting persistent WhatsApp connection...');
      
      // Step 1: Cleanup any existing client
      await this.cleanupClient();
      
      // Step 2: Validate and prepare session
      await this.validateAndPrepareSession();
      
      // Step 3: Setup fetch polyfill
      await ensureFetchPolyfill();
      
      // Step 4: Create and configure client
      await this.createAndConfigureClient();
      
      // Step 5: Initialize client with timeout
      await this.initializeClientWithTimeout();
      
      console.log('✅ Persistent WhatsApp connection initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize persistent connection:', error);
      this.handleInitializationFailure(error);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }
  
  /**
   * Validate and prepare session for connection
   */
  private async validateAndPrepareSession(): Promise<void> {
    console.log('🔍 Validating session integrity...');
    const sessionPath = path.resolve(PERSISTENT_CONFIG.SESSION_PATH);

    const criticalFiles = [
      'Default/Local Storage/leveldb',
      'Default/Session Storage',
      'Default/IndexedDB'
    ];

    let sessionExists = fs.existsSync(sessionPath);
    let missingFiles = 0;
    let sizeMB = 0;

    if (sessionExists) {
      try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        const { stdout } = await execAsync(`du -sm "${sessionPath}"`);
        sizeMB = parseInt(stdout.split('\t')[0]);
      } catch {
        // ignore size errors
      }

      for (const f of criticalFiles) {
        const p = path.join(sessionPath, `session-${PERSISTENT_CONFIG.CLIENT_ID}`, f);
        if (!fs.existsSync(p)) missingFiles++;
      }

      if (sizeMB > 800 || missingFiles > 1) {
        console.log(`🗑️ Session appears corrupted (size=${sizeMB}MB, missingFiles=${missingFiles}), will require QR`);
        this.connectionHealth.sessionHealth = 'critical';
        return; // keep path for investigation; QR will be provided
      }

      console.log('📁 Existing session detected and seems healthy, will attempt restore without QR');
      this.connectionHealth.sessionHealth = 'healthy';
      return;
    } else {
      // No session, ensure directory exists
      fs.mkdirSync(sessionPath, { recursive: true });
      this.connectionHealth.sessionHealth = 'healthy';
    }
  }

  private async createClientWithOptions(opts?: { disableWebVersionCache?: boolean }): Promise<void> {
    const isRailway = process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_PROJECT_NAME;
    const puppeteerConfig: any = {
      headless: true,
      args: [
        '--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-web-security'
      ],
      executablePath: isRailway ? '/usr/bin/chromium-browser' : undefined,
      timeout: 30000,
      protocolTimeout: 30000,
      ignoreHTTPSErrors: true,
      acceptInsecureCerts: true
    };

    const baseOptions: any = {
      authStrategy: new LocalAuth({ clientId: PERSISTENT_CONFIG.CLIENT_ID, dataPath: PERSISTENT_CONFIG.SESSION_PATH }),
      puppeteer: puppeteerConfig,
      takeoverOnConflict: true,
      takeoverTimeoutMs: 15000,
    };

    if (!opts?.disableWebVersionCache) {
      baseOptions.webVersionCache = { type: 'remote', remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html' };
    } else {
      baseOptions.webVersionCache = { type: 'none' };
    }

    this.client = new Client(baseOptions);
    this.setupClientEventHandlers();
    console.log(`✅ WhatsApp client created and configured (webVersionCache=${opts?.disableWebVersionCache ? 'none' : 'remote'})`);
  }

  private async createAndConfigureClient(): Promise<void> {
    await this.createClientWithOptions();
  }
  
  /**
   * Initialize client with timeout protection
   */
  private async initializeClientWithTimeout(): Promise<void> {
    if (!this.client) {
      throw new Error('Client not created');
    }

    console.log('🚀 Initializing client with enhanced timeout protection...');

    const tryInitialize = async (): Promise<void> => {
      await new Promise<void>((resolve, reject) => {
        let resolved = false;
        const onReady = () => { if (!resolved) { resolved = true; cleanup(); console.log('✅ Client ready - initialization successful'); resolve(); } };
        const onQR = () => { /* QR handled elsewhere */ };
        const onAuthFailure = (msg: string) => { if (!resolved) { resolved = true; cleanup(); reject(new Error(`Authentication failed: ${msg}`)); } };
        const onDisconnected = (reason: string) => { if (!resolved) { resolved = true; cleanup(); reject(new Error(`Disconnected during initialization: ${reason}`)); } };
        const cleanup = () => { if (this.client) { this.client.removeListener('ready', onReady); this.client.removeListener('qr', onQR); this.client.removeListener('auth_failure', onAuthFailure); this.client.removeListener('disconnected', onDisconnected); } };
        if (this.client) {
          this.client.once('ready', onReady);
          this.client.on('qr', onQR);
          this.client.once('auth_failure', onAuthFailure);
          this.client.once('disconnected', onDisconnected);
          this.client.initialize().catch(err => { if (!resolved) { resolved = true; cleanup(); reject(err); } });
        } else {
          reject(new Error('Client is null'));
        }
      });
    };

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Initialization timeout after ${PERSISTENT_CONFIG.MAX_INITIALIZATION_TIME / 1000} seconds. This might be due to network issues or WhatsApp service problems. Please try again.`)), PERSISTENT_CONFIG.MAX_INITIALIZATION_TIME);
    });

    try {
      await Promise.race([tryInitialize(), timeoutPromise]);
    } catch (error: any) {
      const msg = String(error?.message || 'unknown');
      console.error('❌ Client initialization failed:', error);

      // Fallback: retry without webVersionCache if failure indicates cache/version fetch issue
      const versionError = msg.includes('fetching version') || msg.includes('webVersion') || msg.includes('a is not a function');
      if (versionError) {
        console.log('🛠️ Retrying initialization without webVersionCache...');
        await this.cleanupClient();
        await this.createClientWithOptions({ disableWebVersionCache: true });
        await Promise.race([tryInitialize(), timeoutPromise]);
        return;
      }

      // Cleanup and rethrow for outer handler
      await this.cleanupClient();
      throw error;
    }
  }
  
  /**
   * Setup comprehensive event handlers
   */
  private setupClientEventHandlers(): void {
    if (!this.client) return;

    this.client.on('qr', async (qr) => {
      // إذا وصل حدث QR فهذا يعني أن الجلسة غير مصادَقة حالياً، لذا يجب عرض الكود دائماً
      this.connectionHealth.sessionHealth = 'degraded';
      this.connectionHealth.isConnected = false;
      this.qrCode = null;

      console.log('📱 QR Code generated for authentication');
      console.log('🔍 QR Code raw data length:', qr.length);
      try {
        const dataURL = await qrCodeToDataURL(qr);
        this.qrCode = dataURL;
        console.log('✅ QR Code converted to data URL format');
      } catch (error) {
        console.error('❌ Error converting QR code to data URL:', error);
        this.qrCode = qr;
        console.log('⚠️ Using original QR code as fallback');
      }
    });
    
    // Client ready
    this.client.on('ready', () => {
      console.log('🎉 WhatsApp client is ready and connected!');
      this.isConnected = true;
      this.isReconnecting = false;
      this.qrCode = null;
      this.connectionStartTime = Date.now();
      
      // Reset connection health
      this.connectionHealth.isConnected = true;
      this.connectionHealth.reconnectAttempts = 0;
      this.connectionHealth.sessionHealth = 'healthy';
      this.connectionHealth.lastHeartbeat = new Date();
      
      // Get client info
      this.clientInfo = this.client?.info || null;
      
      if (this.clientInfo) {
        console.log(`📞 Connected as: ${this.clientInfo.pushname} (${this.clientInfo.wid.user})`);
      }
      
      // Start heartbeat monitoring
      this.startHeartbeatMonitoring();
      
      // Trigger connected event
      this.eventHandlers.onConnected?.();
    });
    
    // Authentication events
    this.client.on('authenticated', () => {
      console.log('🔐 Authentication successful');
    });
    
    this.client.on('auth_failure', (msg) => {
      console.error('❌ Authentication failed:', msg);
      this.handleAuthFailure();
    });
    
    // Disconnection handling
    this.client.on('disconnected', (reason) => {
      console.log('🔌 WhatsApp disconnected:', reason);
      this.handleDisconnection(reason);
    });
    
    // Loading and state changes
    this.client.on('loading_screen', (percent, message) => {
      console.log(`⏳ Loading: ${percent}% - ${message}`);
    });
    
    this.client.on('change_state', (state) => {
      console.log(`🔄 State changed: ${state}`);
      this.updateConnectionHealth(state);
    });
    
    // Session events
    this.client.on('remote_session_saved', () => {
      console.log('💾 Remote session saved');
      this.connectionHealth.sessionHealth = 'healthy';
    });
    
    // Message events for health tracking
    this.client.on('message_create', () => {
      this.connectionHealth.lastSuccessfulMessage = new Date();
    });
  }
  
  /**
   * Handle disconnection with smart reconnection
   */
  private handleDisconnection(reason: string): void {
    console.log(`🔌 Handling disconnection: ${reason}`);
    
    this.isConnected = false;
    this.connectionHealth.isConnected = false;
    this.connectionHealth.lastReconnectTime = new Date();
    
    // Stop heartbeat monitoring
    this.stopHeartbeatMonitoring();
    
    // Trigger disconnected event
    this.eventHandlers.onDisconnected?.(reason);
    
    // Determine if we should reconnect
    const reasonStr = String(reason).toLowerCase();
    
    if (reasonStr.includes('logout') || reasonStr.includes('logged out')) {
      console.log('👋 User logged out - not attempting reconnect');
      this.shouldReconnect = false;
      return;
    }
    
    if (reasonStr.includes('conflict') || reasonStr.includes('taken over')) {
      console.log('⚠️ Session taken over - clearing and reconnecting');
      this.clearSession().then(() => {
        this.scheduleReconnect();
      });
      return;
    }
    
    // For other disconnections, attempt reconnect
    this.scheduleReconnect();
  }
  
  /**
   * Schedule smart reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.isReconnecting) {
      return;
    }
    
    if (this.connectionHealth.reconnectAttempts >= PERSISTENT_CONFIG.MAX_RECONNECT_ATTEMPTS) {
      console.log('❌ Max reconnection attempts reached, restarting browser...');
      this.handleBrowserRestart();
      return;
    }
    
    this.isReconnecting = true;
    this.connectionHealth.reconnectAttempts++;
    
    const delay = Math.min(
      PERSISTENT_CONFIG.RECONNECT_DELAY_BASE * Math.pow(2, this.connectionHealth.reconnectAttempts - 1),
      PERSISTENT_CONFIG.RECONNECT_DELAY_MAX
    );
    
    console.log(`🔄 Scheduling reconnection attempt ${this.connectionHealth.reconnectAttempts}/${PERSISTENT_CONFIG.MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);
    
    // Trigger reconnecting event
    this.eventHandlers.onReconnecting?.(this.connectionHealth.reconnectAttempts);
    
    this.reconnectTimeout = setTimeout(() => {
      this.attemptReconnection();
    }, delay);
  }
  
  /**
   * Attempt reconnection
   */
  private async attemptReconnection(): Promise<void> {
    if (!this.shouldReconnect) {
      return;
    }
    
    try {
      console.log(`🔄 Attempting reconnection ${this.connectionHealth.reconnectAttempts}/${PERSISTENT_CONFIG.MAX_RECONNECT_ATTEMPTS}...`);
      
      // Clean up current client
      await this.cleanupClient();
      
      // Short delay before reinitializing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Reinitialize
      await this.initialize();
      
      console.log('✅ Reconnection successful!');
      
    } catch (error) {
      console.error(`❌ Reconnection attempt ${this.connectionHealth.reconnectAttempts} failed:`, error);
      
      // If this was the last attempt, try browser restart
      if (this.connectionHealth.reconnectAttempts >= PERSISTENT_CONFIG.MAX_RECONNECT_ATTEMPTS) {
        this.handleBrowserRestart();
      } else {
        // Schedule next attempt
        this.isReconnecting = false;
        this.scheduleReconnect();
      }
    }
  }
  
  /**
   * Handle browser restart as last resort
   */
  private async handleBrowserRestart(): Promise<void> {
    console.log('🔄 Attempting browser restart...');
    
    this.connectionHealth.browserRestarts++;
    this.connectionHealth.reconnectAttempts = 0; // Reset reconnect attempts
    
    try {
      // Force cleanup everything
      await this.cleanupClient();
      
      // Clear session if too many browser restarts
      if (this.connectionHealth.browserRestarts >= PERSISTENT_CONFIG.BROWSER_RESTART_THRESHOLD) {
        console.log('🗑️ Too many browser restarts, clearing session...');
        await this.clearSession();
        this.connectionHealth.browserRestarts = 0;
        this.connectionHealth.sessionHealth = 'healthy';
      }
      
      // Longer delay for browser restart
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Trigger browser restart event
      this.eventHandlers.onBrowserRestart?.();
      
      // Reinitialize
      this.isReconnecting = false;
      await this.initialize();
      
      console.log('✅ Browser restart successful!');
      
    } catch (error) {
      console.error('❌ Browser restart failed:', error);
      
      // As absolute last resort, clear session and try again
      await this.clearSession();
      this.connectionHealth.sessionHealth = 'critical';
      
      // Wait longer before final attempt
      setTimeout(() => {
        this.isReconnecting = false;
        this.scheduleReconnect();
      }, 30000);
    }
  }
  
  /**
   * Start heartbeat monitoring
   */
  private startHeartbeatMonitoring(): void {
    this.stopHeartbeatMonitoring(); // Clear any existing
    
    this.heartbeatInterval = setInterval(async () => {
      if (!this.client || !this.isConnected) {
        return;
      }
      
      try {
        // Simple heartbeat check
        const state = await this.client.getState();
        this.connectionHealth.lastHeartbeat = new Date();
        
        if (state !== 'CONNECTED') {
          console.warn(`⚠️ Heartbeat failed - state: ${state}`);
          this.connectionHealth.sessionHealth = 'degraded';
          
          if (state === 'UNPAIRED' || state === 'TIMEOUT') {
            console.log('💔 Heartbeat detected disconnection');
            this.handleDisconnection(`Heartbeat failure: ${state}`);
          }
        } else {
          this.connectionHealth.sessionHealth = 'healthy';
        }
      } catch (error) {
        console.error('💔 Heartbeat failed:', error);
        this.connectionHealth.sessionHealth = 'degraded';
        this.handleDisconnection('Heartbeat error');
      }
    }, PERSISTENT_CONFIG.HEARTBEAT_INTERVAL);
  }
  
  /**
   * Stop heartbeat monitoring
   */
  private stopHeartbeatMonitoring(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
  
  /**
   * Start background maintenance tasks
   */
  private startBackgroundTasks(): void {
    // Health check interval
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, PERSISTENT_CONFIG.HEALTH_CHECK_INTERVAL);
    
    // Session validation interval
    this.sessionValidationInterval = setInterval(() => {
      this.validateSessionHealth();
    }, PERSISTENT_CONFIG.SESSION_VALIDATION_INTERVAL);
    
    // Session cleanup interval
    this.sessionCleanupInterval = setInterval(() => {
      this.performSessionCleanup();
    }, PERSISTENT_CONFIG.SESSION_CLEANUP_INTERVAL);
  }
  
  /**
   * Perform comprehensive health check
   */
  private async performHealthCheck(): Promise<void> {
    if (!this.client || !this.isConnected) {
      return;
    }
    
    try {
      // Check connection state
      const state = await this.client.getState();
      
      if (state !== 'CONNECTED') {
        console.warn(`🏥 Health check failed - state: ${state}`);
        this.connectionHealth.sessionHealth = 'degraded';
        
        if (state === 'UNPAIRED' || state === 'TIMEOUT') {
          this.handleDisconnection(`Health check failure: ${state}`);
        }
      }
      
      // Update uptime
      if (this.connectionStartTime > 0) {
        this.connectionHealth.totalUptime = Date.now() - this.connectionStartTime;
      }
      
    } catch (error) {
      console.error('🏥 Health check error:', error);
      this.connectionHealth.sessionHealth = 'critical';
      this.handleDisconnection('Health check error');
    }
  }
  
  /**
   * Validate session health
   */
  private async validateSessionHealth(): Promise<void> {
    if (!this.isConnected) {
      return;
    }
    
    const sessionPath = path.resolve(PERSISTENT_CONFIG.SESSION_PATH);
    
    if (!fs.existsSync(sessionPath)) {
      console.warn('⚠️ Session directory disappeared during operation');
      this.connectionHealth.sessionHealth = 'critical';
      this.handleDisconnection('Session directory missing');
      return;
    }
    
    // Check for session corruption indicators
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      const { stdout } = await execAsync(`du -sm "${sessionPath}"`);
      const sizeMB = parseInt(stdout.split('\t')[0]);
      
      if (sizeMB > 800) { // 800MB critical threshold
        console.warn(`⚠️ Session size critical: ${sizeMB}MB`);
        this.connectionHealth.sessionHealth = 'critical';
        // Schedule session cleanup
        setTimeout(() => {
          this.clearSession();
        }, 5000);
      }
    } catch (error) {
      console.warn('⚠️ Could not validate session size:', error);
    }
  }
  
  /**
   * Perform session cleanup
   */
  private async performSessionCleanup(): Promise<void> {
    if (this.isConnected) {
      return; // Don't cleanup while connected
    }
    
    try {
      const sessionPath = path.resolve(PERSISTENT_CONFIG.SESSION_PATH);
      
      if (fs.existsSync(sessionPath)) {
        // Clean up temporary files
        const tempDirs = ['tmp', 'temp', 'cache'];
        
        for (const tempDir of tempDirs) {
          const tempPath = path.join(sessionPath, tempDir);
          if (fs.existsSync(tempPath)) {
            await fs.promises.rm(tempPath, { recursive: true, force: true });
            console.log(`🧹 Cleaned up ${tempDir} directory`);
          }
        }
      }
    } catch (error) {
      console.warn('⚠️ Session cleanup error:', error);
    }
  }
  
  /**
   * Update connection health based on state
   */
  private updateConnectionHealth(state: string): void {
    switch (state) {
      case 'CONNECTED':
        this.connectionHealth.sessionHealth = 'healthy';
        break;
      case 'OPENING':
      case 'PAIRING':
        this.connectionHealth.sessionHealth = 'degraded';
        break;
      case 'UNPAIRED':
      case 'TIMEOUT':
        this.connectionHealth.sessionHealth = 'critical';
        break;
    }
  }
  
  /**
   * Handle authentication failure
   */
  private async handleAuthFailure(): Promise<void> {
    console.log('🔐 Authentication failed, clearing session...');
    await this.clearSession();
    this.connectionHealth.sessionHealth = 'critical';
    this.scheduleReconnect();
  }
  
  /**
   * Handle initialization failure
   */
  private handleInitializationFailure(error: any): void {
    console.error('❌ Initialization failed:', error);
    
    this.connectionHealth.sessionHealth = 'critical';
    
    // If it's a timeout, suggest session clearing
    if (error instanceof Error && error.message.includes('timeout')) {
      console.log('⏱️ Initialization timeout - scheduling session cleanup');
      setTimeout(() => {
        this.clearSession().then(() => {
          this.scheduleReconnect();
        });
      }, 5000);
    } else {
      this.scheduleReconnect();
    }
  }
  
  /**
   * Send message with retry logic
   */
  public async sendMessage(phoneNumber: string, message: string): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      console.warn('⚠️ Client not ready for message sending');
      return false;
    }
    
    const maxRetries = 3;
    let retries = 0;
    
    while (retries < maxRetries) {
      try {
        // wwebjs expects the raw international number (without @c.us) in getNumberId
        const numberDetails = await this.client.getNumberId(phoneNumber);
        if (!numberDetails) {
          console.error(`Phone number ${phoneNumber} not found on WhatsApp`);
          return false;
        }
        
        const chatId = (numberDetails as any)._serialized || `${phoneNumber}@c.us`;
        await this.client.sendMessage(chatId, message);
        
        this.connectionHealth.lastSuccessfulMessage = new Date();
        
        console.log(`✅ Message sent successfully to ${phoneNumber}`);
        return true;
        
      } catch (error) {
        retries++;
        console.error(`❌ Message send attempt ${retries} failed:`, error);
        
        if (error instanceof Error && (
          error.message.includes('Session closed') ||
          error.message.includes('Protocol error') ||
          error.message.includes('Target closed')
        )) {
          console.log('🔄 Connection error detected, attempting reconnection...');
          this.handleDisconnection('Message send error');
          await new Promise(resolve => setTimeout(resolve, 5000));
          if (!this.isConnected) {
            return false;
          }
        }
        
        if (retries >= maxRetries) {
          return false;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000 * retries));
      }
    }
    
    return false;
  }
  
  /**
   * Clean up client resources
   */
  private async cleanupClient(): Promise<void> {
    if (this.client) {
      try {
        console.log('🧹 Cleaning up client resources...');
        
        // Stop heartbeat first
        this.stopHeartbeatMonitoring();
        
        // Check if client is still valid before destroying
        if (this.client && typeof this.client.destroy === 'function') {
          try {
            await this.client.destroy();
            console.log('✅ Client destroyed successfully');
          } catch (destroyError) {
            console.warn('⚠️ Error during client destroy (non-critical):', destroyError);
            // Continue with cleanup even if destroy fails
          }
        } else {
          console.log('⚠️ Client already destroyed or invalid');
        }
        
      } catch (error) {
        console.warn('⚠️ Error during client cleanup (non-critical):', error);
        // Don't throw error, just log it as cleanup should be resilient
      } finally {
        this.client = null;
        this.isConnected = false;
        this.clientInfo = null;
        this.qrCode = null;
        console.log('✅ Client state reset completed');
      }
    } else {
      console.log('ℹ️ No client to cleanup');
    }
  }
  
  /**
   * Clear session completely
   */
  public async clearSession(): Promise<void> {
    try {
      console.log('🗑️ Clearing session...');
      
      // Cleanup client first
      await this.cleanupClient();
      
      // Clear session files
      const sessionPath = path.resolve(PERSISTENT_CONFIG.SESSION_PATH);
      if (fs.existsSync(sessionPath)) {
        await fs.promises.rm(sessionPath, { recursive: true, force: true });
        console.log('✅ Session files cleared');
      }
      
      // Reset state
      this.qrCode = null;
      this.connectionHealth.sessionHealth = 'healthy';
      this.connectionHealth.reconnectAttempts = 0;
      this.connectionHealth.browserRestarts = 0;
      
      console.log('✅ Session cleared successfully');
      
    } catch (error) {
      console.error('❌ Error clearing session:', error);
    }
  }
  
  /**
   * Get current status
   */
  public getStatus(): {
    isConnected: boolean;
    qrCode: string | null;
    clientInfo: ClientInfo | null;
    health: ConnectionHealth;
    sessionExists: boolean;
  } {
    const sessionPath = path.resolve(PERSISTENT_CONFIG.SESSION_PATH);
    const sessionExists = fs.existsSync(sessionPath);
    
    return {
      isConnected: this.isConnected,
      qrCode: this.qrCode,
      clientInfo: this.clientInfo,
      health: { ...this.connectionHealth },
      sessionExists
    };
  }
  
  /**
   * Set event handlers
   */
  public setEventHandlers(handlers: Partial<PersistentConnectionEvents>): void {
    this.eventHandlers = { ...this.eventHandlers, ...handlers };
  }
  
  /**
   * Force reconnection
   */
  public async forceReconnect(): Promise<void> {
    console.log('🔄 Force reconnection requested...');
    
    this.shouldReconnect = true;
    this.connectionHealth.reconnectAttempts = 0;
    
    await this.cleanupClient();
    await new Promise(resolve => setTimeout(resolve, 2000));
    await this.initialize();
  }
  
  /**
   * Destroy service completely
   */
  public async destroy(): Promise<void> {
    console.log('🗑️ Destroying persistent connection service...');
    
    this.shouldReconnect = false;
    
    // Clear all timers
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.sessionValidationInterval) clearInterval(this.sessionValidationInterval);
    if (this.sessionCleanupInterval) clearInterval(this.sessionCleanupInterval);
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    
    // Cleanup client
    await this.cleanupClient();
    
    // Reset instance
    WhatsAppPersistentConnection.instance = null;
    
    console.log('✅ Persistent connection service destroyed');
  }
} 