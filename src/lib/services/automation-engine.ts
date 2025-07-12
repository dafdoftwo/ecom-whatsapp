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

  static async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Automation engine is already running');
      return;
    }

    try {
      console.log('🚀 Starting Egyptian WhatsApp automation engine...');
      
      // Log supported statuses for debugging
      this.logSupportedStatuses();
      
      this.isRunning = true;
      
      // Initialize queue service
      await QueueService.initialize();
      
      // Start the main processing loop
      await this.startProcessingLoop();
      
      console.log('✅ Egyptian automation engine started successfully');
    } catch (error) {
      console.error('❌ Error starting automation engine:', error);
      this.isRunning = false;
      throw error;
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
    const processLoop = async () => {
      if (!this.isRunning) {
        console.log('🛑 Automation engine stopped, exiting loop');
        return;
      }

      try {
        // Get the correct check interval from configuration
        const { checkIntervalSeconds } = await ConfigService.getTimingConfig();
        const checkInterval = checkIntervalSeconds * 1000; // Convert to milliseconds

        console.log(`🔄 Egyptian automation engine processing cycle... (Next check in ${checkIntervalSeconds}s)`);
        
        // استخدام المعالجة المبسطة بدلاً من المعقدة
        await this.processSheetData();
        
        console.log(`✅ Processing cycle completed. Next check in ${checkIntervalSeconds} seconds`);
        
        // Schedule next processing with the correct interval
        if (this.isRunning) {
          this.intervalId = setTimeout(processLoop, checkInterval);
        }
      } catch (error) {
        console.error('❌ Error in processing cycle:', error);
        
        // On error, retry after 60 seconds
        if (this.isRunning) {
          console.log('⏳ Retrying after 60 seconds due to error...');
          this.intervalId = setTimeout(processLoop, 60000);
        }
      }
    };

    // Start the first processing cycle after 5 seconds
    console.log('🚀 Starting automation engine processing loop in 5 seconds...');
    this.intervalId = setTimeout(processLoop, 5000);
  }

  private static async processSheetData(): Promise<void> {
    try {
      console.log('🔄 Processing Egyptian sheet data...');
      
      // Get sheet data with Egyptian processing
      const sheetData = await GoogleSheetsService.getSheetData();
      
      if (!sheetData || sheetData.length === 0) {
        console.log('No data found in sheet');
        return;
      }

      console.log(`📊 Found ${sheetData.length} potential orders to process`);

      // Get timing configuration and message templates
      const { reminderDelayHours, rejectedOfferDelayHours } = await ConfigService.getTimingConfig();
      const { templates } = await ConfigService.getMessageTemplates();

      let processedCount = 0;
      let skippedCount = 0;
      let invalidPhoneCount = 0;
      let whatsappValidationCount = 0;

      for (const row of sheetData) {
        // Stage 1: Data Sanitization & Phone Number Resolution
        const sanitizationResult = await this.sanitizeAndValidateRow(row);
        
        if (!sanitizationResult.isValid) {
          if (sanitizationResult.reason === 'invalid_phone') {
            invalidPhoneCount++;
            // Update sheet with invalid phone status - DISABLED (READ-ONLY MODE)
            // if (row.rowIndex) {
            //   await GoogleSheetsService.updateWhatsAppStatus(
            //     row.rowIndex,
            //     'رقم هاتف غير صحيح',
            //     sanitizationResult.details
            //   );
            // }
            console.log(`🔒 READ-ONLY: Would mark row ${row.rowIndex} as invalid phone`);
          } else if (sanitizationResult.reason === 'not_whatsapp_user') {
            whatsappValidationCount++;
            // Update sheet with "not WhatsApp user" status - DISABLED (READ-ONLY MODE)
            // if (row.rowIndex) {
            //   await GoogleSheetsService.updateWhatsAppStatus(
            //     row.rowIndex,
            //     'رقم واتساب غير صحيح',
            //     'الرقم غير مسجل على الواتساب'
            //   );
            // }
            console.log(`🔒 READ-ONLY: Would mark row ${row.rowIndex} as not WhatsApp user`);
          }
          skippedCount++;
          continue;
        }

        // Stage 2: Business Logic Application
        const orderId = row.orderId!;
        const currentStatus = row.orderStatus;
        const previousStatusData = this.orderStatusHistory.get(orderId);
        
        // Update status history
        this.orderStatusHistory.set(orderId, {
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

      console.log(`✅ Processing complete: ${processedCount} processed, ${skippedCount} skipped (${invalidPhoneCount} invalid phones, ${whatsappValidationCount} not WhatsApp users), ${sheetData.length} total`);
    } catch (error) {
      console.error('Error processing sheet data:', error);
      throw error;
    }
  }

  /**
   * Stage 1: Data Sanitization & Phone Number Resolution (حسب المواصفات المصرية)
   */
  private static async sanitizeAndValidateRow(row: SheetRow): Promise<{
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

    // Final WhatsApp Check: التحقق من تسجيل الرقم على الواتساب
    const whatsapp = WhatsAppService.getInstance();
    const whatsappValidation = await whatsapp.validatePhoneNumber(egyptianValidation.finalFormat);
    
    if (!whatsappValidation.isRegistered) {
      return {
        isValid: false,
        reason: 'not_whatsapp_user',
        details: 'الرقم غير مسجل على الواتساب'
      };
    }

    return {
      isValid: true,
      finalPhone: egyptianValidation.finalFormat
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
    
    // معالجة خاصة للحالة الفارغة
    if (status === '') {
      console.log(`🔳 ➤ Empty Status detected for order ${orderId} (${name}) → Treating as NEW ORDER`);
      if (enabledStatuses.newOrder) {
        await this.handleNewOrder(row, templates, reminderDelayHours, 'جديد (حالة فارغة)');
      } else {
        console.log(`🚫 New Order messages are disabled for empty status`);
      }
      return;
    }
    
    console.log(`🔍 Processing order ${orderId} with status: "${status}" for customer: ${name}`);

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
        console.log(`❓ ➤ Unknown status detected: "${status}" → No action taken`);
        console.log(`💡 إذا كانت هذه حالة جديدة، أضفها إلى الحالات المدعومة في النظام`);
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
    customerName: string
  ): { shouldSend: boolean; reason: string; stats: any } {
    const messageKey = messageType === 'reminder' ? `reminder_${orderId}` : `${orderId}_${messageType}`;

    // Check if message was already sent
    const alreadySent = messageType === 'reminder' 
      ? this.orderStatusHistory.has(messageKey)
      : this.sentMessages.has(messageKey);

    if (alreadySent) {
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

      const previousMessage = messageType === 'reminder'
        ? this.orderStatusHistory.get(messageKey)
        : this.sentMessages.get(messageKey);
      
      const timeDiff = previousMessage 
        ? Math.round((Date.now() - previousMessage.timestamp) / 1000 / 60) // minutes
        : 0;

      const reason = `🚫 منع تكرار: رسالة ${messageType} تم إرسالها منذ ${timeDiff} دقيقة للعميل ${customerName} (طلب ${orderId})`;
      
      console.log(reason);
      console.log(`📊 إحصائيات منع التكرار: ${this.duplicatePreventionStats.totalDuplicatesPrevented} رسالة مكررة تم منعها`);

      return {
        shouldSend: false,
        reason,
        stats: {
          timeSinceLastMessage: timeDiff,
          totalDuplicatesPrevented: this.duplicatePreventionStats.totalDuplicatesPrevented,
          duplicatesForThisOrder: this.duplicateAttempts.get(duplicateKey)?.preventedDuplicates || 1
        }
      };
    }

    // Message is new - can be sent
    console.log(`✅ رسالة جديدة: ${messageType} للعميل ${customerName} (طلب ${orderId})`);
    
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

      // المرحلة 2: المعالجة العادية
      console.log('🔄 Starting regular order processing...');
      await this.processSheetData();

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
} 