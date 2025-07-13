import { GoogleSheetsService } from './google-sheets';
import { ConfigService } from './config';
import { QueueService, MessageJob, ReminderJob } from './queue';
import { WhatsAppService } from './whatsapp';
import { PhoneProcessor } from './phone-processor';
import type { SheetRow, MessageTemplates } from '../types/config';

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

  // Track orders that were updated from empty status to prevent duplicates
  private static updatedFromEmptyStatus = new Set<string>();

  // Enhanced tracking for empty status orders to prevent duplicate messages
  private static emptyStatusOrdersTracking = new Map<string, {
    firstSeen: number;
    lastProcessed: number;
    messagesSent: Set<string>;
    processCount: number;
  }>();

  // Enhanced duplicate prevention tracking
  private static duplicateAttempts = new Map<string, {
    orderId: string;
    messageType: string;
    attemptCount: number;
    lastAttempt: number;
    preventedDuplicates: number;
  }>();

  // Log duplicate prevention statistics
  private static duplicatePreventionStats = {
    totalDuplicatesPrevented: 0,
    duplicatesPreventedByType: {
      newOrder: 0,
      noAnswer: 0,
      shipped: 0,
      rejectedOffer: 0,
      reminder: 0
    },
    lastResetTime: Date.now()
  };

  // ⚡ PERFORMANCE OPTIMIZATION: Phone number validation cache
  private static phoneValidationCache = new Map<string, {
    isValid: boolean;
    isRegistered: boolean;
    processedPhone: string;
    lastChecked: number;
    reason?: string;
  }>();

  // Cache expiration time (24 hours)
  private static PHONE_CACHE_EXPIRATION = 24 * 60 * 60 * 1000;

  // Performance monitoring
  private static performanceStats = {
    lastProcessingTime: 0,
    avgProcessingTime: 0,
    totalProcessingCycles: 0,
    cacheHits: 0,
    cacheMisses: 0,
    whatsappApiCalls: 0,
    processingStartTime: 0
  };

  static async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Automation engine is already running');
      return;
    }

    try {
      console.log('🚀 Starting OPTIMIZED Egyptian WhatsApp automation engine...');
      
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
        const testData = await GoogleSheetsService.getSheetData();
        console.log(`✅ Data access successful - found ${testData.length} orders`);
        if (testData.length === 0) {
          console.log('⚠️ No orders found - system will wait for data');
        }
      } catch (dataError) {
        console.error('❌ Data access test failed:', dataError);
        throw new Error(`Cannot start automation: Unable to access Google Sheets data - ${dataError instanceof Error ? dataError.message : 'Unknown error'}`);
      }
      
      // STEP 4: Check WhatsApp (Warning only, not blocking)
      console.log('📱 Step 4: Checking WhatsApp connection...');
      try {
        const whatsapp = WhatsAppService.getInstance();
        const status = whatsapp.getStatus();
        if (status.isConnected) {
          console.log('✅ WhatsApp is connected and ready');
        } else {
          console.log('⚠️ WhatsApp not connected - messages will be queued until connection is established');
        }
      } catch (whatsappError) {
        console.warn('⚠️ WhatsApp status check failed, but continuing:', whatsappError);
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
      console.log('🚀 Step 6: Starting processing loop...');
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
      
      console.log('✅ OPTIMIZED Egyptian automation engine started successfully');
      console.log('🎯 System is now ready to process orders automatically');
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

  private static async preWarmPhoneCache(): Promise<void> {
    try {
      console.log('🔥 Pre-warming phone validation cache...');
      
      // Get all orders quickly first
      const sheetData = await GoogleSheetsService.getSheetData();
      
      if (!sheetData || sheetData.length === 0) {
        console.log('No data to pre-warm cache');
        return;
      }

      const whatsapp = WhatsAppService.getInstance();
      const isConnected = whatsapp.getStatus().isConnected;
      
      if (!isConnected) {
        console.log('⚠️ WhatsApp not connected, skipping cache pre-warming');
        return;
      }

      // Get unique phone numbers
      const uniquePhones = new Set<string>();
      
      sheetData.forEach(row => {
        if (row.phone) {
          const processed = PhoneProcessor.formatForWhatsApp(row.phone);
          if (processed) uniquePhones.add(processed);
        }
        if (row.whatsappNumber) {
          const processed = PhoneProcessor.formatForWhatsApp(row.whatsappNumber);
          if (processed) uniquePhones.add(processed);
        }
      });

      console.log(`📱 Pre-warming cache for ${uniquePhones.size} unique phone numbers...`);
      
      // Validate in batches to avoid overwhelming WhatsApp
      const phoneArray = Array.from(uniquePhones);
      const batchSize = 10;
      
      for (let i = 0; i < phoneArray.length; i += batchSize) {
        const batch = phoneArray.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (phone) => {
          try {
            const result = await whatsapp.validatePhoneNumber(phone);
            this.phoneValidationCache.set(phone, {
              isValid: result.isValid,
              isRegistered: result.isRegistered,
              processedPhone: result.processedNumber,
              lastChecked: Date.now(),
              reason: result.error
            });
          } catch (error) {
            console.warn(`Failed to validate ${phone}:`, error);
          }
        }));
        
        // Small delay between batches
        if (i + batchSize < phoneArray.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      console.log(`✅ Cache pre-warmed with ${this.phoneValidationCache.size} validated numbers`);
    } catch (error) {
      console.error('Error pre-warming cache:', error);
    }
  }

  private static initializeCacheCleanup(): void {
    // Clean cache every hour
    setInterval(() => {
      this.cleanupExpiredCache();
    }, 60 * 60 * 1000);
  }

  private static cleanupExpiredCache(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [phone, data] of this.phoneValidationCache.entries()) {
      if (now - data.lastChecked > this.PHONE_CACHE_EXPIRATION) {
        this.phoneValidationCache.delete(phone);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 Cleaned ${cleaned} expired cache entries`);
    }
  }

  private static logSupportedStatuses(): void {
    console.log('📋 Supported Order Statuses:');
    console.log('  🆕 New Order: "جديد", "طلب جديد", "قيد المراجعة", "قيد المراجعه", "غير محدد"');
    console.log('  🔳 Empty Status: "" (حالة فارغة) → يُعامل كطلب جديد تلقائياً');
    console.log('  📞 No Answer: "لم يتم الرد", "لم يرد", "لا يرد", "عدم الرد"');
    console.log('  ✅ Confirmed: "تم التأكيد", "تم التاكيد", "مؤكد"');
    console.log('  🚚 Shipped: "تم الشحن", "قيد الشحن"');
    console.log('  🚫 Rejected: "تم الرفض", "مرفوض", "رفض الاستلام", "رفض الأستلام", "لم يتم الاستلام"');
    console.log('  🎉 Other: "تم التوصيل", "ملغي", etc.');
    console.log('');
    console.log('💡 ملاحظة مهمة: الحالات الفارغة تُعامل تلقائياً كطلبات جديدة ولا تحتاج تدخل يدوي!');
  }

  static async stop(): Promise<void> {
    console.log('Stopping automation engine...');
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    await QueueService.cleanup();
    console.log('Automation engine stopped');
  }

  static getStatus(): { isRunning: boolean; lastCheck?: string; nextCheck?: string } {
    return {
      isRunning: this.isRunning,
      lastCheck: this.isRunning ? new Date().toISOString() : undefined,
      nextCheck: this.isRunning ? new Date(Date.now() + 30000).toISOString() : undefined,
    };
  }

  private static async startProcessingLoop(): Promise<void> {
    const timingConfig = await ConfigService.getTimingConfig();
    const checkInterval = (timingConfig.checkIntervalSeconds || 30) * 1000;
    
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
        console.log('🔄 Egyptian automation engine processing cycle (OPTIMIZED)...');
        
        // Clean up old empty status tracking periodically
        this.cleanupOldEmptyStatusTracking();
        
        // Pre-processing checks
        console.log('🔍 Pre-processing system checks...');
        
        // Check Google Sheets availability
        try {
          await GoogleSheetsService.getSheetData();
        } catch (sheetsError) {
          console.error('❌ Google Sheets unavailable during processing:', sheetsError);
          throw new Error(`Google Sheets access failed: ${sheetsError instanceof Error ? sheetsError.message : 'Unknown error'}`);
        }
        
        // Check WhatsApp status (warning only)
        try {
          const whatsapp = WhatsAppService.getInstance();
          const status = whatsapp.getStatus();
          if (!status.isConnected) {
            console.log('⚠️ WhatsApp disconnected - messages will be queued');
          }
        } catch (whatsappError) {
          console.warn('⚠️ WhatsApp status check failed during processing:', whatsappError);
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
    console.log('🚀 Starting first processing cycle in 5 seconds...');
    this.intervalId = setTimeout(() => {
      processLoop().catch(error => {
        console.error('❌ Critical error in initial processing loop:', error);
        console.log('🛑 Stopping automation engine due to critical startup error');
        this.isRunning = false;
        throw error;
      });
    }, 5000); // 5 second delay for initial startup
  }

  private static async processSheetDataOptimized(): Promise<void> {
    try {
      console.log('🔄 Processing Egyptian sheet data (OPTIMIZED)...');
      
      // Get sheet data
      const sheetData = await GoogleSheetsService.getSheetData();
      
      if (!sheetData || sheetData.length === 0) {
        console.log('No data found in sheet');
        return;
      }

      console.log(`📊 Found ${sheetData.length} orders to process`);

      // Get configuration
      const { reminderDelayHours, rejectedOfferDelayHours } = await ConfigService.getTimingConfig();
      const { templates } = await ConfigService.getMessageTemplates();

      let processedCount = 0;
      let skippedCount = 0;
      let invalidPhoneCount = 0;
      let whatsappValidationCount = 0;
      let newOrdersProcessed = 0;

      // Process in batches for better performance
      const batchSize = 20;
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
          const previousStatusData = this.orderStatusHistory.get(orderId);
          
          // 🔧 FIX: تحسين منطق اكتشاف التغييرات في الحالات
          const isNewOrder = !previousStatusData;
          const statusChanged = previousStatusData && previousStatusData.status !== currentStatus;
          
          console.log(`🔍 Order ${orderId}: Current="${currentStatus}" | Previous="${previousStatusData?.status || 'NONE'}" | New=${isNewOrder} | Changed=${statusChanged}`);
          
          // Update status history AFTER checking for changes
          this.orderStatusHistory.set(orderId, {
            status: currentStatus,
            timestamp: Date.now()
          });

          // 🔧 FIX: معالجة خاصة للطلبات ذات الحالة "جديد" - تأكد من معالجتها دائماً
          const cleanStatus = (currentStatus || '').trim();
          const isNewOrderStatus = cleanStatus === this.EGYPTIAN_ORDER_STATUSES.NEW ||
                                   cleanStatus === this.EGYPTIAN_ORDER_STATUSES.NEW_2 ||
                                   cleanStatus === this.EGYPTIAN_ORDER_STATUSES.NEW_3 ||
                                   cleanStatus === this.EGYPTIAN_ORDER_STATUSES.NEW_4 ||
                                   cleanStatus === this.EGYPTIAN_ORDER_STATUSES.UNDEFINED ||
                                   cleanStatus === '';

          // 🔧 FIX: إذا كانت الحالة "جديد" أو فارغة، تأكد من المعالجة
          if (isNewOrderStatus) {
            // Check when was the last time we processed this order for newOrder
            const lastNewOrderTime = this.sentMessages.get(`${orderId}_newOrder`)?.timestamp || 0;
            const hoursSinceLastNewOrder = (Date.now() - lastNewOrderTime) / (1000 * 60 * 60);
            
            // 🔧 FIX: تقليل الفترة الزمنية إلى 30 دقيقة لضمان الحساسية
            if (hoursSinceLastNewOrder > 0.5 || lastNewOrderTime === 0) {
              console.log(`🆕 Processing order ${orderId} with NEW ORDER status: "${cleanStatus}" (last processed: ${hoursSinceLastNewOrder.toFixed(1)}h ago)`);
              await this.handleEgyptianOrderStatusChange(row, templates, reminderDelayHours, rejectedOfferDelayHours);
              newOrdersProcessed++;
              processedCount++;
              continue;
            } else {
              console.log(`⏰ Skipping new order ${orderId} - processed recently (${hoursSinceLastNewOrder.toFixed(1)}h ago)`);
            }
          }

          // 🔧 FIX: معالجة محسنة لتغييرات الحالات
          if (isNewOrder || statusChanged) {
            console.log(`📝 Processing order ${orderId}: ${isNewOrder ? 'NEW ORDER' : 'STATUS CHANGED'} - "${previousStatusData?.status || 'NONE'}" → "${currentStatus}"`);
            
            // 🔧 FIX: إضافة فحص إضافي للتأكد من أن التغيير حقيقي
            if (statusChanged) {
              const timeSinceLastChange = previousStatusData ? (Date.now() - previousStatusData.timestamp) / (1000 * 60) : 0;
              console.log(`🔄 Status change detected for ${orderId}: Time since last change: ${timeSinceLastChange.toFixed(1)} minutes`);
              
              // 🔧 FIX: تسجيل تفاصيل التغيير للمراجعة
              console.log(`   📊 Change details: "${previousStatusData?.status}" → "${currentStatus}" (Customer: ${row.name})`);
            }
            
            await this.handleEgyptianOrderStatusChange(row, templates, reminderDelayHours, rejectedOfferDelayHours);
            processedCount++;
          } else if (previousStatusData) {
            // Check for reminder conditions
            await this.checkReminderConditions(row, previousStatusData, templates, reminderDelayHours);
          }
        }
      }

      console.log(`✅ OPTIMIZED Processing complete: ${processedCount} processed (${newOrdersProcessed} new orders), ${skippedCount} skipped (${invalidPhoneCount} invalid phones, ${whatsappValidationCount} not WhatsApp users), ${sheetData.length} total`);
    } catch (error) {
      console.error('Error processing sheet data:', error);
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
      console.log(`⚠️ WhatsApp not connected, assuming phone ${finalPhone} is valid`);
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

  /**
   * Stage 2: Business Logic Mapping (حسب الحالات المصرية)
   */
  private static async handleEgyptianOrderStatusChange(
    row: SheetRow, 
    templates: MessageTemplates, 
    reminderDelayHours: number, 
    rejectedOfferDelayHours: number
  ): Promise<void> {
    const { orderId, processedPhone, orderStatus, rowIndex, name } = row;
    
    if (!processedPhone || !orderId || !rowIndex) {
      console.log(`⚠️ Skipping order ${orderId}: missing required fields`);
      return;
    }

    // Get status settings
    const statusSettings = await ConfigService.getStatusSettings();
    const enabledStatuses = statusSettings?.enabledStatuses || {
      newOrder: true,
      noAnswer: true,
      shipped: true,
      rejectedOffer: true,
      reminder: true
    };

    // تنظيف الحالة من الفراغات
    const status = (orderStatus || '').trim();
    
    // 🔧 FIX: معالجة خاصة للحالة الفارغة مع منع التكرار المحسّن
    if (status === '') {
      // Create unique tracking key for empty status orders
      const emptyStatusKey = `${orderId}_${name}_${processedPhone}`;
      
      // Check if we've already processed this empty status order
      const emptyTracking = this.emptyStatusOrdersTracking.get(emptyStatusKey);
      
      if (emptyTracking) {
        // Check if we've already sent a newOrder message for this empty status
        if (emptyTracking.messagesSent.has('newOrder')) {
          const timeSinceFirst = Math.round((Date.now() - emptyTracking.firstSeen) / 1000 / 60);
          const timeSinceLast = Math.round((Date.now() - emptyTracking.lastProcessed) / 1000 / 60);
          
          console.log(`🚫 منع تكرار: طلب ذو حالة فارغة ${orderId} (${name}) - تم إرسال رسالة طلب جديد منذ ${timeSinceLast} دقيقة`);
          console.log(`   📊 إحصائيات: أول مشاهدة منذ ${timeSinceFirst} دقيقة، عدد المعالجات: ${emptyTracking.processCount + 1}`);
          
          // Update tracking
          emptyTracking.lastProcessed = Date.now();
          emptyTracking.processCount++;
          
          // Don't send duplicate message
          return;
        }
      } else {
        // First time seeing this empty status order
        this.emptyStatusOrdersTracking.set(emptyStatusKey, {
          firstSeen: Date.now(),
          lastProcessed: Date.now(),
          messagesSent: new Set<string>(),
          processCount: 1
        });
      }
      
      console.log(`🔳 ➤ Empty Status detected for order ${orderId} (${name}) → Treating as NEW ORDER`);
      
      if (enabledStatuses.newOrder) {
        // Process as new order and mark that we've sent this message
        await this.handleNewOrder(row, templates, reminderDelayHours, 'جديد (حالة فارغة)');
        
        // Mark that we've sent newOrder message for this empty status
        const tracking = this.emptyStatusOrdersTracking.get(emptyStatusKey);
        if (tracking) {
          tracking.messagesSent.add('newOrder');
        }
      } else {
        console.log(`🚫 New Order messages are disabled for empty status`);
      }
      return;
    }
    
    console.log(`🔍 Processing order ${orderId} with status: "${status}" for customer: ${name}`);

    switch (status) {
      // 🔧 FIX: New Order Cases - تحسين معالجة الطلبات الجديدة
      case this.EGYPTIAN_ORDER_STATUSES.NEW:
      case this.EGYPTIAN_ORDER_STATUSES.NEW_2:
      case this.EGYPTIAN_ORDER_STATUSES.NEW_3:
      case this.EGYPTIAN_ORDER_STATUSES.NEW_4:
      case this.EGYPTIAN_ORDER_STATUSES.UNDEFINED:
        console.log(`📋 ➤ New Order detected: "${status}" for ${name} (Order: ${orderId})`);
        if (enabledStatuses.newOrder) {
          console.log(`✅ New Order messages are ENABLED - proceeding with message send`);
          await this.handleNewOrder(row, templates, reminderDelayHours, status);
        } else {
          console.log(`🚫 New Order messages are DISABLED for status: "${status}"`);
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
        if (enabledStatuses.shipped) {
        console.log(`✅ ➤ Confirmed Order detected: "${status}" → Sending shipped message`);
        await this.handleConfirmedOrder(row, templates);
        } else {
          console.log(`🚫 Shipped messages are disabled for status: "${status}"`);
        }
        break;
        
      // Shipped Case
      case this.EGYPTIAN_ORDER_STATUSES.SHIPPED:
      case this.EGYPTIAN_ORDER_STATUSES.SHIPPED_2:
        if (enabledStatuses.shipped) {
        console.log(`🚚 ➤ Shipped Order detected: "${status}" → Sending shipped message`);
        await this.handleShippedOrder(row, templates);
        } else {
          console.log(`🚫 Shipped messages are disabled for status: "${status}"`);
        }
        break;

      // Delivered Case (Final State)
      case 'تم التوصيل':
      case 'تم التوصيل بنجاح':
      case 'delivered':
        console.log(`🎉 ➤ Delivered Order detected: "${status}" → Final state (no message)`);
        await this.handleDeliveredOrder(row, templates);
        break;

      // Cancelled Case
      case 'ملغي':
      case 'تم الإلغاء':
      case 'cancelled':
        console.log(`❌ ➤ Cancelled Order detected: "${status}" → Final state (no message)`);
        await this.handleCancelledOrder(row, templates);
        break;
        
      default:
        // 🔧 FIX: تحسين معالجة الحالات غير المعروفة - قد تكون طلبات جديدة
        console.log(`❓ ➤ Unknown status detected: "${status}" for ${name} (Order: ${orderId})`);
        
        // إذا كانت الحالة غير معروفة وتبدو كطلب جديد، تعامل معها كطلب جديد
        if (status && enabledStatuses.newOrder) {
          const lowerStatus = status.toLowerCase();
          // فحص إذا كانت الحالة تحتوي على كلمات مفتاحية للطلبات الجديدة
          if (lowerStatus.includes('جديد') || lowerStatus.includes('new') || 
              lowerStatus.includes('مراجع') || lowerStatus.includes('انتظار')) {
            console.log(`🔄 ➤ Treating unknown status "${status}" as NEW ORDER based on keywords`);
            await this.handleNewOrder(row, templates, reminderDelayHours, status);
          } else {
            console.log(`💡 إذا كانت هذه حالة جديدة، أضفها إلى الحالات المدعومة في النظام`);
          }
        } else {
          console.log(`💡 إذا كانت هذه حالة جديدة، أضفها إلى الحالات المدعومة في النظام`);
        }
        break;
    }
  }

  /**
   * 🔧 FIX: Enhanced Duplicate Prevention System
   * تحسين نظام منع التكرار لضمان عدم منع الطلبات الجديدة الصحيحة
   */
  private static checkAndPreventDuplicate(
    orderId: string, 
    messageType: 'newOrder' | 'noAnswer' | 'shipped' | 'rejectedOffer' | 'reminder',
    customerName: string
  ): { shouldSend: boolean; reason: string; stats: any } {
    const messageKey = messageType === 'reminder' ? `reminder_${orderId}` : `${orderId}_${messageType}`;

    // 🔧 FIX: تحسين فحص الرسائل المرسلة مسبقاً
    const alreadySent = messageType === 'reminder' 
      ? this.orderStatusHistory.has(messageKey)
      : this.sentMessages.has(messageKey);

    if (alreadySent) {
      // Get previous message info for better logging
      const previousMessage = messageType === 'reminder'
        ? this.orderStatusHistory.get(messageKey)
        : this.sentMessages.get(messageKey);
      
      const timeDiff = previousMessage 
        ? Math.round((Date.now() - previousMessage.timestamp) / 1000 / 60) // minutes
        : 0;

      // 🔧 FIX: تحسين منطق السماح بإعادة الإرسال حسب نوع الرسالة
      let allowResend = false;
      let minWaitTime = 0;
      
      switch (messageType) {
        case 'newOrder':
          // 🔧 FIX: للطلبات الجديدة، اسمح بإعادة الإرسال بعد 30 دقيقة
          minWaitTime = 30;
          allowResend = timeDiff >= minWaitTime;
          break;
        case 'noAnswer':
          // للحالات "لم يرد"، اسمح بإعادة الإرسال بعد ساعة
          minWaitTime = 60;
          allowResend = timeDiff >= minWaitTime;
          break;
        case 'shipped':
          // لرسائل الشحن، اسمح بإعادة الإرسال بعد 4 ساعات
          minWaitTime = 240;
          allowResend = timeDiff >= minWaitTime;
          break;
        case 'rejectedOffer':
          // للعروض المرفوضة، اسمح بإعادة الإرسال بعد 24 ساعة
          minWaitTime = 1440;
          allowResend = timeDiff >= minWaitTime;
          break;
        case 'reminder':
          // للتذكيرات، اسمح بإعادة الإرسال بعد 12 ساعة
          minWaitTime = 720;
          allowResend = timeDiff >= minWaitTime;
          break;
      }

      if (allowResend) {
        console.log(`🔄 Allowing resend of ${messageType} for ${customerName} (${orderId}) - ${timeDiff} minutes passed (min: ${minWaitTime})`);
        return {
          shouldSend: true,
          reason: `إعادة إرسال مسموحة بعد ${timeDiff} دقيقة`,
          stats: {
            timeSinceLastMessage: timeDiff,
            minWaitTime,
            totalDuplicatesPrevented: this.duplicatePreventionStats.totalDuplicatesPrevented,
            duplicatesForThisOrder: 0
          }
        };
      }

      // Update duplicate attempt tracking
      const duplicateKey = `${orderId}_${messageType}`;
      const existingAttempt = this.duplicateAttempts.get(duplicateKey);
      
      if (existingAttempt) {
        existingAttempt.attemptCount++;
        existingAttempt.preventedDuplicates++;
        existingAttempt.lastAttempt = Date.now();
      } else {
        this.duplicateAttempts.set(duplicateKey, {
          orderId,
          messageType,
          attemptCount: 2, // Original + this attempt
          lastAttempt: Date.now(),
          preventedDuplicates: 1
        });
      }

      // Update global statistics
      this.duplicatePreventionStats.totalDuplicatesPrevented++;
      this.duplicatePreventionStats.duplicatesPreventedByType[messageType]++;

      const reason = `🚫 منع تكرار: رسالة ${messageType} تم إرسالها منذ ${timeDiff} دقيقة للعميل ${customerName} (طلب ${orderId}) - الحد الأدنى: ${minWaitTime} دقيقة`;
      
      console.log(reason);

      return {
        shouldSend: false,
        reason,
        stats: {
          timeSinceLastMessage: timeDiff,
          minWaitTime,
          totalDuplicatesPrevented: this.duplicatePreventionStats.totalDuplicatesPrevented,
          duplicatesForThisOrder: this.duplicateAttempts.get(duplicateKey)?.preventedDuplicates || 1
        }
      };
    }

    // 🔧 FIX: رسالة جديدة - يمكن إرسالها
    console.log(`✅ رسالة جديدة: ${messageType} للعميل ${customerName} (طلب ${orderId}) - سيتم الإرسال`);
    
    return {
      shouldSend: true,
      reason: `رسالة ${messageType} جديدة يمكن إرسالها`,
      stats: {
        timeSinceLastMessage: 0,
        totalDuplicatesPrevented: this.duplicatePreventionStats.totalDuplicatesPrevented,
        duplicatesForThisOrder: 0
      }
    };
  }

  /**
   * Mark message as sent in tracking system
   */
  private static markMessageAsSent(
    orderId: string, 
    messageType: 'newOrder' | 'noAnswer' | 'shipped' | 'rejectedOffer' | 'reminder',
    customerName?: string
  ): void {
    const timestamp = Date.now();
    
    if (messageType === 'reminder') {
      this.orderStatusHistory.set(`reminder_${orderId}`, {
        status: 'reminder_sent',
        timestamp
      });
    } else {
      this.sentMessages.set(`${orderId}_${messageType}`, {
        messageType,
        timestamp
      });
    }

    console.log(`📝 تم تسجيل إرسال رسالة ${messageType} للطلب ${orderId}${customerName ? ` (${customerName})` : ''}`);
  }

  /**
   * Get comprehensive duplicate prevention statistics
   */
  static getDuplicatePreventionStats(): {
    totalPrevented: number;
    preventedByType: Record<string, number>;
    recentAttempts: Array<{ orderId: string; messageType: string; attemptCount: number; lastAttempt: string }>;
    efficiency: string;
  } {
    const recentAttempts = Array.from(this.duplicateAttempts.entries())
      .map(([key, data]) => ({
        orderId: data.orderId,
        messageType: data.messageType,
        attemptCount: data.attemptCount,
        lastAttempt: new Date(data.lastAttempt).toLocaleString('ar-EG')
      }))
      .sort((a, b) => b.attemptCount - a.attemptCount)
      .slice(0, 10); // أحدث 10 محاولات

    const totalAttempts = Array.from(this.duplicateAttempts.values())
      .reduce((sum, data) => sum + data.attemptCount, 0);
    
    const efficiency = totalAttempts > 0 
      ? Math.round((this.duplicatePreventionStats.totalDuplicatesPrevented / totalAttempts) * 100) + '%'
      : '100%';

    return {
      totalPrevented: this.duplicatePreventionStats.totalDuplicatesPrevented,
      preventedByType: { ...this.duplicatePreventionStats.duplicatesPreventedByType },
      recentAttempts,
      efficiency
    };
  }

  private static async handleNewOrder(row: SheetRow, templates: MessageTemplates, reminderDelayHours: number, statusType: string): Promise<void> {
    const { orderId, processedPhone, name, rowIndex } = row;
    
    if (!processedPhone || !orderId || !rowIndex) return;

    // Enhanced duplicate prevention check
    const duplicateCheck = this.checkAndPreventDuplicate(orderId, 'newOrder', name);
    
    if (!duplicateCheck.shouldSend) {
      console.log(duplicateCheck.reason);
          return;
    }

    console.log(`📋 Sending newOrder message to ${name} (${processedPhone}) for order ${orderId}`);
    console.log(`📝 Status Type: ${statusType}`);

    // Prepare and send new order message
    const newOrderMessage = this.replaceMessageVariables(templates.newOrder, row);

    const messageJob: MessageJob = {
      phoneNumber: processedPhone,
      message: newOrderMessage,
      orderId,
      rowIndex,
      messageType: 'newOrder' as any,
    };

    await QueueService.addMessageJob(messageJob);

    // Mark message as sent using new system
    this.markMessageAsSent(orderId, 'newOrder', name);

    console.log(`✅ تم جدولة رسالة الطلب الجديد للعميل: ${name}`);

    // Schedule reminder for later (24 hours default) - but only if reminders are enabled
    const statusSettings = await ConfigService.getStatusSettings();
    if (statusSettings?.enabledStatuses?.reminder) {
    const reminderJob: ReminderJob = {
      orderId,
      rowIndex,
      phoneNumber: processedPhone,
      customerName: name,
      orderStatus: statusType,
    };

    await QueueService.addReminderJob(reminderJob, reminderDelayHours);
    console.log(`🎯 Successfully processed newOrder for ${orderId} - Message queued + Reminder scheduled for ${reminderDelayHours}h`);
    } else {
      console.log(`🎯 Successfully processed newOrder for ${orderId} - Message queued (Reminders disabled)`);
    }
  }

  private static async handleNoAnswer(row: SheetRow, templates: MessageTemplates, reminderDelayHours: number): Promise<void> {
    const { orderId, processedPhone, name, rowIndex } = row;
    
    if (!processedPhone || !orderId || !rowIndex) return;

    // Enhanced duplicate prevention check
    const duplicateCheck = this.checkAndPreventDuplicate(orderId, 'noAnswer', name);
    
    if (!duplicateCheck.shouldSend) {
      console.log(duplicateCheck.reason);
      return;
    }

    console.log(`📞 Sending noAnswer message to ${name} (${processedPhone}) for order ${orderId}`);

    // Send no answer follow-up message
    const noAnswerMessage = this.replaceMessageVariables(templates.noAnswer, row);

    const messageJob: MessageJob = {
      phoneNumber: processedPhone,
      message: noAnswerMessage,
      orderId,
      rowIndex,
      messageType: 'noAnswer',
    };

    await QueueService.addMessageJob(messageJob);

    // Mark message as sent using new system
    this.markMessageAsSent(orderId, 'noAnswer', name);

    console.log(`🔒 READ-ONLY: Would update row ${rowIndex} with status: تم إرسال متابعة`);
    console.log(`🎯 Successfully processed noAnswer for ${orderId} - Follow-up message queued`);
  }

  /**
   * العرض الخاص بعد الرفض (24 ساعة)
   */
  private static async handleRefusedDelivery(row: SheetRow, templates: MessageTemplates, rejectedOfferDelayHours: number): Promise<void> {
    const { orderId, processedPhone, name, rowIndex } = row;
    
    if (!processedPhone || !orderId || !rowIndex) return;

    // Enhanced duplicate prevention check
    const duplicateCheck = this.checkAndPreventDuplicate(orderId, 'rejectedOffer', name);
    
    if (!duplicateCheck.shouldSend) {
      console.log(duplicateCheck.reason);
      return;
    }

    // Schedule the rejected offer job (24 hours default as per user request)
    const rejectedOfferJob: ReminderJob = {
      orderId,
      rowIndex,
      phoneNumber: processedPhone,
      customerName: name,
      orderStatus: 'مرفوض',
    };

    // Add job with 24 hour delay
    await QueueService.addRejectedOfferJob(rejectedOfferJob, 24); // Fixed 24 hours as requested

    // Mark as scheduled using new system
    this.markMessageAsSent(orderId, 'rejectedOffer', name);

    // Update status in sheet - DISABLED (READ-ONLY MODE)
    // await GoogleSheetsService.updateWhatsAppStatus(
    //   rowIndex,
    //   'عرض خاص مجدول',
    //   'سيتم إرسال العرض الخاص بعد 24 ساعة'
    // );
    console.log(`🔒 READ-ONLY: Would update row ${rowIndex} with status: عرض خاص مجدول`);

    console.log(`🎁 تم جدولة العرض الخاص للطلب المرفوض: ${orderId} (بعد 24 ساعة)`);
  }

  private static async handleConfirmedOrder(row: SheetRow, templates: MessageTemplates): Promise<void> {
    const { orderId, processedPhone, name, rowIndex } = row;
    
    if (!processedPhone || !orderId || !rowIndex) return;

    // Enhanced duplicate prevention check
    const duplicateCheck = this.checkAndPreventDuplicate(orderId, 'shipped', name);
    
    if (!duplicateCheck.shouldSend) {
      console.log(duplicateCheck.reason);
      return;
    }

    // Send shipped message for both confirmed and shipped statuses
    const shippedMessage = this.replaceMessageVariables(templates.shipped, row);

    const messageJob: MessageJob = {
      phoneNumber: processedPhone,
      message: shippedMessage,
      orderId,
      rowIndex,
      messageType: 'shipped',
    };

    await QueueService.addMessageJob(messageJob);

    // Mark message as sent using new system
    this.markMessageAsSent(orderId, 'shipped', name);

    // Update status in sheet - DISABLED (READ-ONLY MODE)
    // await GoogleSheetsService.updateWhatsAppStatus(
    //   rowIndex,
    //   'تم إرسال تأكيد الشحن',
    //   'تم إرسال رسالة تأكيد الشحن للعميل'
    // );
    console.log(`🔒 READ-ONLY: Would update row ${rowIndex} with status: تم إرسال تأكيد الشحن`);

    console.log(`🚚 تم إرسال رسالة تأكيد الشحن للطلب: ${orderId}`);
  }

  private static async handleShippedOrder(row: SheetRow, templates: MessageTemplates): Promise<void> {
    // Use the same handler as confirmed since they both send shipped message
    await this.handleConfirmedOrder(row, templates);
  }

  /**
   * Enhanced Egyptian Message Variable Replacement
   * Supports all variables needed for professional Egyptian e-commerce
   */
  private static replaceMessageVariables(template: string, row: SheetRow): string {
    const currentDate = new Date().toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const currentTime = new Date().toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit'
    });

    // Default company information (can be made configurable later)
    const companyInfo = {
      companyName: 'متجر مصر أونلاين',
      supportPhone: '01000000000',
      trackingLink: 'https://track.example.com',
      deliveryAddress: 'العنوان المحدد في الطلب'
    };

    // Calculate discount information
    const originalAmount = parseFloat(row.totalPrice?.toString() || '0');
    const discountPercent = 20; // 20% discount for rejected offers
    const discountedAmount = Math.round(originalAmount * (1 - discountPercent / 100));
    const savedAmount = originalAmount - discountedAmount;

    // Generate tracking number if not provided
    const trackingNumber = `TRK${row.orderId || Date.now()}`;
    const deliveryAddress = row.address || companyInfo.deliveryAddress;

    // Replace all variables
    return template
      // Customer Info
      .replace(/{name}/g, row.name || 'عزيزي العميل')
      .replace(/{phone}/g, row.processedPhone || row.phone || '')
      
      // Order Info
      .replace(/{orderId}/g, row.orderId || 'غير محدد')
      .replace(/{amount}/g, row.totalPrice?.toString() || '0')
      .replace(/{productName}/g, row.productName || 'المنتج المطلوب')
      
      // Company Info
      .replace(/{companyName}/g, companyInfo.companyName)
      .replace(/{supportPhone}/g, companyInfo.supportPhone)
      
      // Shipping Info
      .replace(/{trackingNumber}/g, trackingNumber)
      .replace(/{deliveryAddress}/g, deliveryAddress)
      .replace(/{trackingLink}/g, companyInfo.trackingLink + '/' + trackingNumber)
      
      // Discount Info
      .replace(/{discountedAmount}/g, discountedAmount.toString())
      .replace(/{savedAmount}/g, savedAmount.toString())
      
      // Dates
      .replace(/{confirmationDate}/g, currentDate)
      .replace(/{shippingDate}/g, currentDate)
      .replace(/{deliveryDate}/g, currentDate)
      .replace(/{deliveryTime}/g, currentTime)
      .replace(/{cancellationDate}/g, currentDate);
  }

  /**
   * Final state - no message required but log as completed
   */
  private static async handleDeliveredOrder(row: SheetRow, templates: MessageTemplates): Promise<void> {
    const { orderId, name, rowIndex } = row;
    
    if (!orderId || !rowIndex) return;

    // Update status to indicate successful completion - DISABLED (READ-ONLY MODE)
    // await GoogleSheetsService.updateWhatsAppStatus(
    //   rowIndex,
    //   'تم التوصيل بنجاح',
    //   'طلب مكتمل - لا حاجة لرسائل إضافية'
    // );
    console.log(`🔒 READ-ONLY: Would update row ${rowIndex} with status: تم التوصيل بنجاح`);
    
    console.log(`🎉 Order delivered successfully: ${orderId} for ${name}`);
  }

  private static async handleCancelledOrder(row: SheetRow, templates: MessageTemplates): Promise<void> {
    const { orderId, name, rowIndex } = row;
    
    if (!orderId || !rowIndex) return;

    // Update status to indicate cancellation - DISABLED (READ-ONLY MODE)
    // await GoogleSheetsService.updateWhatsAppStatus(
    //   rowIndex,
    //   'تم الإلغاء',
    //   'طلب ملغي - لا حاجة لرسائل إضافية'
    // );
    console.log(`🔒 READ-ONLY: Would update row ${rowIndex} with status: تم الإلغاء`);
    
    console.log(`🚫 Order cancelled: ${orderId} for ${name}`);
  }

  private static async checkReminderConditions(
    row: SheetRow, 
    previousStatusData: { status: string; timestamp: number }, 
    templates: MessageTemplates, 
    reminderDelayHours: number
  ): Promise<void> {
    const { orderId, processedPhone, name, orderStatus, rowIndex } = row;
    
    if (!processedPhone || !orderId || !rowIndex) return;

    // Check if reminders are enabled
    const statusSettings = await ConfigService.getStatusSettings();
    if (!statusSettings?.enabledStatuses?.reminder) {
      console.log(`🚫 Reminders are disabled - skipping for order ${orderId}`);
      return;
    }

    // Check if enough time has passed since last status change
    const hoursSinceLastChange = (Date.now() - previousStatusData.timestamp) / (1000 * 60 * 60);
    
    // تنظيف حالة الطلب
    const cleanStatus = (orderStatus || '').trim();
    
    // تحديد الحالات التي تحتاج تذكيرات (شامل الحالة الفارغة)
    const needsReminder = (
      cleanStatus === '' ||  // الحالة الفارغة
      cleanStatus === this.EGYPTIAN_ORDER_STATUSES.NEW || 
      cleanStatus === this.EGYPTIAN_ORDER_STATUSES.NEW_2 ||
      cleanStatus === this.EGYPTIAN_ORDER_STATUSES.NEW_3 ||
      cleanStatus === this.EGYPTIAN_ORDER_STATUSES.NEW_4 ||
      cleanStatus === this.EGYPTIAN_ORDER_STATUSES.UNDEFINED ||
      cleanStatus === this.EGYPTIAN_ORDER_STATUSES.NO_ANSWER_1 ||
      cleanStatus === this.EGYPTIAN_ORDER_STATUSES.NO_ANSWER_2 ||
      cleanStatus === this.EGYPTIAN_ORDER_STATUSES.NO_ANSWER_3 ||
      cleanStatus === this.EGYPTIAN_ORDER_STATUSES.NO_ANSWER_4
    );
    
    // Only send reminders for certain statuses and if enough time has passed
    if (hoursSinceLastChange >= reminderDelayHours && needsReminder) {
      
      // Enhanced duplicate prevention check for reminders
      const duplicateCheck = this.checkAndPreventDuplicate(orderId, 'reminder', name);
      
      if (!duplicateCheck.shouldSend) {
        console.log(duplicateCheck.reason);
        return;
      }
      
      console.log(`⏰ Sending reminder for order ${orderId} with status: "${cleanStatus || 'فارغ'}" (${Math.round(hoursSinceLastChange)}h since last change)`);
      
        const reminderMessage = templates.reminder
          .replace('{name}', name)
          .replace('{orderId}', orderId);

        const messageJob: MessageJob = {
          phoneNumber: processedPhone,
          message: reminderMessage,
          orderId,
          rowIndex,
          messageType: 'reminder',
        };

        await QueueService.addMessageJob(messageJob);
        
      // Mark reminder as sent using new system
      this.markMessageAsSent(orderId, 'reminder', name);
        
      console.log(`✅ تم جدولة رسالة تذكير للطلب: ${orderId}`);
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
    this.emptyStatusOrdersTracking.clear(); // Clear the new tracking map
    
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
   * تنظيف تتبع الحالات الفارغة القديمة (أكثر من 24 ساعة)
   */
  private static cleanupOldEmptyStatusTracking(): void {
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    let cleanedCount = 0;
    
    // Clean up old empty status tracking
    for (const [key, tracking] of this.emptyStatusOrdersTracking.entries()) {
      if (tracking.lastProcessed < oneDayAgo) {
        this.emptyStatusOrdersTracking.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} old empty status tracking entries`);
    }
  }

  /**
   * الحصول على إحصائيات تحديث الحالات الفارغة
   */
  static getEmptyStatusStats(): {
    trackedUpdatedOrders: number;
    recentUpdates: Array<{ orderId: string; timestamp: number; timeSinceUpdate: number }>;
    emptyStatusTracking: {
      totalTracked: number;
      withMessages: number;
      recentlyProcessed: Array<{
        key: string;
        firstSeen: string;
        lastProcessed: string;
        processCount: number;
        messagesSent: string[];
      }>;
    };
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

    // Get empty status tracking info
    const emptyStatusInfo = [];
    let withMessages = 0;
    
    for (const [key, tracking] of this.emptyStatusOrdersTracking.entries()) {
      if (tracking.messagesSent.size > 0) {
        withMessages++;
      }
      
      emptyStatusInfo.push({
        key,
        firstSeen: new Date(tracking.firstSeen).toLocaleString('ar-EG'),
        lastProcessed: new Date(tracking.lastProcessed).toLocaleString('ar-EG'),
        processCount: tracking.processCount,
        messagesSent: Array.from(tracking.messagesSent)
      });
    }

    return {
      trackedUpdatedOrders: this.updatedFromEmptyStatus.size,
      recentUpdates: recentUpdates.sort((a, b) => b.timestamp - a.timestamp),
      emptyStatusTracking: {
        totalTracked: this.emptyStatusOrdersTracking.size,
        withMessages,
        recentlyProcessed: emptyStatusInfo
          .sort((a, b) => b.processCount - a.processCount)
          .slice(0, 10) // Top 10 most processed
      }
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
    this.sentMessages.clear();
    this.duplicateAttempts.clear();
    this.performanceStats.cacheHits = 0;
    this.performanceStats.cacheMisses = 0;
    this.performanceStats.whatsappApiCalls = 0;
    console.log('✅ All caches cleared');
  }

  /**
   * 🔧 FIX: دالة خاصة لفرض معالجة الطلبات الجديدة
   * لحل مشكلة عدم إرسال رسائل الطلبات الجديدة
   */
  static async forceProcessNewOrders(): Promise<{
    success: boolean;
    totalOrders: number;
    newOrdersFound: number;
    messagesQueued: number;
    skipped: number;
    errors: string[];
  }> {
    const result = {
      success: false,
      totalOrders: 0,
      newOrdersFound: 0,
      messagesQueued: 0,
      skipped: 0,
      errors: [] as string[]
    };

    try {
      console.log('🔧 Starting FORCE processing of new orders to fix messaging issue...');
      
      // Get sheet data
      const sheetData = await GoogleSheetsService.getSheetData();
      result.totalOrders = sheetData.length;
      
      if (!sheetData || sheetData.length === 0) {
        result.errors.push('No data found in sheet');
        return result;
      }

      // Get templates
      const { templates } = await ConfigService.getMessageTemplates();
      const { reminderDelayHours } = await ConfigService.getTimingConfig();

      console.log(`📊 Force processing ${sheetData.length} orders for new order status...`);

      for (const row of sheetData) {
        try {
          // Quick validation
          if (!row.name || !row.orderId) {
            result.skipped++;
            continue;
          }

          // Phone validation
          const sanitizationResult = await this.sanitizeAndValidateRowOptimized(row);
          if (!sanitizationResult.isValid) {
            result.skipped++;
            continue;
          }

          // Check if this is a new order status
          const cleanStatus = (row.orderStatus || '').trim();
          const isNewOrderStatus = cleanStatus === this.EGYPTIAN_ORDER_STATUSES.NEW ||
                                   cleanStatus === this.EGYPTIAN_ORDER_STATUSES.NEW_2 ||
                                   cleanStatus === this.EGYPTIAN_ORDER_STATUSES.NEW_3 ||
                                   cleanStatus === this.EGYPTIAN_ORDER_STATUSES.NEW_4 ||
                                   cleanStatus === this.EGYPTIAN_ORDER_STATUSES.UNDEFINED ||
                                   cleanStatus === '';

          if (isNewOrderStatus) {
            result.newOrdersFound++;
            
            console.log(`🆕 FORCE: Found new order ${row.orderId} with status: "${cleanStatus}" for ${row.name}`);
            
            // Check if message was sent recently (less than 2 hours)
            const lastNewOrderTime = this.sentMessages.get(`${row.orderId}_newOrder`)?.timestamp || 0;
            const hoursSinceLastNewOrder = (Date.now() - lastNewOrderTime) / (1000 * 60 * 60);
            
            if (hoursSinceLastNewOrder > 2 || lastNewOrderTime === 0) {
              console.log(`📤 FORCE: Queueing new order message for ${row.name} (${row.orderId})`);
              
              // Force handle the new order
              await this.handleNewOrder(row, templates, reminderDelayHours, cleanStatus || 'جديد');
              result.messagesQueued++;
              
              console.log(`✅ FORCE: Successfully queued message for order ${row.orderId}`);
            } else {
              console.log(`⏰ FORCE: Skipping ${row.orderId} - message sent ${hoursSinceLastNewOrder.toFixed(1)}h ago`);
              result.skipped++;
            }
          }
        } catch (error) {
          const errorMsg = `Error processing order ${row.orderId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          result.errors.push(errorMsg);
          console.error(`❌ FORCE: ${errorMsg}`);
        }
      }

      result.success = result.errors.length === 0;
      
      console.log(`🎯 FORCE processing complete: ${result.newOrdersFound} new orders found, ${result.messagesQueued} messages queued, ${result.skipped} skipped`);
      
      if (result.errors.length > 0) {
        console.log(`⚠️ Errors encountered: ${result.errors.length}`);
        result.errors.forEach(error => console.log(`   - ${error}`));
      }

      return result;
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Force processing failed: ${errorMsg}`);
      console.error('❌ FORCE processing failed:', error);
      return result;
    }
  }

  /**
   * 🔧 FIX: دالة لإعادة تعيين تتبع الرسائل المرسلة (لحل مشاكل التكرار)
   */
  static resetMessageTracking(): {
    clearedSentMessages: number;
    clearedOrderHistory: number;
    clearedDuplicateAttempts: number;
  } {
    const clearedSentMessages = this.sentMessages.size;
    const clearedOrderHistory = this.orderStatusHistory.size;
    const clearedDuplicateAttempts = this.duplicateAttempts.size;
    
    this.sentMessages.clear();
    this.orderStatusHistory.clear();
    this.duplicateAttempts.clear();
    this.emptyStatusOrdersTracking.clear();
    
    // Reset stats
    this.duplicatePreventionStats = {
      totalDuplicatesPrevented: 0,
      duplicatesPreventedByType: {
        newOrder: 0,
        noAnswer: 0,
        shipped: 0,
        rejectedOffer: 0,
        reminder: 0
      },
      lastResetTime: Date.now()
    };
    
    console.log(`🧹 Reset message tracking: ${clearedSentMessages} sent messages, ${clearedOrderHistory} order history, ${clearedDuplicateAttempts} duplicate attempts`);
    
    return {
      clearedSentMessages,
      clearedOrderHistory,
      clearedDuplicateAttempts
    };
  }

  /**
   * 🔧 FIX: الحصول على إحصائيات مفصلة حول رسائل الطلبات الجديدة
   */
  static getNewOrderMessageStats(): {
    totalNewOrderMessages: number;
    recentNewOrders: Array<{
      orderId: string;
      timestamp: string;
      hoursSinceSent: number;
    }>;
    ordersWithoutMessages: Array<{
      orderId: string;
      status: string;
      customerName: string;
    }>;
  } {
    const newOrderMessages = Array.from(this.sentMessages.entries())
      .filter(([key]) => key.includes('_newOrder'))
      .map(([key, data]) => ({
        orderId: key.replace('_newOrder', ''),
        timestamp: new Date(data.timestamp).toLocaleString('ar-EG'),
        hoursSinceSent: (Date.now() - data.timestamp) / (1000 * 60 * 60)
      }))
      .sort((a, b) => b.hoursSinceSent - a.hoursSinceSent);

    return {
      totalNewOrderMessages: newOrderMessages.length,
      recentNewOrders: newOrderMessages.slice(0, 10),
      ordersWithoutMessages: [] // This would need sheet data to calculate
    };
  }

  /**
   * 🔧 NEW: Get status history for external access
   */
  static getStatusHistory(): Map<string, { status: string, timestamp: number }> {
    return new Map(this.orderStatusHistory);
  }

  /**
   * 🔧 NEW: Get sent messages for external access
   */
  static getSentMessages(): Map<string, { messageType: string, timestamp: number }> {
    return new Map(this.sentMessages);
  }

  /**
   * 🔧 NEW: Public method to trigger processing from external APIs
   */
  static async triggerProcessing(): Promise<void> {
    if (this.isRunning) {
      await this.processSheetDataOptimized();
    } else {
      console.log('⚠️ Automation engine is not running - starting temporary processing...');
      await this.processSheetDataOptimized();
    }
  }
} 