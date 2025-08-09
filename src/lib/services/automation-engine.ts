import { GoogleSheetsService } from './google-sheets';
import { ConfigService } from './config';
import { QueueService, MessageJob, ReminderJob } from './queue';
import { WhatsAppService } from './whatsapp';
import { PhoneProcessor } from './phone-processor';
import { NetworkResilienceService } from './network-resilience';
import { setupGlobalErrorHandlers } from '../utils/error-handler';
import { DuplicateGuardService } from './duplicate-guard';
import type { SheetRow, MessageTemplates } from '../types/config';

// Setup global error handlers
setupGlobalErrorHandlers();

export class AutomationEngine {
  private static isRunning = false;
  private static intervalId: NodeJS.Timeout | null = null;
  private static processedOrders = new Set<string>();
  private static orderStatusHistory = new Map<string, { status: string, timestamp: number }>();

  // حالات الطلبات المصرية المدعومة حسب المواصفات
  private static readonly EGYPTIAN_ORDER_STATUSES = {
    // الحالة الأولى: طلب جديد (New Order)
    NEW: 'جديد',
    NEW_2: 'طلب جديد',
    NEW_3: 'قيد المراجعة',
    NEW_4: 'قيد المراجعه',
    EMPTY: '',                    // طلب بدون حالة يُعتبر جديد
    UNDEFINED: 'غير محدد',        // حالة افتراضية تُعتبر جديد
    
    // الحالة الثانية: لم يرد (No Answer)
    NO_ANSWER_1: 'لم يتم الرد',
    NO_ANSWER_2: 'لم يرد',
    NO_ANSWER_3: 'لا يرد',
    NO_ANSWER_4: 'عدم الرد',
    
    // الحالة الثالثة: تم التأكيد أو الشحن (Confirmed/Shipped)
    CONFIRMED: 'تم التأكيد',
    CONFIRMED_2: 'تم التاكيد',
    CONFIRMED_3: 'مؤكد',
    SHIPPED: 'تم الشحن',
    SHIPPED_2: 'قيد الشحن',
    
    // الحالة الرابعة: تم الرفض (Rejected)
    REJECTED_1: 'تم الرفض',
    REJECTED_2: 'مرفوض',
    REJECTED_3: 'رفض الاستلام',
    REJECTED_4: 'رفض الأستلام',
    REJECTED_5: 'لم يتم الاستلام',
  } as const;

  // Track sent messages to prevent duplicates
  private static sentMessages = new Map<string, { messageType: string, timestamp: number }>();

  // Enhanced duplicate prevention tracking
  private static duplicateAttempts = new Map<string, {
    orderId: string;
    messageType: string;
    attemptCount: number;
    lastAttempt: number;
    preventedDuplicates: number;
  }>();

  // Global duplicate prevention statistics
  private static duplicatePreventionStats = {
    totalDuplicatesPrevented: 0,
    duplicatesPreventedByType: {
      newOrder: 0,
      noAnswer: 0,
      shipped: 0,
      rejectedOffer: 0,
      reminder: 0
    }
  };

  // Phone validation cache for optimization
  private static phoneValidationCache = new Map<string, {
    isValid: boolean;
    isRegistered: boolean;
    processedPhone: string;
    lastChecked: number;
    reason?: string;
  }>();

  // Cache configuration
  private static readonly PHONE_CACHE_EXPIRATION = 1000 * 60 * 60 * 24; // 24 hours

  // Empty status tracking
  private static updatedFromEmptyStatus = new Set<string>();

  // Performance monitoring
  private static performanceStats = {
    processingStartTime: 0,
    lastProcessingTime: 0,
    avgProcessingTime: 0,
    totalProcessingCycles: 0,
    cacheHits: 0,
    cacheMisses: 0,
    whatsappApiCalls: 0,
    whatsappConnectionIssues: 0,
    automaticReconnections: 0
  };

  static async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Automation engine is already running');
      return;
    }

    try {
      console.log('🚀 Starting OPTIMIZED Egyptian WhatsApp automation engine with persistent connection...');
      
      // Reset any previous state
      this.isRunning = false;
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      
      // Log supported statuses for debugging
      this.logSupportedStatuses();
      
      // Initialize cache cleanup timer
      this.initializeCacheCleanup();
      
      // STEP 1: Initialize Queue Service with error handling
      console.log('🔄 Step 1: Initializing queue service...');
      try {
        await QueueService.initialize();
        console.log('✅ Queue service initialized successfully');
      } catch (queueError) {
        console.warn('⚠️ Queue service initialization failed, continuing with local fallback:', queueError);
        // Don't fail the entire startup for queue issues
      }
      
      // STEP 2: Validate Essential Services
      console.log('🔍 Step 2: Validating essential services...');
      
      // Check Google Sheets configuration
      try {
        const sheetsValidation = await GoogleSheetsService.validateConfiguration();
        if (!sheetsValidation.isValid) {
          throw new Error(`Google Sheets validation failed: ${sheetsValidation.errors.join(', ')}`);
        }
        console.log('✅ Google Sheets configuration validated');
      } catch (sheetsError) {
        console.error('❌ Google Sheets validation failed:', sheetsError);
        throw new Error(`Cannot start automation: Google Sheets configuration invalid - ${sheetsError instanceof Error ? sheetsError.message : 'Unknown error'}`);
      }
      
      // Check basic configuration
      try {
        const configHealth = await ConfigService.getConfigHealth();
        if (!configHealth.google.configured) {
          throw new Error('Google configuration is not complete');
        }
        if (!configHealth.messages.valid) {
          throw new Error('Message templates are invalid or missing');
        }
        console.log('✅ Basic configuration validated');
      } catch (configError) {
        console.error('❌ Configuration validation failed:', configError);
        throw new Error(`Cannot start automation: Configuration invalid - ${configError instanceof Error ? configError.message : 'Unknown error'}`);
      }
      
      // STEP 3: Test Data Access
      console.log('📊 Step 3: Testing data access...');
      try {
        const testData = await NetworkResilienceService.getSheetDataResilient();
        console.log(`✅ Data access successful - found ${testData.length} orders`);
        if (testData.length === 0) {
          console.log('⚠️ No orders found - system will wait for data');
        }
      } catch (dataError) {
        console.error('❌ Data access test failed:', dataError);
        throw new Error(`Cannot start automation: Unable to access Google Sheets data - ${dataError instanceof Error ? dataError.message : 'Unknown error'}`);
      }
      
      // STEP 4: Initialize WhatsApp with Persistent Connection
      console.log('📱 Step 4: Initializing WhatsApp with persistent connection...');
      try {
        const whatsapp = WhatsAppService.getInstance();
        
        // Setup connection event handlers for monitoring
        whatsapp.onConnectionEvent('onConnected', () => {
          console.log('✅ WhatsApp persistent connection established');
          this.performanceStats.automaticReconnections++;
        });
        
        whatsapp.onConnectionEvent('onDisconnected', (reason: string) => {
          console.log(`⚠️ WhatsApp disconnected: ${reason}`);
          this.performanceStats.whatsappConnectionIssues++;
        });
        
        whatsapp.onConnectionEvent('onReconnecting', (attempt: number) => {
          console.log(`🔄 WhatsApp reconnecting (attempt ${attempt})...`);
        });
        
        whatsapp.onConnectionEvent('onSessionCorrupted', () => {
          console.log('🗑️ WhatsApp session corrupted - automatic cleanup initiated');
        });
        
        // Try to initialize WhatsApp
        const initResult = await whatsapp.smartInitialize();
        if (initResult.success) {
          console.log('✅ WhatsApp initialized and connected successfully');
        } else {
          console.log(`⚠️ WhatsApp not connected (${initResult.message}) - messages will be queued`);
        }
        
      } catch (whatsappError) {
        console.warn('⚠️ WhatsApp initialization failed, but continuing:', whatsappError);
        // Don't fail the entire startup for WhatsApp issues
      }
      
      // STEP 5: Pre-warm phone validation cache
      console.log('🔥 Step 5: Pre-warming phone validation cache...');
      try {
        await this.preWarmPhoneCache();
        console.log('✅ Phone validation cache pre-warmed successfully');
      } catch (cacheError) {
        console.warn('⚠️ Cache pre-warming failed, but continuing:', cacheError);
      }
      
      // STEP 6: Start the processing loop
      console.log('🚀 Step 6: Starting processing loop with persistent connection...');
      this.isRunning = true;
      
      try {
        await this.startProcessingLoop();
        console.log('✅ Processing loop started successfully');
      } catch (loopError) {
        this.isRunning = false;
        console.error('❌ Failed to start processing loop:', loopError);
        throw new Error(`Cannot start automation: Processing loop failed - ${loopError instanceof Error ? loopError.message : 'Unknown error'}`);
      }
      
      // STEP 7: Final validation
      console.log('🎯 Step 7: Final validation...');
      if (!this.isRunning) {
        throw new Error('Automation engine failed to start properly');
      }
      
      console.log('✅ OPTIMIZED Egyptian automation engine with persistent connection started successfully');
      console.log('🎯 System is now ready to process orders automatically with continuous WhatsApp connection');
      console.log('📊 Next processing cycle will begin in 30 seconds');
      
    } catch (error) {
      console.error('❌ Error starting automation engine:', error);
      
      // Clean up on failure
      this.isRunning = false;
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      
      // Re-throw with more context
      const errorMessage = error instanceof Error ? error.message : 'Unknown startup error';
      throw new Error(`Automation Engine Startup Failed: ${errorMessage}`);
    }
  }

  static async stop(): Promise<void> {
    console.log('🛑 Stopping automation engine...');
    
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    // Clear all caches
    this.phoneValidationCache.clear();
    this.duplicateAttempts.clear();
    this.sentMessages.clear();
    
    console.log('✅ Automation engine stopped successfully');
  }

  static getStatus(): {
    isRunning: boolean;
    performance: typeof AutomationEngine.performanceStats;
    duplicatePreventionStats: typeof AutomationEngine.duplicatePreventionStats;
    cacheStats: {
      phoneValidationCacheSize: number;
      duplicateAttemptsSize: number;
      sentMessagesSize: number;
    };
    whatsappConnectionHealth: any;
  } {
    const whatsapp = WhatsAppService.getInstance();
    const connectionHealth = whatsapp.getConnectionHealth();
    
    return {
      isRunning: this.isRunning,
      performance: { ...this.performanceStats },
      duplicatePreventionStats: { ...this.duplicatePreventionStats },
      cacheStats: {
        phoneValidationCacheSize: this.phoneValidationCache.size,
        duplicateAttemptsSize: this.duplicateAttempts.size,
        sentMessagesSize: this.sentMessages.size
      },
      whatsappConnectionHealth: connectionHealth
    };
  }

  private static async startProcessingLoop(): Promise<void> {
    const timingConfig = await ConfigService.getTimingConfig();
    const checkInterval = (timingConfig.checkIntervalSeconds || 15) * 1000;
    
    console.log(`⏰ Processing loop configured with ${checkInterval / 1000} second intervals`);
    
    const processLoop = async () => {
      // Check if engine is still supposed to be running
      if (!this.isRunning) {
        console.log('🛑 Automation engine stopped, exiting processing loop');
        return;
      }

      let processingSuccess = false;
      
      try {
        this.performanceStats.processingStartTime = Date.now();
        console.log('🔄 Egyptian automation engine processing cycle (OPTIMIZED with persistent connection)...');
        
        // Pre-processing checks
        console.log('🔍 Pre-processing system checks...');
        
        // Check Google Sheets availability
        try {
          await NetworkResilienceService.getSheetDataResilient();
        } catch (sheetsError) {
          console.error('❌ Google Sheets unavailable during processing:', sheetsError);
          throw new Error(`Google Sheets access failed: ${sheetsError instanceof Error ? sheetsError.message : 'Unknown error'}`);
        }
        
        // Check WhatsApp status with persistent connection
        try {
          const whatsapp = WhatsAppService.getInstance();
          const status = whatsapp.getStatus();
          const health = whatsapp.getConnectionHealth();
          
          if (!status.isConnected) {
            console.log('⚠️ WhatsApp disconnected - messages will be queued, persistent connection will auto-reconnect');
            
            // If session is corrupted, trigger smart recovery
            if (health.sessionHealth === 'critical') {
              console.log('🔄 Critical session detected, triggering smart recovery...');
              await whatsapp.smartInitialize();
            }
          } else {
            console.log(`✅ WhatsApp connected (uptime: ${Math.round(health.totalUptime / 1000)}s, health: ${health.sessionHealth})`);
          }
        } catch (whatsappError) {
          console.warn('⚠️ WhatsApp status check failed during processing:', whatsappError);
          this.performanceStats.whatsappConnectionIssues++;
        }
        
        // Start main processing
        console.log('🚀 Starting optimized order processing...');
        await this.processSheetDataOptimized();
        
        processingSuccess = true;
        
        // Update performance stats
        const processingTime = Date.now() - this.performanceStats.processingStartTime;
        this.performanceStats.lastProcessingTime = processingTime;
        this.performanceStats.totalProcessingCycles++;
        this.performanceStats.avgProcessingTime = 
          (this.performanceStats.avgProcessingTime * (this.performanceStats.totalProcessingCycles - 1) + processingTime) / 
          this.performanceStats.totalProcessingCycles;
        
        console.log(`⚡ Processing completed successfully in ${processingTime}ms (avg: ${Math.round(this.performanceStats.avgProcessingTime)}ms)`);
        console.log(`📊 Cache stats: ${this.performanceStats.cacheHits} hits, ${this.performanceStats.cacheMisses} misses, ${this.performanceStats.whatsappApiCalls} API calls`);
        console.log(`🔄 Connection stats: ${this.performanceStats.whatsappConnectionIssues} issues, ${this.performanceStats.automaticReconnections} auto-reconnections`);
        
      } catch (error) {
        console.error('❌ Error in processing cycle:', error);
        
        // Check if this is a critical error that should stop the engine
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        if (errorMessage.includes('Google Sheets access failed') && 
            errorMessage.includes('Authentication')) {
          console.error('🚨 Critical authentication error - stopping automation engine');
          this.isRunning = false;
          return;
        }
        
        // For other errors, log and continue
        console.log('⚠️ Non-critical error, continuing with next cycle...');
      }

      // Schedule next processing cycle only if engine is still running
      if (this.isRunning) {
        const nextCycleTime = processingSuccess ? checkInterval : Math.min(checkInterval * 2, 60000); // Backoff on failure
        console.log(`⏰ Next processing cycle in ${nextCycleTime / 1000} seconds...`);
        
        this.intervalId = setTimeout(() => {
          processLoop().catch(error => {
            console.error('❌ Critical error in processing loop:', error);
            console.log('🛑 Stopping automation engine due to critical error');
            this.isRunning = false;
          });
        }, nextCycleTime);
      } else {
        console.log('🛑 Processing loop stopped - engine is no longer running');
      }
    };

    // Start the first processing cycle with a small delay
    console.log('🚀 Starting first processing cycle in 2 seconds...');
    this.intervalId = setTimeout(() => {
      processLoop().catch(error => {
        console.error('❌ Critical error in initial processing loop:', error);
        console.log('🛑 Stopping automation engine due to critical startup error');
        this.isRunning = false;
        throw error;
      });
    }, 2000); // 2 second delay for initial startup
  }

  private static async processSheetDataOptimized(): Promise<void> {
    try {
      console.log('📊 Starting optimized sheet data processing with network resilience...');
      
      // Get configuration - FIX: Extract templates from the response
      const templatesConfig = await ConfigService.getMessageTemplates();
      const templates = templatesConfig.templates; // Extract the actual templates
      const timingConfig = await ConfigService.getTimingConfig();
      const reminderDelayHours = timingConfig.reminderDelayHours || 24;
      const rejectedOfferDelayHours = timingConfig.rejectedOfferDelayHours || 24;
      
      // Validate templates
      if (!templates || typeof templates !== 'object') {
        console.error('❌ Invalid templates configuration:', templates);
        throw new Error('Message templates are not properly configured');
      }
      
      // Get sheet data with network resilience
      console.log('📊 Fetching data with network resilience...');
      const sheetData = await NetworkResilienceService.getSheetDataResilient();
      console.log(`📋 Processing ${sheetData.length} orders from Google Sheets`);
      
      // Process in batches for better performance
      const batchSize = 50;
      let processedCount = 0;
      let skippedCount = 0;
      let invalidPhoneCount = 0;
      let whatsappValidationCount = 0;

      for (let i = 0; i < sheetData.length; i += batchSize) {
        const batch = sheetData.slice(i, i + batchSize);
        
        for (const row of batch) {
          // Stage 1: FAST Data Sanitization & Phone Number Resolution
          const sanitizationResult = await this.sanitizeAndValidateRowOptimized(row);
          
          if (!sanitizationResult.isValid) {
            if (sanitizationResult.reason === 'invalid_phone') {
              invalidPhoneCount++;
            } else if (sanitizationResult.reason === 'not_whatsapp_user') {
              whatsappValidationCount++;
            }
            skippedCount++;
            continue;
          }

          // Stage 2: Business Logic Application
          const orderId = row.orderId!;
          const currentStatus = row.orderStatus;
          // Use a stable key per spreadsheet row to detect first‑seen and status changes even if orderId formatting changes
          const stableKey = orderId || `row_${row.rowIndex}_${(row.name || '').substring(0,3)}`;
          const previousStatusData = this.orderStatusHistory.get(stableKey);
          
          // Update status history
          this.orderStatusHistory.set(stableKey, {
            status: currentStatus,
            timestamp: Date.now()
          });
           
          // Check if this is a new order or status change
          const isNewOrder = !previousStatusData;
          const statusChanged = previousStatusData && previousStatusData.status !== currentStatus;
 
          if (isNewOrder || statusChanged) {
            console.log(`📝 Processing order ${orderId}: ${isNewOrder ? 'NEW' : 'STATUS_CHANGE'} - ${currentStatus}`);
            await this.handleEgyptianOrderStatusChange(row, templates, reminderDelayHours, rejectedOfferDelayHours);
            processedCount++;
          } else if (previousStatusData) {
            // Check for reminder conditions
            await this.checkReminderConditions(row, previousStatusData, templates, reminderDelayHours);
          }
        }
      }

      console.log(`✅ Batch processing completed: ${processedCount} processed, ${skippedCount} skipped`);
      console.log(`📊 Skip reasons: ${invalidPhoneCount} invalid phones, ${whatsappValidationCount} not WhatsApp users`);
      
      // Log network resilience stats
      const resilienceStats = NetworkResilienceService.getStats();
      if (resilienceStats.totalRetries > 0) {
        console.log(`🔄 Network resilience stats: ${resilienceStats.totalRetries} retries, ${resilienceStats.successfulRetries} successful, circuit breaker: ${resilienceStats.circuitBreakerState}`);
      }
      
    } catch (error) {
      console.error('❌ Error in optimized sheet data processing:', error);
      
      // Log the error type for better debugging
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          name: error.name,
          code: (error as any).code,
          syscall: (error as any).syscall
        });
      }
      
      throw error;
    }
  }

  /**
   * ⚡ OPTIMIZED Stage 1: Data Sanitization with Caching
   */
  private static async sanitizeAndValidateRowOptimized(row: SheetRow): Promise<{
    isValid: boolean;
    reason?: 'missing_data' | 'invalid_phone' | 'not_whatsapp_user';
    details?: string;
    finalPhone?: string;
  }> {
    // التحقق من البيانات الأساسية
    if (!row.name || (!row.phone && !row.whatsappNumber)) {
      return {
        isValid: false,
        reason: 'missing_data',
        details: 'اسم العميل أو رقم الهاتف مفقود'
      };
    }

    // Phone Number Prioritization: فحص رقم الواتساب أولاً ثم رقم الهاتف
    const phoneProcessing = PhoneProcessor.processTwoNumbers(row.phone, row.whatsappNumber);
    
    if (!phoneProcessing.isValid) {
      return {
        isValid: false,
        reason: 'invalid_phone',
        details: phoneProcessing.processingLog.join(' | ')
      };
    }

    // Egyptian Number Validation: التحقق من صحة الرقم المصري
    const egyptianValidation = PhoneProcessor.validateEgyptianNumber(phoneProcessing.preferredNumber);
    if (!egyptianValidation.isValid) {
      return {
        isValid: false,
        reason: 'invalid_phone',
        details: `الرقم المصري غير صحيح: ${egyptianValidation.errors.join(', ')}`
      };
    }

    // ⚡ OPTIMIZED WhatsApp Check with Caching
    const finalPhone = egyptianValidation.finalFormat;
    const cached = this.phoneValidationCache.get(finalPhone);
    
    if (cached && (Date.now() - cached.lastChecked) < this.PHONE_CACHE_EXPIRATION) {
      // Use cached result
      this.performanceStats.cacheHits++;
      
      if (!cached.isRegistered) {
        return {
          isValid: false,
          reason: 'not_whatsapp_user',
          details: cached.reason || 'الرقم غير مسجل على الواتساب (مخزن)'
        };
      }
      
      return {
        isValid: true,
        finalPhone: cached.processedPhone
      };
    }

    // Cache miss - need to validate with WhatsApp
    this.performanceStats.cacheMisses++;
    this.performanceStats.whatsappApiCalls++;
    
    const whatsapp = WhatsAppService.getInstance();
    const whatsappStatus = whatsapp.getStatus();
    
    if (!whatsappStatus.isConnected) {
      // If WhatsApp is not connected, assume valid to avoid blocking
      // The persistent connection will handle reconnection automatically
      console.log(`⚠️ WhatsApp not connected, assuming phone ${finalPhone} is valid (persistent connection will handle reconnection)`);
      return {
        isValid: true,
        finalPhone: finalPhone
      };
    }
    
    const whatsappValidation = await whatsapp.validatePhoneNumber(finalPhone);
    
    // Cache the result
    this.phoneValidationCache.set(finalPhone, {
      isValid: whatsappValidation.isValid,
      isRegistered: whatsappValidation.isRegistered,
      processedPhone: whatsappValidation.processedNumber,
      lastChecked: Date.now(),
      reason: whatsappValidation.error
    });
    
    if (!whatsappValidation.isRegistered) {
      return {
        isValid: false,
        reason: 'not_whatsapp_user',
        details: whatsappValidation.error || 'الرقم غير مسجل على الواتساب'
      };
    }

    return {
      isValid: true,
      finalPhone: whatsappValidation.processedNumber
    };
  }

  private static async handleEgyptianOrderStatusChange(
    row: SheetRow, 
    templates: MessageTemplates, 
    reminderDelayHours: number, 
    rejectedOfferDelayHours: number
  ): Promise<void> {
    const { orderId, processedPhone, orderStatus, rowIndex, name } = row;
    
    if (!processedPhone || !orderId || !rowIndex) {
      console.warn(`⚠️ Missing required data for order ${orderId}: phone=${processedPhone}, rowIndex=${rowIndex}`);
      return;
    }

    // Get enabled status settings
    const statusSettings = await ConfigService.getStatusSettings();
    const enabledStatuses = statusSettings?.enabledStatuses || {
      newOrder: true,
      noAnswer: true,
      shipped: true,
      rejectedOffer: true,
      reminder: true
    };

    console.log(`📋 Handling Egyptian order status change for ${orderId}: "${orderStatus}"`);
    console.log(`🎯 Customer: ${name}, Phone: ${processedPhone}, Row: ${rowIndex}`);

    // Normalize status for comparison
    const status = (orderStatus || '').trim();

    switch (status) {
      // New Order Cases
      case this.EGYPTIAN_ORDER_STATUSES.NEW:
      case this.EGYPTIAN_ORDER_STATUSES.NEW_2:
      case this.EGYPTIAN_ORDER_STATUSES.NEW_3:
      case this.EGYPTIAN_ORDER_STATUSES.NEW_4:
      case this.EGYPTIAN_ORDER_STATUSES.UNDEFINED:
        if (enabledStatuses.newOrder) {
        console.log(`📋 ➤ New Order detected: "${status}" → Sending newOrder message`);
        await this.handleNewOrder(row, templates, reminderDelayHours, 'جديد');
        } else {
          console.log(`🚫 New Order messages are disabled for status: "${status}"`);
        }
        break;
        
      // No Answer Case
      case this.EGYPTIAN_ORDER_STATUSES.NO_ANSWER_1:
      case this.EGYPTIAN_ORDER_STATUSES.NO_ANSWER_2:
      case this.EGYPTIAN_ORDER_STATUSES.NO_ANSWER_3:
      case this.EGYPTIAN_ORDER_STATUSES.NO_ANSWER_4:
        if (enabledStatuses.noAnswer) {
        console.log(`📞 ➤ No Answer detected: "${status}" → Sending noAnswer message`);
        await this.handleNoAnswer(row, templates, reminderDelayHours);
        } else {
          console.log(`🚫 No Answer messages are disabled for status: "${status}"`);
        }
        break;
        
      // Refused Delivery Cases (The Smart Rejected Offer)
      case this.EGYPTIAN_ORDER_STATUSES.REJECTED_1:
      case this.EGYPTIAN_ORDER_STATUSES.REJECTED_2:
      case this.EGYPTIAN_ORDER_STATUSES.REJECTED_3:
      case this.EGYPTIAN_ORDER_STATUSES.REJECTED_4:
      case this.EGYPTIAN_ORDER_STATUSES.REJECTED_5:
        if (enabledStatuses.rejectedOffer) {
        console.log(`🚫 ➤ Rejected Order detected: "${status}" → Scheduling rejectedOffer message (24h delay)`);
        await this.handleRefusedDelivery(row, templates, rejectedOfferDelayHours);
        } else {
          console.log(`🚫 Rejected Offer messages are disabled for status: "${status}"`);
        }
        break;
        
      // Confirmed Case
      case this.EGYPTIAN_ORDER_STATUSES.CONFIRMED:
      case this.EGYPTIAN_ORDER_STATUSES.CONFIRMED_2:
      case this.EGYPTIAN_ORDER_STATUSES.CONFIRMED_3:
      case this.EGYPTIAN_ORDER_STATUSES.SHIPPED:
      case this.EGYPTIAN_ORDER_STATUSES.SHIPPED_2:
        if (enabledStatuses.shipped) {
        console.log(`📦 ➤ Shipped/Confirmed detected: "${status}" → Sending shipped message`);
        await this.handleShipped(row, templates);
        } else {
          console.log(`🚫 Shipped messages are disabled for status: "${status}"`);
        }
        break;
        
      // Empty status case (treated as new order)
      case this.EGYPTIAN_ORDER_STATUSES.EMPTY:
        if (enabledStatuses.newOrder) {
        console.log(`📋 ➤ Empty Status detected (treated as new order) → Sending newOrder message`);
        await this.handleNewOrder(row, templates, reminderDelayHours, 'جديد');
        } else {
          console.log(`🚫 New Order messages are disabled for empty status`);
        }
        break;
        
      default:
        console.log(`❓ Unknown status: "${status}" for order ${orderId} - no action taken`);
        break;
    }
  }

  /**
   * Enhanced Duplicate Prevention System
   * Comprehensive check for all message types with detailed logging
   */
  private static checkAndPreventDuplicate(
    orderId: string, 
    messageType: 'newOrder' | 'noAnswer' | 'shipped' | 'rejectedOffer' | 'reminder',
    customerName: string,
    phone?: string | null
  ): { shouldSend: boolean; reason: string; stats: any; promise: Promise<boolean> } {
    const checkPromise = DuplicateGuardService.shouldSend(orderId, messageType as any, phone, customerName);
    return {
      shouldSend: true,
      reason: 'pending persistent check',
      stats: {},
      promise: checkPromise,
    };
  }

  /**
   * Mark message as sent with enhanced tracking
   */
  private static async markMessageAsSent(
    orderId: string, 
    messageType: 'newOrder' | 'noAnswer' | 'shipped' | 'rejectedOffer' | 'reminder',
    customerName: string,
    phone?: string | null
  ): Promise<void> {
    await DuplicateGuardService.markSent(orderId, messageType as any, phone, customerName);
    console.log(`✅ تم تسجيل إرسال رسالة ${messageType} للعميل ${customerName} (طلب ${orderId}) بشكل دائم`);
  }

  private static async handleNewOrder(row: SheetRow, templates: MessageTemplates, reminderDelayHours: number, statusType: string): Promise<void> {
    const { orderId, processedPhone, name, rowIndex } = row;
    if (!processedPhone || !orderId || !rowIndex) return;

    const duplicateCheck = this.checkAndPreventDuplicate(orderId, 'newOrder', name, processedPhone);
    const allowed = await duplicateCheck.promise;
    if (!allowed) {
      console.log(`🚫 Duplicate prevented (persistent): newOrder for ${orderId}`);
      return;
    }

    const newOrderMessage = this.replaceMessageVariables(templates.newOrder, row);
    const messageJob: MessageJob = { phoneNumber: processedPhone, message: newOrderMessage, orderId, rowIndex, messageType: 'newOrder' as any };
    await QueueService.addMessageJob(messageJob);
    await this.markMessageAsSent(orderId, 'newOrder', name, processedPhone);

    const statusSettings = await ConfigService.getStatusSettings();
    if (statusSettings?.enabledStatuses?.reminder) {
      const reminderJob: ReminderJob = { orderId, rowIndex, phoneNumber: processedPhone, customerName: name, orderStatus: statusType };
      await QueueService.addReminderJob(reminderJob, reminderDelayHours);
    }
  }

  private static async handleNoAnswer(row: SheetRow, templates: MessageTemplates, reminderDelayHours: number): Promise<void> {
    const { orderId, processedPhone, name, rowIndex } = row;
    if (!processedPhone || !orderId || !rowIndex) return;

    const allowed = await DuplicateGuardService.shouldSend(orderId, 'noAnswer', processedPhone, name);
    if (!allowed) { console.log(`🚫 Duplicate prevented (persistent): noAnswer for ${orderId}`); return; }

    const msg = this.replaceMessageVariables(templates.noAnswer, row);
    const messageJob: MessageJob = { phoneNumber: processedPhone, message: msg, orderId, rowIndex, messageType: 'noAnswer' } as any;
    await QueueService.addMessageJob(messageJob);
    await this.markMessageAsSent(orderId, 'noAnswer', name, processedPhone);
  }

  private static async handleShipped(row: SheetRow, templates: MessageTemplates): Promise<void> {
    const { orderId, processedPhone, name, rowIndex } = row;
    if (!processedPhone || !orderId || !rowIndex) return;

    const allowed = await DuplicateGuardService.shouldSend(orderId, 'shipped', processedPhone, name);
    if (!allowed) { console.log(`🚫 Duplicate prevented (persistent): shipped for ${orderId}`); return; }

    const msg = this.replaceMessageVariables(templates.shipped, row);
    const messageJob: MessageJob = { phoneNumber: processedPhone, message: msg, orderId, rowIndex, messageType: 'shipped' } as any;
    await QueueService.addMessageJob(messageJob);
    await this.markMessageAsSent(orderId, 'shipped', name, processedPhone);
  }

  private static async handleRefusedDelivery(row: SheetRow, templates: MessageTemplates, rejectedOfferDelayHours: number): Promise<void> {
    const { orderId, processedPhone, name, rowIndex } = row;
    if (!processedPhone || !orderId || !rowIndex) return;

    const allowed = await DuplicateGuardService.shouldSend(orderId, 'rejectedOffer', processedPhone, name);
    if (!allowed) { console.log(`🚫 Duplicate prevented (persistent): rejectedOffer for ${orderId}`); return; }

    const msg = this.replaceMessageVariables(templates.rejectedOffer, row);
    const messageJob: MessageJob = { phoneNumber: processedPhone, message: msg, orderId, rowIndex, messageType: 'rejectedOffer' } as any;
    await QueueService.addMessageJob(messageJob);
    await this.markMessageAsSent(orderId, 'rejectedOffer', name, processedPhone);
  }

  private static async checkReminderConditions(
    row: SheetRow,
    previousStatusData: { status: string, timestamp: number },
    templates: MessageTemplates,
    reminderDelayHours: number
  ): Promise<void> {
    const { orderId, processedPhone, name, rowIndex } = row;
    if (!processedPhone || !orderId || !rowIndex) return;

    const timeSinceLastStatus = Date.now() - previousStatusData.timestamp;
    const reminderThreshold = reminderDelayHours * 60 * 60 * 1000;

    if (timeSinceLastStatus >= reminderThreshold && this.shouldSendReminderForStatus(row.orderStatus)) {
      const allowed = await DuplicateGuardService.shouldSend(orderId, 'reminder', processedPhone, name);
      if (!allowed) { console.log(`🚫 Duplicate prevented (persistent): reminder for ${orderId}`); return; }

      const msg = this.replaceMessageVariables(templates.reminder || templates.newOrder, row);
      const messageJob: MessageJob = { phoneNumber: processedPhone, message: msg, orderId, rowIndex, messageType: 'reminder' } as any;
      await QueueService.addMessageJob(messageJob);
      await this.markMessageAsSent(orderId, 'reminder', name, processedPhone);
    }
  }

  private static shouldSendReminderForStatus(orderStatus: string): boolean {
    const status = (orderStatus || '').trim();
    
    // Send reminders for new orders and no-answer cases
    return status === this.EGYPTIAN_ORDER_STATUSES.NEW ||
           status === this.EGYPTIAN_ORDER_STATUSES.NEW_2 ||
           status === this.EGYPTIAN_ORDER_STATUSES.NEW_3 ||
           status === this.EGYPTIAN_ORDER_STATUSES.NEW_4 ||
           status === this.EGYPTIAN_ORDER_STATUSES.NO_ANSWER_1 ||
           status === this.EGYPTIAN_ORDER_STATUSES.NO_ANSWER_2 ||
           status === this.EGYPTIAN_ORDER_STATUSES.NO_ANSWER_3 ||
           status === this.EGYPTIAN_ORDER_STATUSES.NO_ANSWER_4 ||
           status === this.EGYPTIAN_ORDER_STATUSES.EMPTY ||
           status === this.EGYPTIAN_ORDER_STATUSES.UNDEFINED;
  }

  private static replaceMessageVariables(template: string, row: SheetRow): string {
    // Validate input parameters
    if (!template || typeof template !== 'string') {
      console.error('❌ Invalid template provided to replaceMessageVariables:', template);
      return 'رسالة افتراضية: مرحباً {name}، شكراً لطلبك رقم {orderId}';
    }
    
    if (!row) {
      console.error('❌ Invalid row data provided to replaceMessageVariables');
      return template;
    }
    
    try {
      console.log(`🔄 Replacing message variables for order ${row.orderId}:`);
      console.log(`   - Name: "${row.name}"`);
      console.log(`   - ProductName: "${row.productName}"`);
      console.log(`   - Template: "${template.substring(0, 100)}..."`);
      
      const result = template
        .replace(/\{name\}/g, row.name || 'عميل عزيز')
        .replace(/\{product\}/g, row.productName || 'المنتج')
        .replace(/\{productName\}/g, row.productName || 'المنتج')
        .replace(/\{price\}/g, row.totalPrice?.toString() || 'السعر')
        .replace(/\{orderId\}/g, row.orderId || 'رقم الطلب')
        .replace(/\{phone\}/g, row.processedPhone || row.phone || 'رقم الهاتف')
        .replace(/\{whatsappNumber\}/g, row.whatsappNumber || row.processedPhone || row.phone || 'رقم الواتساب')
        .replace(/\{address\}/g, row.address || 'العنوان')
        .replace(/\{city\}/g, row.governorate || 'المدينة')
        .replace(/\{governorate\}/g, row.governorate || 'المحافظة')
        .replace(/\{orderStatus\}/g, row.orderStatus || 'حالة الطلب')
        .replace(/\{notes\}/g, row.notes || '')
        .replace(/\{orderDate\}/g, row.orderDate || 'تاريخ الطلب')
        .replace(/\{deliveryDate\}/g, row.orderDate || 'تاريخ التسليم')
        .replace(/\{trackingNumber\}/g, row.orderId || 'رقم التتبع')
        .replace(/\{quantity\}/g, row.quantity || '1')
        .replace(/\{total\}/g, row.totalPrice?.toString() || 'الإجمالي');
      
      console.log(`✅ Message after replacement: "${result.substring(0, 150)}..."`);
      return result;
    } catch (error) {
      console.error('❌ Error in replaceMessageVariables:', error);
      console.error('Template:', template);
      console.error('Row data:', JSON.stringify(row, null, 2));
      return `خطأ في معالجة الرسالة للعميل ${row.name || 'غير محدد'}`;
    }
  }

  private static logSupportedStatuses(): void {
    console.log('📋 Supported Egyptian Order Statuses:');
    console.log('   New Orders:', Object.values(this.EGYPTIAN_ORDER_STATUSES).slice(0, 6));
    console.log('   No Answer:', Object.values(this.EGYPTIAN_ORDER_STATUSES).slice(6, 10));
    console.log('   Confirmed/Shipped:', Object.values(this.EGYPTIAN_ORDER_STATUSES).slice(10, 15));
    console.log('   Rejected:', Object.values(this.EGYPTIAN_ORDER_STATUSES).slice(15));
  }

  private static initializeCacheCleanup(): void {
    // Clean up old cache entries every hour
    setInterval(() => {
      const now = Date.now();
      let cleanedCount = 0;
      
      for (const [phone, data] of this.phoneValidationCache.entries()) {
        if (now - data.lastChecked > this.PHONE_CACHE_EXPIRATION) {
          this.phoneValidationCache.delete(phone);
          cleanedCount++;
        }
      }
      
      if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} expired phone validation cache entries`);
      }
    }, 60 * 60 * 1000); // 1 hour
  }

  private static async preWarmPhoneCache(): Promise<void> {
    try {
      // Get recent sheet data to pre-warm cache
      const sheetData = await GoogleSheetsService.getSheetData();
      const uniquePhones = new Set<string>();
      
      // Extract unique phone numbers
      for (const row of sheetData.slice(0, 100)) { // Limit to first 100 orders
        if (row.phone) uniquePhones.add(row.phone);
        if (row.whatsappNumber) uniquePhones.add(row.whatsappNumber);
      }
      
      console.log(`🔥 Pre-warming cache with ${uniquePhones.size} unique phone numbers...`);
      
      // Pre-process phone numbers
      let processedCount = 0;
      for (const phone of uniquePhones) {
        const phoneProcessing = PhoneProcessor.processTwoNumbers(phone, '');
        if (phoneProcessing.isValid) {
          const egyptianValidation = PhoneProcessor.validateEgyptianNumber(phoneProcessing.preferredNumber);
          if (egyptianValidation.isValid) {
            // Add to cache as valid (without WhatsApp validation to avoid API calls)
            this.phoneValidationCache.set(egyptianValidation.finalFormat, {
              isValid: true,
              isRegistered: true, // Assume true for pre-warming
              processedPhone: egyptianValidation.finalFormat,
              lastChecked: Date.now(),
              reason: 'Pre-warmed cache entry'
            });
            processedCount++;
          }
        }
      }
      
      console.log(`✅ Pre-warmed ${processedCount} phone numbers in cache`);
    } catch (error) {
      console.warn('⚠️ Failed to pre-warm phone cache:', error);
    }
  }

  /**
   * الحصول على إحصائيات مفصلة للمحرك المصري
   */
  static async getDetailedStats(): Promise<{
    engine: { isRunning: boolean; lastCheck: string; nextCheck: string };
    processing: { totalOrders: number; validOrders: number; invalidOrders: number; egyptianNumbers: number };
    phoneNumbers: { valid: number; invalid: number; processed: number; whatsappRegistered: number };
    orderStatuses: Record<string, number>;
    egyptianStats: {
      supportedStatuses: string[];
      totalProcessed: number;
      pendingOffers: number;
    };
  }> {
    try {
      // Try to get sheet data
      let sheetData: any[] = [];
      let stats: any = {
        validPhoneNumbers: 0,
        invalidPhoneNumbers: 0,
        totalOrders: 0
      };

      try {
        sheetData = await GoogleSheetsService.getSheetData();
        stats = await GoogleSheetsService.getSheetStats();
      } catch (error) {
        console.log('Google Sheets not configured or inaccessible, using empty stats');
        // Return empty stats when Google Sheets is not configured
        sheetData = [];
        stats = {
          validPhoneNumbers: 0,
          invalidPhoneNumbers: 0,
          totalOrders: 0
        };
      }
      
      const orderStatuses: Record<string, number> = {};
      let egyptianNumbers = 0;
      let whatsappRegistered = 0;

      // Count Egyptian numbers and order statuses only if we have data
      if (sheetData.length > 0) {
        for (const row of sheetData) {
          const status = row.orderStatus || 'غير محدد';
          orderStatuses[status] = (orderStatuses[status] || 0) + 1;

          if (row.processedPhone) {
            const analysis = PhoneProcessor.analyzePhoneNumber(row.processedPhone);
            if (analysis.isEgyptian) {
              egyptianNumbers++;
            }

            // Check WhatsApp registration (simplified for stats)
            const whatsapp = WhatsAppService.getInstance();
            if (whatsapp.getStatus().isConnected) {
              try {
                const validation = await whatsapp.validatePhoneNumber(row.processedPhone);
                if (validation.isRegistered) {
                  whatsappRegistered++;
                }
              } catch (error) {
                // Skip WhatsApp validation errors
                console.log(`WhatsApp validation failed for ${row.processedPhone}`);
              }
            }
          }
        }
      } else {
        // Add default status if no data
        orderStatuses['لا توجد بيانات'] = 0;
      }

      return {
        engine: {
          isRunning: this.isRunning,
          lastCheck: new Date().toISOString(),
          nextCheck: new Date(Date.now() + 30000).toISOString(),
        },
        processing: {
          totalOrders: sheetData.length,
          validOrders: sheetData.filter(row => row.validPhone && row.name && row.orderId).length,
          invalidOrders: sheetData.filter(row => !row.validPhone || !row.name || !row.orderId).length,
          egyptianNumbers,
        },
        phoneNumbers: {
          valid: stats.validPhoneNumbers || 0,
          invalid: stats.invalidPhoneNumbers || 0,
          processed: sheetData.filter(row => row.processedPhone).length,
          whatsappRegistered,
        },
        orderStatuses,
        egyptianStats: {
          supportedStatuses: Object.values(this.EGYPTIAN_ORDER_STATUSES),
          totalProcessed: this.processedOrders.size,
          pendingOffers: Object.values(orderStatuses).reduce((sum, count) => 
            sum + (orderStatuses['مرفوض'] || 0), 0)
        }
      };
    } catch (error) {
      console.error('Error getting detailed stats:', error);
      // Return safe default stats instead of throwing
      return {
        engine: {
          isRunning: this.isRunning,
          lastCheck: new Date().toISOString(),
          nextCheck: new Date(Date.now() + 30000).toISOString(),
        },
        processing: {
          totalOrders: 0,
          validOrders: 0,
          invalidOrders: 0,
          egyptianNumbers: 0,
        },
        phoneNumbers: {
          valid: 0,
          invalid: 0,
          processed: 0,
          whatsappRegistered: 0,
        },
        orderStatuses: { 'خطأ في التكوين': 0 },
        egyptianStats: {
          supportedStatuses: Object.values(this.EGYPTIAN_ORDER_STATUSES),
          totalProcessed: 0,
          pendingOffers: 0
        }
      };
    }
  }

  /**
   * تحديث الحالات الفارغة تلقائياً لمنع الرسائل المتكررة
   */
  static async detectAndUpdateEmptyStatuses(): Promise<{
    success: boolean;
    emptyOrdersFound: number;
    updatedOrders: number;
    details: Array<{ rowIndex: number; customerName: string; oldStatus: string; newStatus: string }>;
    error?: string;
  }> {
    try {
      console.log('🔍 Detecting orders with empty status for automatic update...');

      // البحث عن الطلبات ذات الحالة الفارغة
      const emptyOrdersResult = await GoogleSheetsService.findEmptyStatusOrders();
      
      if (!emptyOrdersResult.success) {
        return {
          success: false,
          emptyOrdersFound: 0,
          updatedOrders: 0,
          details: [],
          error: emptyOrdersResult.error
        };
      }

      const emptyOrders = emptyOrdersResult.emptyOrders.filter(order => order.validPhone);
      console.log(`📋 Found ${emptyOrders.length} orders with empty status and valid phones`);

      if (emptyOrders.length === 0) {
        return {
          success: true,
          emptyOrdersFound: 0,
          updatedOrders: 0,
          details: []
        };
      }

      // تحديث الحالات الفارغة إلى "جديد"
      const updateResult = await GoogleSheetsService.updateEmptyStatusesToNew();
      
      if (updateResult.success) {
        // تتبع الطلبات المحدثة لمنع الرسائل المتكررة
        for (const detail of updateResult.details) {
          const orderId = `row_${detail.rowIndex}_${detail.customerName.substring(0, 3)}`;
          this.updatedFromEmptyStatus.add(orderId);
          
          // تسجيل وقت التحديث
          this.orderStatusHistory.set(`${orderId}_empty_update`, {
            status: 'updated_from_empty',
            timestamp: Date.now()
          });
          
          console.log(`📝 Marked order ${orderId} as updated from empty status`);
        }

        console.log(`✅ Successfully updated ${updateResult.updatedRows} empty statuses and marked them for tracking`);
      }

      return {
        success: updateResult.success,
        emptyOrdersFound: emptyOrders.length,
        updatedOrders: updateResult.updatedRows,
        details: updateResult.details,
        error: updateResult.error
      };

    } catch (error) {
      console.error('❌ Error in detectAndUpdateEmptyStatuses:', error);
      return {
        success: false,
        emptyOrdersFound: 0,
        updatedOrders: 0,
        details: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * تشغيل المعالجة الذكية للحالات الفارغة قبل المعالجة العادية
   */
  static async smartProcessWithEmptyStatusHandling(): Promise<{
    emptyStatusResult: any;
    processingResult: any;
  }> {
    try {
      console.log('🧠 Starting smart processing with empty status handling...');

      // المرحلة 1: كشف وتحديث الحالات الفارغة
      const emptyStatusResult = await this.detectAndUpdateEmptyStatuses();
      
      if (emptyStatusResult.success && emptyStatusResult.updatedOrders > 0) {
        console.log(`📝 Updated ${emptyStatusResult.updatedOrders} empty statuses. Waiting 10 seconds before processing...`);
        
        // انتظار قصير للسماح بتحديث البيانات في Google Sheets
        await new Promise(resolve => setTimeout(resolve, 10000));
      }

      // المرحلة 2: المعالجة العادية المحسنة
      console.log('🔄 Starting OPTIMIZED order processing...');
      await this.processSheetDataOptimized();

      return {
        emptyStatusResult,
        processingResult: { success: true, message: 'تمت المعالجة بنجاح' }
      };

    } catch (error) {
      console.error('❌ Error in smart processing:', error);
      return {
        emptyStatusResult: { success: false, error: 'فشل في المعالجة الذكية' },
        processingResult: { success: false, error: error }
      };
    }
  }

  /**
   * إعادة تعيين تتبع الطلبات المحدثة من الحالة الفارغة
   */
  static resetEmptyStatusTracking(): void {
    console.log('🧹 Resetting empty status tracking...');
    this.updatedFromEmptyStatus.clear();
    
    // إزالة تاريخ التحديثات القديمة (أكثر من 24 ساعة)
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    for (const [key, value] of this.orderStatusHistory.entries()) {
      if (key.includes('_empty_update') && value.timestamp < oneDayAgo) {
        this.orderStatusHistory.delete(key);
      }
    }
    
    console.log('✅ Empty status tracking reset completed');
  }

  /**
   * الحصول على إحصائيات تحديث الحالات الفارغة
   */
  static getEmptyStatusStats(): {
    trackedUpdatedOrders: number;
    recentUpdates: Array<{ orderId: string; timestamp: number; timeSinceUpdate: number }>;
  } {
    const recentUpdates = [];
    
    for (const [key, value] of this.orderStatusHistory.entries()) {
      if (key.includes('_empty_update')) {
        const orderId = key.replace('_empty_update', '');
        const timeSinceUpdate = (Date.now() - value.timestamp) / 1000 / 60; // minutes
        
        recentUpdates.push({
          orderId,
          timestamp: value.timestamp,
          timeSinceUpdate: Math.round(timeSinceUpdate)
        });
      }
    }

    return {
      trackedUpdatedOrders: this.updatedFromEmptyStatus.size,
      recentUpdates: recentUpdates.sort((a, b) => b.timestamp - a.timestamp)
    };
  }

  // Get performance statistics
  static getPerformanceStats(): any {
    return {
      ...this.performanceStats,
      cacheSize: this.phoneValidationCache.size,
      cacheHitRatio: this.performanceStats.cacheHits / (this.performanceStats.cacheHits + this.performanceStats.cacheMisses),
      duplicatePreventionStats: this.duplicatePreventionStats
    };
  }

  // Clear caches (for testing/debugging)
  static clearCaches(): void {
    this.phoneValidationCache.clear();
    this.duplicateAttempts.clear();
    this.sentMessages.clear();
    this.performanceStats.cacheHits = 0;
    this.performanceStats.cacheMisses = 0;
    this.performanceStats.whatsappApiCalls = 0;
    console.log('✅ All caches cleared');
  }

  // Public method for testing message variable replacement
  static testMessageReplacement(template: string, row: any): string {
    return this.replaceMessageVariables(template, row);
  }
} 