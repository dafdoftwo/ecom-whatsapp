import fs from 'fs/promises';
import path from 'path';
import type { GoogleConfig, MessageTemplates, TimingConfig } from '../types/config';

const CONFIG_DIR = path.join(process.cwd(), 'config');

// Default configurations
const DEFAULT_GOOGLE_CONFIG: GoogleConfig = {
  spreadsheetUrl: '',
  credentials: {}
};

const DEFAULT_MESSAGE_TEMPLATES: MessageTemplates = {
  newOrder: 'السلام عليكم ورحمة الله مع حضرتك هبه✨\nطلبك ({productName}) في أيدٍ أمينة، وفريقنا بدأ في إعداده بكل شغف واهتمام. سنتواصل معك قريباً للتأكيد.\nشكراً لثقتك بنا !',
  noAnswer: 'السلام عليكم ورحمة الله وبركاته مع حضرتك هبه\nيبدو أننا لم نوفق في التواصل معك هاتفياً لتأكيد طلبك ({productName}). 😟\nحرصاً منا على عدم تأخيره، نرجو منك الرد علينا في أقرب فرصة. نحن في انتظارك!',
  shipped: 'أخبار رائعة، لحضرتك 🎉\nطلبك ({productName}) انطلق في رحلته إليك الآن. استعد لاستقبال جرعة من السعادة قريباً! 🚚\nشكراً لصبرك وحماسك.',
  rejectedOffer: 'السلام عليكم اخبار حضرتك ايه؟\nقد لا يكون طلبك الأخير قد اكتمل، لكننا لم ننسَ اهتمامك بنا. ❤️\nتقديراً لذلك، يسعدنا أن نهديك فرصة ثانية بتخفيض خاص 20% على ({productName}). نأمل أن تستفيد من هذا الخصم!',
  reminder: 'السلام عليكم\n\nالمحترم/ة {name}\n\n⏰ تذكير بطلبكم رقم {orderId}\n\n💰 المبلغ: {amount} جنيه (دفع عند الاستلام)\n\n⚠️ تنبيه:\n• المنتج متوفر بكمية محدودة\n• السعر مضمون حتى نهاية اليوم\n• قد ينفذ في أي وقت\n\n📱 للتأكيد:\n• رد بكلمة "أؤكد"\n• أو اتصل بنا\n\n🎁 عند التأكيد اليوم: هدية مجانية\n\nفريق {companyName}',
  welcome: '',
  confirmed: '',
  delivered: '',
  cancelled: ''
};

const DEFAULT_TIMING_CONFIG: TimingConfig = {
  checkIntervalSeconds: 30,
  reminderDelayHours: 24,
  rejectedOfferDelayHours: 48
};

const DEFAULT_STATUS_SETTINGS = {
  enabledStatuses: {
    newOrder: true,
    noAnswer: true,
    shipped: true,
    rejectedOffer: true,
    reminder: true
  },
  statusDescriptions: {
    newOrder: "الطلبات الجديدة - إرسال رسالة ترحيب للطلبات الجديدة",
    noAnswer: "لم يرد - إرسال رسالة متابعة عند عدم الرد",
    shipped: "تم الشحن/التأكيد - إرسال رسالة تأكيد الشحن",
    rejectedOffer: "مرفوض - إرسال عرض خاص بعد 24 ساعة",
    reminder: "تذكير تلقائي - إرسال تذكير للطلبات المعلقة"
  }
};

async function tryReadFile<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return defaultValue;
  }
}

function parseEnvGoogleConfig(): GoogleConfig | null {
  // Accept either full URL or spreadsheet ID
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || '';
  const spreadsheetUrlEnv = process.env.GOOGLE_SPREADSHEET_URL || '';
  const serviceAccountRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '';

  if (!spreadsheetId && !spreadsheetUrlEnv) return null;
  if (!serviceAccountRaw) return null;

  let credentials: any = {};
  try {
    credentials = JSON.parse(serviceAccountRaw);
  } catch {
    // If value is base64, try decoding
    try {
      const decoded = Buffer.from(serviceAccountRaw, 'base64').toString('utf-8');
      credentials = JSON.parse(decoded);
    } catch {
      return null;
    }
  }

  const spreadsheetUrl = spreadsheetUrlEnv || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  return { spreadsheetUrl, credentials };
}

export class ConfigService {
  private static async ensureConfigDir(): Promise<void> {
    try {
      await fs.access(CONFIG_DIR);
    } catch (error) {
      await fs.mkdir(CONFIG_DIR, { recursive: true });
    }
  }

  private static async readConfigFile<T>(filename: string, defaultValue: T): Promise<T> {
    try {
      const filePath = path.join(CONFIG_DIR, filename);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.warn(`Config file ${filename} not found or invalid, using defaults:`, error);
      return defaultValue;
    }
  }

  private static async writeConfigFile<T>(filename: string, data: T): Promise<void> {
    try {
      await this.ensureConfigDir();
      const filePath = path.join(CONFIG_DIR, filename);
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error(`Error writing config file ${filename}:`, error);
      throw new Error(`Failed to write configuration file: ${filename}`);
    }
  }

  // Google Configuration
  static async getGoogleConfig(): Promise<GoogleConfig> {
    // 1) Try file first
    const filePath = path.join(CONFIG_DIR, 'google.json');
    const fileConfig = await tryReadFile<GoogleConfig>(filePath, DEFAULT_GOOGLE_CONFIG);

    // If file config is valid, return it
    if (fileConfig.spreadsheetUrl && fileConfig.credentials && Object.keys(fileConfig.credentials).length > 0) {
      return fileConfig;
    }

    // 2) Fallback to environment variables
    const envConfig = parseEnvGoogleConfig();
    if (envConfig) {
      console.log('✅ Loaded Google config from environment variables');
      return envConfig;
    }

    console.warn('⚠️ Google Sheets configuration not found or incomplete');
    return DEFAULT_GOOGLE_CONFIG;
  }

  static async setGoogleConfig(config: GoogleConfig): Promise<void> {
    return this.writeConfigFile('google.json', config);
  }

  // Message Templates
  static async getMessageTemplates(): Promise<{ templates: MessageTemplates }> {
    const result = await this.readConfigFile<{ templates: MessageTemplates }>('messages.json', { templates: DEFAULT_MESSAGE_TEMPLATES });
    return result;
  }

  static async setMessageTemplates(templates: MessageTemplates): Promise<void> {
    return this.writeConfigFile('messages.json', { templates });
  }

  // Timing Configuration
  static async getTimingConfig(): Promise<TimingConfig> {
    return this.readConfigFile<TimingConfig>('timing.json', DEFAULT_TIMING_CONFIG);
  }

  static async setTimingConfig(config: TimingConfig): Promise<void> {
    return this.writeConfigFile('timing.json', config);
  }

  // Status Settings
  static async getStatusSettings(): Promise<any> {
    return this.readConfigFile<any>('status-settings.json', DEFAULT_STATUS_SETTINGS);
  }

  static async setStatusSettings(settings: any): Promise<void> {
    return this.writeConfigFile('status-settings.json', settings);
  }

  // Get all configurations
  static async getAllConfigs() {
    try {
      const [google, messages, timing, statusSettings] = await Promise.all([
        this.getGoogleConfig(),
        this.getMessageTemplates(),
        this.getTimingConfig(),
        this.getStatusSettings(),
      ]);

      return {
        google,
        messages: messages.templates,
        timing,
        statusSettings: statusSettings || DEFAULT_STATUS_SETTINGS,
      };
    } catch (error) {
      console.error('Error getting all configs:', error);
      // Return defaults if all configs fail
      return {
        google: DEFAULT_GOOGLE_CONFIG,
        messages: DEFAULT_MESSAGE_TEMPLATES,
        timing: DEFAULT_TIMING_CONFIG,
        statusSettings: DEFAULT_STATUS_SETTINGS,
      };
    }
  }

  // Health check for configuration status
  static async getConfigHealth(): Promise<{
    google: { exists: boolean; valid: boolean; configured: boolean };
    messages: { exists: boolean; valid: boolean };
    timing: { exists: boolean; valid: boolean };
    statusSettings: { exists: boolean; valid: boolean };
  }> {
    const health = {
      google: { exists: false, valid: false, configured: false },
      messages: { exists: false, valid: false },
      timing: { exists: false, valid: false },
      statusSettings: { exists: false, valid: false }
    };

    try {
      // Check Google config
      const googleConfig = await this.getGoogleConfig();
      health.google.exists = !!(googleConfig);
      health.google.valid = !!(googleConfig.spreadsheetUrl && googleConfig.credentials);
      health.google.configured = health.google.valid && Object.keys(googleConfig.credentials).length > 0;

      // Check messages
      const messagesConfig = await this.getMessageTemplates();
      health.messages.exists = true;
      health.messages.valid = !!(messagesConfig.templates && messagesConfig.templates.newOrder);

      // Check timing
      const timingConfig = await this.getTimingConfig();
      health.timing.exists = true;
      health.timing.valid = !!(timingConfig.checkIntervalSeconds && timingConfig.reminderDelayHours);

      // Check status settings
      const statusConfig = await this.getStatusSettings();
      health.statusSettings.exists = true;
      health.statusSettings.valid = !!(statusConfig.enabledStatuses);

    } catch (error) {
      console.error('Error checking config health:', error);
    }

    return health;
  }
} 