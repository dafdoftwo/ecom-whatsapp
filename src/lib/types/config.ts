export interface GoogleConfig {
  spreadsheetUrl: string;
  credentials: Record<string, unknown>;
  projectId?: string;
  privateKeyId?: string;
  privateKey?: string;
  clientEmail?: string;
  clientId?: string;
  authUri?: string;
  tokenUri?: string;
  authProviderX509CertUrl?: string;
  clientX509CertUrl?: string;
}

export interface SheetRow {
  orderDate: string;           // A: تاريخ الطلب
  name: string;                // B: الاسم
  phone: string;               // C: رقم الهاتف
  whatsappNumber: string;      // D: رقم الواتس
  governorate: string;         // E: المحافظة
  area: string;                // F: المنطقة
  address: string;             // G: العنوان
  orderDetails: string;        // H: تفاصيل الطلب
  quantity: string;            // I: الكمية
  source: string;              // J: المصدر
  totalPrice: string;          // K: توتال السعر شامل الشحن
  productName: string;         // L: اسم المنتج
  orderStatus: string;         // M: الحالة
  notes: string;               // N: ملاحظات
  sourceChannel: string;       // O: المصدر
  whatsappStatus: string;      // P: ارسال واتس اب
  // Additional computed fields
  orderId?: string;
  lastMessageSent?: string;
  lastUpdated?: string;
  rowIndex?: number;
  processedPhone?: string;     // معالج الرقم بعد التنظيف
  validPhone?: boolean;        // هل الرقم صالح
}

export interface MessageTemplates {
  newOrder: string;        // رسالة الطلب الجديد
  noAnswer: string;        // رسالة عدم الرد
  shipped: string;         // رسالة التأكيد والشحن
  rejectedOffer: string;   // العرض الخاص بعد الرفض (24 ساعة)
  reminder: string;        // رسالة التذكير التلقائية
  // Legacy fields for compatibility (will be empty)
  welcome: string;
  confirmed: string;
  delivered: string;
  cancelled: string;
}

export interface TimingConfig {
  checkIntervalSeconds: number;
  reminderDelayHours: number;
  rejectedOfferDelayHours: number;
}

export interface AppConfig {
  google: GoogleConfig;
  messages: MessageTemplates;
  timing: TimingConfig;
}

export interface AutomationStats {
  engine: {
    isRunning: boolean;
    lastCheck: string;
    nextCheck: string;
  };
  queue: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  };
  whatsapp: {
    isConnected: boolean;
    sessionStatus: string;
  };
  sheets: {
    totalOrders: number;
    newOrders: number;
    pendingOrders: number;
    lastSync: string;
  };
}

export interface WhatsAppStatus {
  isConnected: boolean;
  sessionExists: boolean;
  qrCode?: string;
  error?: string;
  clientInfo?: {
    pushname: string;
    wid: string;
  };
} 