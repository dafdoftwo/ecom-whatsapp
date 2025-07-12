import { QueueService } from './queue';

export interface SentMessage {
  id: string;
  orderId: string;
  phoneNumber: string;
  messageType: 'newOrder' | 'noAnswer' | 'shipped' | 'rejectedOffer' | 'reminder';
  timestamp: string;
  status: 'sent' | 'failed' | 'pending';
  messageContent?: string;
  errorMessage?: string;
  rowIndex?: number;
}

export class MessageTracker {
  private static sentMessages = new Map<string, SentMessage[]>();
  private static readonly STORAGE_KEY = 'whatsapp_sent_messages';

  /**
   * تسجيل رسالة مرسلة
   */
  static recordSentMessage(sentMessage: SentMessage): void {
    const orderId = sentMessage.orderId;
    const existingMessages = this.sentMessages.get(orderId) || [];
    
    // Check if this message type already exists for this order
    const existingMessageIndex = existingMessages.findIndex(
      msg => msg.messageType === sentMessage.messageType
    );
    
    if (existingMessageIndex >= 0) {
      // Update existing message
      existingMessages[existingMessageIndex] = sentMessage;
    } else {
      // Add new message
      existingMessages.push(sentMessage);
    }
    
    this.sentMessages.set(orderId, existingMessages);
    this.persistToStorage();
    
    console.log(`📝 Message tracked: ${sentMessage.messageType} for order ${orderId}`);
  }

  /**
   * التحقق من إرسال نوع رسالة معين لطلب معين
   */
  static hasMessageBeenSent(orderId: string, messageType: SentMessage['messageType']): boolean {
    const orderMessages = this.sentMessages.get(orderId);
    if (!orderMessages) return false;
    
    return orderMessages.some(msg => 
      msg.messageType === messageType && 
      (msg.status === 'sent' || msg.status === 'pending')
    );
  }

  /**
   * الحصول على جميع الرسائل المرسلة لطلب معين
   */
  static getOrderMessages(orderId: string): SentMessage[] {
    return this.sentMessages.get(orderId) || [];
  }

  /**
   * الحصول على آخر رسالة من نوع معين لطلب معين
   */
  static getLastMessage(orderId: string, messageType: SentMessage['messageType']): SentMessage | null {
    const orderMessages = this.sentMessages.get(orderId);
    if (!orderMessages) return null;
    
    const messages = orderMessages
      .filter(msg => msg.messageType === messageType)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    return messages[0] || null;
  }

  /**
   * تحديث حالة رسالة
   */
  static updateMessageStatus(
    orderId: string, 
    messageType: SentMessage['messageType'], 
    status: SentMessage['status'],
    errorMessage?: string
  ): void {
    const orderMessages = this.sentMessages.get(orderId);
    if (!orderMessages) return;
    
    const messageIndex = orderMessages.findIndex(msg => msg.messageType === messageType);
    if (messageIndex >= 0) {
      orderMessages[messageIndex].status = status;
      if (errorMessage) {
        orderMessages[messageIndex].errorMessage = errorMessage;
      }
      
      this.sentMessages.set(orderId, orderMessages);
      this.persistToStorage();
      
      console.log(`🔄 Message status updated: ${messageType} for order ${orderId} -> ${status}`);
    }
  }

  /**
   * الحصول على إحصائيات الرسائل
   */
  static getMessagesStats(): {
    totalMessages: number;
    sentMessages: number;
    failedMessages: number;
    pendingMessages: number;
    messagesByType: Record<SentMessage['messageType'], number>;
  } {
    let totalMessages = 0;
    let sentMessages = 0;
    let failedMessages = 0;
    let pendingMessages = 0;
    const messagesByType: Record<SentMessage['messageType'], number> = {
      newOrder: 0,
      noAnswer: 0,
      shipped: 0,
      rejectedOffer: 0,
      reminder: 0
    };

    for (const orderMessages of this.sentMessages.values()) {
      for (const message of orderMessages) {
        totalMessages++;
        messagesByType[message.messageType]++;
        
        switch (message.status) {
          case 'sent':
            sentMessages++;
            break;
          case 'failed':
            failedMessages++;
            break;
          case 'pending':
            pendingMessages++;
            break;
        }
      }
    }

    return {
      totalMessages,
      sentMessages,
      failedMessages,
      pendingMessages,
      messagesByType
    };
  }

  /**
   * تنظيف الرسائل القديمة (أكثر من 30 يوم)
   */
  static cleanupOldMessages(): void {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    let cleanedCount = 0;
    
    for (const [orderId, messages] of this.sentMessages.entries()) {
      const filteredMessages = messages.filter(msg => 
        new Date(msg.timestamp) > thirtyDaysAgo
      );
      
      if (filteredMessages.length !== messages.length) {
        cleanedCount += messages.length - filteredMessages.length;
        
        if (filteredMessages.length > 0) {
          this.sentMessages.set(orderId, filteredMessages);
        } else {
          this.sentMessages.delete(orderId);
        }
      }
    }
    
    if (cleanedCount > 0) {
      this.persistToStorage();
      console.log(`🧹 Cleaned ${cleanedCount} old messages`);
    }
  }

  /**
   * إعادة تعيين جميع الرسائل
   */
  static resetAllMessages(): void {
    this.sentMessages.clear();
    this.persistToStorage();
    console.log('🔄 All message tracking data reset');
  }

  /**
   * تحميل البيانات من التخزين المحلي
   */
  static loadFromStorage(): void {
    try {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        if (stored) {
          const data = JSON.parse(stored);
          this.sentMessages = new Map(Object.entries(data));
          console.log(`📚 Loaded ${this.sentMessages.size} orders with message tracking`);
        }
      }
    } catch (error) {
      console.error('Error loading message tracking data:', error);
    }
  }

  /**
   * حفظ البيانات في التخزين المحلي
   */
  private static persistToStorage(): void {
    try {
      if (typeof window !== 'undefined') {
        const data = Object.fromEntries(this.sentMessages.entries());
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
      }
    } catch (error) {
      console.error('Error persisting message tracking data:', error);
    }
  }

  /**
   * تحديث تتبع الرسائل بناءً على حالة الطلب
   */
  static updateTrackingBasedOnOrderStatus(
    orderId: string,
    orderStatus: string,
    phoneNumber: string,
    rowIndex?: number
  ): void {
    const now = new Date().toISOString();
    
    // Map order statuses to message types
    const statusMappings: Record<string, SentMessage['messageType'][]> = {
      'جديد': ['newOrder'],
      'طلب جديد': ['newOrder'],
      'قيد المراجعة': ['newOrder'],
      'قيد المراجعه': ['newOrder'],
      '': ['newOrder'], // Empty status considered as new
      'لم يتم الرد': ['noAnswer'],
      'لم يرد': ['noAnswer'],
      'لا يرد': ['noAnswer'],
      'عدم الرد': ['noAnswer'],
      'تم التأكيد': ['shipped'],
      'تم التاكيد': ['shipped'],
      'مؤكد': ['shipped'],
      'تم الشحن': ['shipped'],
      'قيد الشحن': ['shipped'],
      'تم الرفض': ['rejectedOffer'],
      'مرفوض': ['rejectedOffer'],
      'رفض الاستلام': ['rejectedOffer'],
      'رفض الأستلام': ['rejectedOffer'],
      'لم يتم الاستلام': ['rejectedOffer']
    };

    const messageTypes = statusMappings[orderStatus];
    if (messageTypes) {
      for (const messageType of messageTypes) {
        if (!this.hasMessageBeenSent(orderId, messageType)) {
          const sentMessage: SentMessage = {
            id: `${orderId}_${messageType}_${Date.now()}`,
            orderId,
            phoneNumber,
            messageType,
            timestamp: now,
            status: 'sent', // Assume sent for tracking purposes
            rowIndex
          };
          
          this.recordSentMessage(sentMessage);
        }
      }
    }
  }

  /**
   * الحصول على ملخص الرسائل لعرضها في واجهة المستخدم
   */
  static getOrderMessagesSummary(orderId: string): Array<{
    type: string;
    timestamp: string;
    status: 'sent' | 'failed' | 'pending';
  }> {
    const messages = this.getOrderMessages(orderId);
    return messages.map(msg => ({
      type: msg.messageType,
      timestamp: msg.timestamp,
      status: msg.status
    }));
  }

  /**
   * تصدير جميع بيانات الرسائل
   */
  static exportAllData(): Record<string, SentMessage[]> {
    return Object.fromEntries(this.sentMessages.entries());
  }

  /**
   * استيراد بيانات الرسائل
   */
  static importData(data: Record<string, SentMessage[]>): void {
    this.sentMessages = new Map(Object.entries(data));
    this.persistToStorage();
    console.log(`📥 Imported message tracking data for ${this.sentMessages.size} orders`);
  }
}

// Auto-load on module initialization
MessageTracker.loadFromStorage(); 