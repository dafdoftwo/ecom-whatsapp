import { WhatsAppService } from './whatsapp';
import fs from 'fs';
import path from 'path';

export interface SessionState {
  status: 'not_initialized' | 'initializing' | 'waiting_qr' | 'authenticating' | 'connected' | 'disconnected' | 'error';
  qrCode?: string;
  error?: string;
  lastActivity?: Date;
  connectionAttempts: number;
  sessionHealth: 'healthy' | 'degraded' | 'critical';
}

export class WhatsAppSessionManager {
  private static instance: WhatsAppSessionManager | null = null;
  private whatsapp: WhatsAppService;
  private state: SessionState;
  private stateChangeCallbacks: ((state: SessionState) => void)[] = [];
  private initializationTimeout: NodeJS.Timeout | null = null;
  private qrTimeout: NodeJS.Timeout | null = null;

  private constructor() {
    this.whatsapp = WhatsAppService.getInstance();
    this.state = {
      status: 'not_initialized',
      connectionAttempts: 0,
      sessionHealth: 'healthy'
    };
  }

  public static getInstance(): WhatsAppSessionManager {
    if (!WhatsAppSessionManager.instance) {
      WhatsAppSessionManager.instance = new WhatsAppSessionManager();
    }
    return WhatsAppSessionManager.instance;
  }

  /**
   * Smart initialization with robust error handling
   */
  public async smartInitialize(): Promise<{
    success: boolean;
    needsQR: boolean;
    message: string;
    state: SessionState;
  }> {
    console.log('🧠 Smart Session Manager: Starting initialization');
    
    try {
      // Clear any existing timeouts
      this.clearTimeouts();
      
      // Update state
      this.updateState({
        status: 'initializing',
        error: undefined,
        connectionAttempts: this.state.connectionAttempts + 1
      });

      // Check current status
      const currentStatus = this.whatsapp.getStatus();
      
      // If already connected, just return success
      if (currentStatus.isConnected) {
        this.updateState({
          status: 'connected',
          qrCode: undefined,
          sessionHealth: 'healthy'
        });
        return {
          success: true,
          needsQR: false,
          message: 'الواتساب متصل بالفعل',
          state: this.state
        };
      }

      // Check session health
      const sessionHealth = await this.checkSessionHealth();
      
      // If session is corrupted, clear it first
      if (sessionHealth.isCorrupted) {
        console.log('🗑️ Corrupted session detected, clearing...');
        await this.clearSession();
        this.updateState({
          sessionHealth: 'critical',
          error: 'تم اكتشاف جلسة معطلة وحذفها'
        });
      }

      // Set initialization timeout
      this.initializationTimeout = setTimeout(() => {
        console.log('⏱️ Initialization timeout reached');
        this.updateState({
          status: 'error',
          error: 'انتهت مهلة التهيئة - حاول مرة أخرى',
          sessionHealth: 'critical'
        });
      }, 30000); // 30 seconds timeout

      // Initialize WhatsApp
      await this.whatsapp.initialize();
      
      // Wait for QR code generation
      const qrResult = await this.waitForQRCode();
      
      if (qrResult.success && qrResult.qrCode) {
        this.updateState({
          status: 'waiting_qr',
          qrCode: qrResult.qrCode,
          sessionHealth: 'healthy'
        });
        
        // Set QR timeout
        this.setQRTimeout();
        
        return {
          success: true,
          needsQR: true,
          message: 'تم توليد QR Code بنجاح - امسح الكود للاتصال',
          state: this.state
        };
      }

      // Check if connected after initialization
      const finalStatus = this.whatsapp.getStatus();
      if (finalStatus.isConnected) {
        this.updateState({
          status: 'connected',
          qrCode: undefined,
          sessionHealth: 'healthy'
        });
        return {
          success: true,
          needsQR: false,
          message: 'تم الاتصال بنجاح',
          state: this.state
        };
      }

      // Failed to generate QR or connect
      this.updateState({
        status: 'error',
        error: 'فشل في توليد QR Code',
        sessionHealth: 'degraded'
      });
      
      return {
        success: false,
        needsQR: true,
        message: 'فشل في توليد QR Code - حاول مسح الجلسة',
        state: this.state
      };

    } catch (error) {
      console.error('❌ Smart initialization error:', error);
      this.clearTimeouts();
      
      this.updateState({
        status: 'error',
        error: error instanceof Error ? error.message : 'خطأ غير معروف',
        sessionHealth: 'critical'
      });
      
      return {
        success: false,
        needsQR: true,
        message: `فشل في التهيئة: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`,
        state: this.state
      };
    }
  }

  /**
   * Force regenerate QR code
   */
  public async regenerateQR(): Promise<{
    success: boolean;
    qrCode?: string;
    message: string;
  }> {
    console.log('🔄 Regenerating QR Code...');
    
    try {
      // Clear timeouts
      this.clearTimeouts();
      
      // Disconnect if connected
      const status = this.whatsapp.getStatus();
      if (status.isConnected) {
        await this.whatsapp.destroy();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Force reconnect
      await this.whatsapp.forceReconnect();
      
      // Wait for QR
      const qrResult = await this.waitForQRCode();
      
      if (qrResult.success && qrResult.qrCode) {
        this.updateState({
          status: 'waiting_qr',
          qrCode: qrResult.qrCode,
          sessionHealth: 'healthy'
        });
        
        this.setQRTimeout();
        
        return {
          success: true,
          qrCode: qrResult.qrCode,
          message: 'تم توليد QR Code جديد بنجاح'
        };
      }
      
      return {
        success: false,
        message: 'فشل في توليد QR Code جديد'
      };
      
    } catch (error) {
      console.error('❌ Error regenerating QR:', error);
      return {
        success: false,
        message: `خطأ في إعادة توليد QR Code: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`
      };
    }
  }

  /**
   * Clear session completely
   */
  public async clearSession(): Promise<{
    success: boolean;
    message: string;
  }> {
    console.log('🗑️ Clearing WhatsApp session...');
    
    try {
      this.clearTimeouts();
      await this.whatsapp.clearSession();
      
      this.updateState({
        status: 'not_initialized',
        qrCode: undefined,
        error: undefined,
        connectionAttempts: 0,
        sessionHealth: 'healthy'
      });
      
      return {
        success: true,
        message: 'تم حذف الجلسة بنجاح'
      };
    } catch (error) {
      console.error('❌ Error clearing session:', error);
      return {
        success: false,
        message: `خطأ في حذف الجلسة: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`
      };
    }
  }

  /**
   * Get current session state
   */
  public getState(): SessionState {
    // Update with latest WhatsApp status
    const whatsappStatus = this.whatsapp.getStatus();
    
    if (whatsappStatus.isConnected && this.state.status !== 'connected') {
      this.updateState({
        status: 'connected',
        qrCode: undefined,
        sessionHealth: 'healthy'
      });
    } else if (!whatsappStatus.isConnected && this.state.status === 'connected') {
      this.updateState({
        status: 'disconnected',
        sessionHealth: 'degraded'
      });
    }
    
    if (whatsappStatus.qrCode && this.state.qrCode !== whatsappStatus.qrCode) {
      this.updateState({
        qrCode: whatsappStatus.qrCode,
        status: 'waiting_qr'
      });
    }
    
    return this.state;
  }

  /**
   * Subscribe to state changes
   */
  public onStateChange(callback: (state: SessionState) => void): () => void {
    this.stateChangeCallbacks.push(callback);
    return () => {
      this.stateChangeCallbacks = this.stateChangeCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Monitor connection health
   */
  public async monitorHealth(): Promise<{
    isHealthy: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];
    
    const whatsappStatus = this.whatsapp.getStatus();
    const health = this.whatsapp.getConnectionHealth();
    
    // Check connection status
    if (!whatsappStatus.isConnected) {
      issues.push('الواتساب غير متصل');
      if (!whatsappStatus.sessionExists) {
        recommendations.push('امسح QR Code جديد للاتصال');
      } else {
        recommendations.push('حاول إعادة الاتصال');
      }
    }
    
    // Check reconnect attempts
    if (health.reconnectAttempts > 2) {
      issues.push('محاولات إعادة اتصال متعددة فاشلة');
      recommendations.push('احذف الجلسة وابدأ من جديد');
    }
    
    // Check session health
    if (this.state.sessionHealth === 'critical') {
      issues.push('صحة الجلسة حرجة');
      recommendations.push('احذف الجلسة فوراً وأعد التشغيل');
    } else if (this.state.sessionHealth === 'degraded') {
      issues.push('صحة الجلسة متدهورة');
      recommendations.push('راقب الاتصال وأعد التشغيل إذا لزم');
    }
    
    // Check last activity
    if (this.state.lastActivity) {
      const inactiveMinutes = (Date.now() - this.state.lastActivity.getTime()) / 60000;
      if (inactiveMinutes > 30) {
        issues.push('لا يوجد نشاط منذ أكثر من 30 دقيقة');
        recommendations.push('تحقق من حالة الاتصال');
      }
    }
    
    return {
      isHealthy: issues.length === 0,
      issues,
      recommendations
    };
  }

  /**
   * Private helper methods
   */
  private async waitForQRCode(maxAttempts = 15): Promise<{
    success: boolean;
    qrCode?: string;
  }> {
    console.log('⏳ Waiting for QR code generation...');
    
    for (let i = 0; i < maxAttempts; i++) {
      const status = this.whatsapp.getStatus();
      
      if (status.qrCode) {
        console.log('✅ QR Code received');
        return { success: true, qrCode: status.qrCode };
      }
      
      if (status.isConnected) {
        console.log('✅ Already connected');
        return { success: true };
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('❌ Timeout waiting for QR code');
    return { success: false };
  }

  private async checkSessionHealth(): Promise<{
    exists: boolean;
    isValid: boolean;
    isCorrupted: boolean;
  }> {
    const sessionExists = await this.whatsapp.checkSessionExists();
    const isCorrupted = await this.whatsapp.isSessionCorrupted();
    const detailedInfo = await this.whatsapp.getDetailedSessionInfo();
    
    return {
      exists: sessionExists,
      isValid: detailedInfo.isValid,
      isCorrupted
    };
  }

  private updateState(updates: Partial<SessionState>): void {
    this.state = {
      ...this.state,
      ...updates,
      lastActivity: new Date()
    };
    
    // Notify subscribers
    this.stateChangeCallbacks.forEach(callback => {
      try {
        callback(this.state);
      } catch (error) {
        console.error('Error in state change callback:', error);
      }
    });
  }

  private setQRTimeout(): void {
    // Clear existing timeout
    if (this.qrTimeout) {
      clearTimeout(this.qrTimeout);
    }
    
    // Set new timeout (2 minutes for QR scan)
    this.qrTimeout = setTimeout(() => {
      console.log('⏱️ QR scan timeout');
      this.updateState({
        status: 'error',
        error: 'انتهت مهلة مسح QR Code',
        qrCode: undefined,
        sessionHealth: 'degraded'
      });
    }, 120000); // 2 minutes
  }

  private clearTimeouts(): void {
    if (this.initializationTimeout) {
      clearTimeout(this.initializationTimeout);
      this.initializationTimeout = null;
    }
    if (this.qrTimeout) {
      clearTimeout(this.qrTimeout);
      this.qrTimeout = null;
    }
  }
} 