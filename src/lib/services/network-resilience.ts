import { GoogleSheetsService } from './google-sheets';
import { WhatsAppService } from './whatsapp';
import { ConfigService } from './config';

// Network error types that require special handling
export interface NetworkError extends Error {
  code?: string;
  errno?: number;
  syscall?: string;
  address?: string;
  port?: number;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  exponentialBackoff: boolean;
  jitterFactor: number;
}

export interface NetworkResilienceStats {
  totalRetries: number;
  successfulRetries: number;
  failedRetries: number;
  errorsByType: Record<string, number>;
  lastError: { error: string; timestamp: Date } | null;
  circuitBreakerState: 'closed' | 'open' | 'half-open';
  consecutiveFailures: number;
}

export class NetworkResilienceService {
  private static stats: NetworkResilienceStats = {
    totalRetries: 0,
    successfulRetries: 0,
    failedRetries: 0,
    errorsByType: {},
    lastError: null,
    circuitBreakerState: 'closed',
    consecutiveFailures: 0
  };

  private static readonly DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 5,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    exponentialBackoff: true,
    jitterFactor: 0.1
  };

  private static readonly CIRCUIT_BREAKER_CONFIG = {
    failureThreshold: 10,
    resetTimeoutMs: 60000, // 1 minute
    halfOpenMaxCalls: 3
  };

  /**
   * Execute a function with retry logic and error handling
   */
  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const retryConfig = { ...this.DEFAULT_RETRY_CONFIG, ...config };
    let lastError: NetworkError | null = null;
    
    // Check circuit breaker
    if (this.stats.circuitBreakerState === 'open') {
      throw new Error(`Circuit breaker is open for ${operationName}. Service temporarily unavailable.`);
    }

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        // If circuit breaker is half-open, limit calls
        if (this.stats.circuitBreakerState === 'half-open' && attempt > this.CIRCUIT_BREAKER_CONFIG.halfOpenMaxCalls) {
          throw new Error(`Circuit breaker half-open limit exceeded for ${operationName}`);
        }

        console.log(`🔄 Attempting ${operationName} (attempt ${attempt + 1}/${retryConfig.maxRetries + 1})`);
        
        const result = await operation();
        
        // Success - reset circuit breaker and stats
        if (attempt > 0) {
          console.log(`✅ ${operationName} succeeded after ${attempt} retries`);
          this.stats.successfulRetries++;
        }
        
        this.resetCircuitBreaker();
        return result;

      } catch (error) {
        lastError = error as NetworkError;
        this.recordError(lastError, operationName);

        console.error(`❌ ${operationName} attempt ${attempt + 1} failed:`, {
          error: lastError.message,
          code: lastError.code,
          syscall: lastError.syscall
        });

        // Check if this is a retryable error
        if (!this.isRetryableError(lastError)) {
          console.log(`🚫 Non-retryable error for ${operationName}, failing immediately`);
          throw lastError;
        }

        // Don't wait after the last attempt
        if (attempt < retryConfig.maxRetries) {
          const delay = this.calculateDelay(attempt, retryConfig);
          console.log(`⏳ Waiting ${delay}ms before retry...`);
          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted
    this.stats.failedRetries++;
    this.updateCircuitBreakerState();
    
    const errorMessage = `${operationName} failed after ${retryConfig.maxRetries + 1} attempts. Last error: ${lastError?.message || 'Unknown error'}`;
    console.error(`💥 ${errorMessage}`);
    throw new Error(errorMessage);
  }

  /**
   * Execute Google Sheets operations with resilience
   */
  static async executeGoogleSheetsOperation<T>(
    operation: () => Promise<T>,
    operationName: string = 'Google Sheets Operation'
  ): Promise<T> {
    return this.executeWithRetry(
      operation,
      operationName,
      {
        maxRetries: 3,
        baseDelayMs: 2000,
        maxDelayMs: 10000
      }
    );
  }

  /**
   * Execute WhatsApp operations with resilience
   */
  static async executeWhatsAppOperation<T>(
    operation: () => Promise<T>,
    operationName: string = 'WhatsApp Operation'
  ): Promise<T> {
    return this.executeWithRetry(
      operation,
      operationName,
      {
        maxRetries: 2,
        baseDelayMs: 3000,
        maxDelayMs: 15000
      }
    );
  }

  /**
   * Check if an error is retryable
   */
  private static isRetryableError(error: NetworkError): boolean {
    // Network errors that should be retried
    const retryableCodes = [
      'ECONNRESET',
      'ECONNREFUSED', 
      'ETIMEDOUT',
      'ENOTFOUND',
      'EAI_AGAIN',
      'EPIPE',
      'ECONNABORTED'
    ];

    // HTTP status codes that should be retried
    const retryableStatusCodes = [408, 429, 500, 502, 503, 504];

    if (error.code && retryableCodes.includes(error.code)) {
      return true;
    }

    // Check for HTTP status codes in error message
    const statusMatch = error.message.match(/status code (\d+)/);
    if (statusMatch) {
      const statusCode = parseInt(statusMatch[1]);
      return retryableStatusCodes.includes(statusCode);
    }

    // Check for timeout errors
    if (error.message.toLowerCase().includes('timeout')) {
      return true;
    }

    // Check for rate limit errors
    if (error.message.toLowerCase().includes('rate limit')) {
      return true;
    }

    return false;
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  private static calculateDelay(attempt: number, config: RetryConfig): number {
    let delay = config.baseDelayMs;
    
    if (config.exponentialBackoff) {
      delay = config.baseDelayMs * Math.pow(2, attempt);
    }
    
    // Apply jitter to avoid thundering herd
    const jitter = delay * config.jitterFactor * Math.random();
    delay += jitter;
    
    return Math.min(delay, config.maxDelayMs);
  }

  /**
   * Record error statistics
   */
  private static recordError(error: NetworkError, operationName: string): void {
    this.stats.totalRetries++;
    this.stats.consecutiveFailures++;
    
    const errorKey = error.code || error.constructor.name;
    this.stats.errorsByType[errorKey] = (this.stats.errorsByType[errorKey] || 0) + 1;
    
    this.stats.lastError = {
      error: `${operationName}: ${error.message}`,
      timestamp: new Date()
    };
  }

  /**
   * Reset circuit breaker on success
   */
  private static resetCircuitBreaker(): void {
    this.stats.circuitBreakerState = 'closed';
    this.stats.consecutiveFailures = 0;
  }

  /**
   * Update circuit breaker state based on failures
   */
  private static updateCircuitBreakerState(): void {
    if (this.stats.consecutiveFailures >= this.CIRCUIT_BREAKER_CONFIG.failureThreshold) {
      this.stats.circuitBreakerState = 'open';
      console.log(`🚨 Circuit breaker opened due to ${this.stats.consecutiveFailures} consecutive failures`);
      
      // Schedule reset attempt
      setTimeout(() => {
        if (this.stats.circuitBreakerState === 'open') {
          this.stats.circuitBreakerState = 'half-open';
          console.log('🔄 Circuit breaker moved to half-open state');
        }
      }, this.CIRCUIT_BREAKER_CONFIG.resetTimeoutMs);
    }
  }

  /**
   * Sleep utility function
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current resilience statistics
   */
  static getStats(): NetworkResilienceStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics (useful for testing)
   */
  static resetStats(): void {
    this.stats = {
      totalRetries: 0,
      successfulRetries: 0,
      failedRetries: 0,
      errorsByType: {},
      lastError: null,
      circuitBreakerState: 'closed',
      consecutiveFailures: 0
    };
  }

  /**
   * Resilient Google Sheets data fetching
   */
  static async getSheetDataResilient(): Promise<any[]> {
    return this.executeGoogleSheetsOperation(
      async () => {
        console.log('📊 Attempting resilient Google Sheets data fetch...');
        return await GoogleSheetsService.getSheetData();
      },
      'Google Sheets Data Fetch'
    );
  }

  /**
   * Resilient WhatsApp message sending
   */
  static async sendWhatsAppMessageResilient(phoneNumber: string, message: string): Promise<boolean> {
    return this.executeWhatsAppOperation(
      async () => {
        console.log(`📱 Attempting resilient WhatsApp message send to ${phoneNumber}...`);
        const whatsapp = WhatsAppService.getInstance();
        return await whatsapp.sendMessage(phoneNumber, message);
      },
      `WhatsApp Message Send to ${phoneNumber}`
    );
  }

  /**
   * Resilient WhatsApp initialization
   */
  static async initializeWhatsAppResilient(): Promise<any> {
    return this.executeWhatsAppOperation(
      async () => {
        console.log('📱 Attempting resilient WhatsApp initialization...');
        const whatsapp = WhatsAppService.getInstance();
        return await whatsapp.smartInitialize();
      },
      'WhatsApp Initialization'
    );
  }

  /**
   * Health check for all services
   */
  static async performHealthCheck(): Promise<{
    overall: 'healthy' | 'degraded' | 'critical';
    services: {
      googleSheets: { status: 'healthy' | 'degraded' | 'critical'; lastTest: Date; error?: string };
      whatsapp: { status: 'healthy' | 'degraded' | 'critical'; lastTest: Date; error?: string };
      network: { status: 'healthy' | 'degraded' | 'critical'; circuitBreakerState: string; errorRate: number };
    };
    recommendations: string[];
  }> {
    const healthCheck = {
      overall: 'healthy' as 'healthy' | 'degraded' | 'critical',
      services: {
        googleSheets: { status: 'healthy' as 'healthy' | 'degraded' | 'critical', lastTest: new Date(), error: undefined as string | undefined },
        whatsapp: { status: 'healthy' as 'healthy' | 'degraded' | 'critical', lastTest: new Date(), error: undefined as string | undefined },
        network: { 
          status: 'healthy' as 'healthy' | 'degraded' | 'critical', 
          circuitBreakerState: this.stats.circuitBreakerState,
          errorRate: this.calculateErrorRate()
        }
      },
      recommendations: [] as string[]
    };

    // Test Google Sheets
    try {
      await this.executeGoogleSheetsOperation(async () => {
        const config = await ConfigService.getGoogleConfig();
        if (!config.spreadsheetUrl || !config.credentials) {
          throw new Error('Google Sheets not configured');
        }
        // Quick validation
        await GoogleSheetsService.validateConfiguration();
        return true;
      }, 'Health Check - Google Sheets');
    } catch (error) {
      healthCheck.services.googleSheets.status = 'critical';
      healthCheck.services.googleSheets.error = error instanceof Error ? error.message : 'Unknown error';
      healthCheck.recommendations.push('Configure Google Sheets credentials and spreadsheet URL');
    }

    // Test WhatsApp
    try {
      const whatsapp = WhatsAppService.getInstance();
      const status = whatsapp.getStatus();
      if (!status.isConnected) {
        healthCheck.services.whatsapp.status = 'degraded';
        healthCheck.services.whatsapp.error = 'WhatsApp not connected';
        healthCheck.recommendations.push('Initialize WhatsApp connection');
      }
    } catch (error) {
      healthCheck.services.whatsapp.status = 'critical';
      healthCheck.services.whatsapp.error = error instanceof Error ? error.message : 'Unknown error';
      healthCheck.recommendations.push('Fix WhatsApp connection issues');
    }

    // Evaluate network health
    if (this.stats.circuitBreakerState === 'open') {
      healthCheck.services.network.status = 'critical';
      healthCheck.recommendations.push('Wait for circuit breaker to reset or restart services');
    } else if (this.calculateErrorRate() > 0.5) {
      healthCheck.services.network.status = 'degraded';
      healthCheck.recommendations.push('High error rate detected - monitor network connectivity');
    }

    // Determine overall status
    const statuses = Object.values(healthCheck.services).map(s => s.status);
    if (statuses.includes('critical')) {
      healthCheck.overall = 'critical';
    } else if (statuses.includes('degraded')) {
      healthCheck.overall = 'degraded';
    }

    return healthCheck;
  }

  /**
   * Calculate current error rate
   */
  private static calculateErrorRate(): number {
    const total = this.stats.totalRetries + this.stats.successfulRetries;
    if (total === 0) return 0;
    return this.stats.failedRetries / total;
  }
} 