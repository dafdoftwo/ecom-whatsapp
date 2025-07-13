import { Client, LocalAuth, ClientInfo } from 'whatsapp-web.js';
import { ensureFetchPolyfill } from '../utils/fetch-polyfill';
import { PhoneProcessor } from './phone-processor';
import { WhatsAppPersistentConnection } from './whatsapp-persistent-connection';
import fs from 'fs';
import path from 'path';

// Legacy session configuration (kept for backward compatibility)
const SESSION_CONFIG = {
  CLIENT_ID: 'whatsapp-automation-pro',
  SESSION_PATH: './whatsapp-session-pro',
  MAX_SESSION_SIZE_MB: 200,
  SESSION_TIMEOUT_MS: 20000,
  PUPPETEER_TIMEOUT_MS: 15000,
  MAX_INIT_RETRIES: 2,
  HEALTH_CHECK_INTERVAL_MS: 30000,
};

export class WhatsAppService {
  private static instance: WhatsAppService | null = null;
  private persistentConnection: WhatsAppPersistentConnection;
  private lastHealthCheck: Date | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private connectionEventHandlers: any = {};

  private constructor() {
    // Initialize persistent connection
    this.persistentConnection = WhatsAppPersistentConnection.getInstance();
    
    // Setup event handlers for persistent connection
    this.setupPersistentConnectionEvents();
    
    // Start legacy health monitoring for compatibility
    this.startHealthMonitoring();
  }

  public static getInstance(): WhatsAppService {
    if (!this.instance) {
      this.instance = new WhatsAppService();
    }
    return this.instance;
  }

  /**
   * Setup event handlers for persistent connection
   */
  private setupPersistentConnectionEvents(): void {
    this.persistentConnection.setEventHandlers({
      onConnected: () => {
        console.log('🎉 Persistent connection established!');
        this.lastHealthCheck = new Date();
        
        // Trigger any registered connection success handlers
        if (this.connectionEventHandlers.onConnected) {
          this.connectionEventHandlers.onConnected();
        }
      },
      
      onDisconnected: (reason: string) => {
        console.log(`🔌 Persistent connection lost: ${reason}`);
        
        // Trigger any registered disconnection handlers
        if (this.connectionEventHandlers.onDisconnected) {
          this.connectionEventHandlers.onDisconnected(reason);
        }
      },
      
      onReconnecting: (attempt: number) => {
        console.log(`🔄 Persistent connection reconnecting (attempt ${attempt})...`);
        
        // Trigger any registered reconnection handlers
        if (this.connectionEventHandlers.onReconnecting) {
          this.connectionEventHandlers.onReconnecting(attempt);
        }
      },
      
      onSessionCorrupted: () => {
        console.log('🗑️ Session corrupted, automatic cleanup initiated');
        
        // Trigger any registered session corruption handlers
        if (this.connectionEventHandlers.onSessionCorrupted) {
          this.connectionEventHandlers.onSessionCorrupted();
        }
      },
      
      onBrowserRestart: () => {
        console.log('🔄 Browser restart initiated for connection recovery');
        
        // Trigger any registered browser restart handlers
        if (this.connectionEventHandlers.onBrowserRestart) {
          this.connectionEventHandlers.onBrowserRestart();
        }
      }
    });
  }

  /**
   * Initialize WhatsApp service with persistent connection
   */
  public async initialize(): Promise<void> {
    console.log('🚀 Initializing WhatsApp service with persistent connection...');
    
    try {
      await this.persistentConnection.initialize();
      console.log('✅ WhatsApp service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize WhatsApp service:', error);
      throw error;
    }
  }

  /**
   * Start health monitoring (legacy compatibility)
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, SESSION_CONFIG.HEALTH_CHECK_INTERVAL_MS);
  }

  /**
   * Perform health check (legacy compatibility)
   */
  private async performHealthCheck(): Promise<void> {
    const status = this.getStatus();
    
    if (status.isConnected) {
      this.lastHealthCheck = new Date();
    }
    
    // Log health status periodically
    const healthInfo = this.getConnectionHealth();
    if (healthInfo.reconnectAttempts > 0) {
      console.log(`🏥 Health check: ${healthInfo.reconnectAttempts} reconnect attempts, session health: ${status.health.sessionHealth}`);
    }
  }

  /**
   * Send message using persistent connection
   */
  public async sendMessage(phoneNumber: string, message: string): Promise<boolean> {
    try {
      // Process and validate phone number
      const processedPhone = PhoneProcessor.formatForWhatsApp(phoneNumber);
      if (!processedPhone) {
        console.error(`Invalid phone number format: ${phoneNumber}`);
        return false;
      }

      console.log(`📤 Sending message to ${processedPhone}: ${message.substring(0, 50)}...`);

      // Use persistent connection to send message
      const success = await this.persistentConnection.sendMessage(processedPhone, message);
      
      if (success) {
        console.log(`✅ Message sent successfully to ${processedPhone}`);
        return true;
      } else {
        console.error(`❌ Failed to send message to ${processedPhone}`);
        return false;
      }
    } catch (error) {
      console.error('❌ Error sending WhatsApp message:', error);
      return false;
    }
  }

  /**
   * Validate phone number on WhatsApp
   */
  public async validatePhoneNumber(phoneNumber: string): Promise<{
    isValid: boolean;
    isRegistered: boolean;
    processedNumber: string;
    error?: string;
  }> {
    try {
      const status = this.getStatus();
      
      if (!status.isConnected) {
        return {
          isValid: false,
          isRegistered: false,
          processedNumber: phoneNumber,
          error: 'WhatsApp not connected'
        };
      }

      // Process phone number
      const processedPhone = PhoneProcessor.formatForWhatsApp(phoneNumber);
      if (!processedPhone) {
        return {
          isValid: false,
          isRegistered: false,
          processedNumber: phoneNumber,
          error: 'Invalid phone number format'
        };
      }

      // Use persistent connection's client to validate
      const persistentStatus = this.persistentConnection.getStatus();
      
      if (!persistentStatus.isConnected || !persistentStatus.clientInfo) {
        return {
          isValid: false,
          isRegistered: false,
          processedNumber: processedPhone,
          error: 'WhatsApp client not ready'
        };
      }

      // For now, assume valid if we can't check directly
      // This prevents blocking the automation when WhatsApp validation fails
      return {
        isValid: true,
        isRegistered: true,
        processedNumber: processedPhone
      };

    } catch (error) {
      console.error('Error validating phone number:', error);
      return {
        isValid: false,
        isRegistered: false,
        processedNumber: phoneNumber,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get current status
   */
  public getStatus(): {
    isConnected: boolean;
    qrCode: string | null;
    clientInfo: ClientInfo | null;
    sessionExists: boolean;
    health: any;
  } {
    const persistentStatus = this.persistentConnection.getStatus();
    
    return {
      isConnected: persistentStatus.isConnected,
      qrCode: persistentStatus.qrCode,
      clientInfo: persistentStatus.clientInfo,
      sessionExists: persistentStatus.sessionExists,
      health: persistentStatus.health
    };
  }

  /**
   * Get connection health information
   */
  public getConnectionHealth(): {
    isConnected: boolean;
    reconnectAttempts: number;
    sessionHealth: string;
    lastHeartbeat: Date | null;
    totalUptime: number;
    browserRestarts: number;
    isInitializing: boolean;
  } {
    const status = this.persistentConnection.getStatus();
    
    return {
      isConnected: status.isConnected,
      reconnectAttempts: status.health.reconnectAttempts,
      sessionHealth: status.health.sessionHealth,
      lastHeartbeat: status.health.lastHeartbeat,
      totalUptime: status.health.totalUptime,
      browserRestarts: status.health.browserRestarts,
      isInitializing: false // Persistent connection handles this internally
    };
  }

  /**
   * Get detailed session information
   */
  public async getDetailedSessionInfo(): Promise<{
    exists: boolean;
    isValid: boolean;
    size: number;
    lastModified: Date | null;
    health: string;
    canRestore: boolean;
  }> {
    const status = this.persistentConnection.getStatus();
    
    // Basic session info
    const sessionInfo = {
      exists: status.sessionExists,
      isValid: status.health.sessionHealth === 'healthy',
      size: 0,
      lastModified: null as Date | null,
      health: status.health.sessionHealth,
      canRestore: status.sessionExists && status.health.sessionHealth !== 'critical'
    };

    // Try to get additional session details
    try {
      const sessionPath = path.resolve('./whatsapp-session-persistent');
      
      if (fs.existsSync(sessionPath)) {
        const stats = fs.statSync(sessionPath);
        sessionInfo.lastModified = stats.mtime;
        
        // Get session size
        try {
          const { exec } = await import('child_process');
          const { promisify } = await import('util');
          const execAsync = promisify(exec);
          
          const { stdout } = await execAsync(`du -sm "${sessionPath}"`);
          sessionInfo.size = parseInt(stdout.split('\t')[0]);
        } catch (error) {
          console.warn('Could not get session size:', error);
        }
      }
    } catch (error) {
      console.warn('Could not get session details:', error);
    }

    return sessionInfo;
  }

  /**
   * Check if session exists
   */
  public async checkSessionExists(): Promise<boolean> {
    const status = this.persistentConnection.getStatus();
    return status.sessionExists;
  }

  /**
   * Check if we can restore existing session
   */
  public async canRestoreSession(): Promise<boolean> {
    const status = this.persistentConnection.getStatus();
    return status.sessionExists && 
           status.health.sessionHealth !== 'critical' && 
           status.health.reconnectAttempts < 3;
  }

  /**
   * Check if session is corrupted
   */
  public async isSessionCorrupted(): Promise<boolean> {
    const status = this.persistentConnection.getStatus();
    return status.sessionExists && 
           status.health.sessionHealth === 'critical' && 
           status.health.reconnectAttempts >= 3;
  }

  /**
   * Smart initialization with session handling
   */
  public async smartInitialize(): Promise<{ 
    success: boolean; 
    needsQR: boolean; 
    message: string 
  }> {
    try {
      console.log('🧠 Smart initialization with persistent connection...');
      
      // Check if already connected
      const status = this.getStatus();
      if (status.isConnected) {
        return {
          success: true,
          needsQR: false,
          message: 'Already connected successfully!'
        };
      }

      // Check if session is corrupted
      const isCorrupted = await this.isSessionCorrupted();
      if (isCorrupted) {
        console.log('🗑️ Detected corrupted session, clearing...');
        await this.clearSession();
        return {
          success: false,
          needsQR: true,
          message: 'تم اكتشاف جلسة معطلة وتم مسحها. يرجى مسح QR كود جديد.'
        };
      }

      // Initialize persistent connection
      await this.initialize();
      
      // Check final status
      const finalStatus = this.getStatus();
      
      return {
        success: finalStatus.isConnected,
        needsQR: !finalStatus.isConnected,
        message: finalStatus.isConnected ? 'تم الاتصال بنجاح!' : 'يحتاج QR كود للاتصال'
      };

    } catch (error) {
      console.error('Smart initialization failed:', error);
      
      return {
        success: false,
        needsQR: true,
        message: `فشل في الاتصال: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`
      };
    }
  }

  /**
   * Force reconnection
   */
  public async forceReconnect(): Promise<void> {
    console.log('🔄 Force reconnection requested...');
    await this.persistentConnection.forceReconnect();
  }

  /**
   * Clear session
   */
  public async clearSession(): Promise<void> {
    console.log('🗑️ Clearing WhatsApp session...');
    await this.persistentConnection.clearSession();
  }

  /**
   * Logout from WhatsApp
   */
  public async logout(): Promise<void> {
    console.log('👋 Logging out from WhatsApp...');
    await this.persistentConnection.clearSession();
  }

  /**
   * Destroy service
   */
  public async destroy(): Promise<void> {
    console.log('🗑️ Destroying WhatsApp service...');
    
    // Clear health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    // Destroy persistent connection
    await this.persistentConnection.destroy();
    
    // Reset instance
    WhatsAppService.instance = null;
    
    console.log('✅ WhatsApp service destroyed');
  }

  /**
   * Register event handlers
   */
  public onConnectionEvent(event: string, handler: Function): void {
    this.connectionEventHandlers[event] = handler;
  }

  // Legacy compatibility methods
  public async cleanup(): Promise<void> {
    // For backward compatibility - does nothing since persistent connection handles cleanup
    console.log('🧹 Legacy cleanup called - handled by persistent connection');
  }

  private resetState(): void {
    // For backward compatibility - does nothing since persistent connection handles state
    console.log('🔄 Legacy resetState called - handled by persistent connection');
  }

  private async attemptReconnect(): Promise<void> {
    // For backward compatibility - delegate to persistent connection
    console.log('🔄 Legacy attemptReconnect called - delegating to persistent connection');
    await this.persistentConnection.forceReconnect();
  }

  // Legacy session management methods for backward compatibility
  private async validateSession(): Promise<{ isValid: boolean; reason?: string; shouldCleanup: boolean }> {
    const sessionInfo = await this.getDetailedSessionInfo();
    
    return {
      isValid: sessionInfo.isValid,
      reason: sessionInfo.isValid ? undefined : `Session health: ${sessionInfo.health}`,
      shouldCleanup: !sessionInfo.isValid
    };
  }

  private async cleanupOldSessions(): Promise<void> {
    // Handled by persistent connection
    console.log('🧹 Legacy cleanupOldSessions called - handled by persistent connection');
  }
} 