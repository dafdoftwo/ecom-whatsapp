import fs from 'fs/promises';
import path from 'path';
import type { GoogleConfig, MessageTemplates, TimingConfig } from '../types/config';

const CONFIG_DIR = path.join(process.cwd(), 'config');

export class ConfigService {
  private static async readConfigFile<T>(filename: string): Promise<T> {
    try {
      const filePath = path.join(CONFIG_DIR, filename);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`Error reading config file ${filename}:`, error);
      throw new Error(`Failed to read configuration file: ${filename}`);
    }
  }

  private static async writeConfigFile<T>(filename: string, data: T): Promise<void> {
    try {
      const filePath = path.join(CONFIG_DIR, filename);
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error(`Error writing config file ${filename}:`, error);
      throw new Error(`Failed to write configuration file: ${filename}`);
    }
  }

  // Google Configuration
  static async getGoogleConfig(): Promise<GoogleConfig> {
    return this.readConfigFile<GoogleConfig>('google.json');
  }

  static async setGoogleConfig(config: GoogleConfig): Promise<void> {
    return this.writeConfigFile('google.json', config);
  }

  // Message Templates
  static async getMessageTemplates(): Promise<{ templates: MessageTemplates }> {
    return this.readConfigFile<{ templates: MessageTemplates }>('messages.json');
  }

  static async setMessageTemplates(templates: MessageTemplates): Promise<void> {
    return this.writeConfigFile('messages.json', { templates });
  }

  // Timing Configuration
  static async getTimingConfig(): Promise<TimingConfig> {
    return this.readConfigFile<TimingConfig>('timing.json');
  }

  static async setTimingConfig(config: TimingConfig): Promise<void> {
    return this.writeConfigFile('timing.json', config);
  }

  // Get all configurations
  static async getAllConfigs() {
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
      statusSettings: statusSettings || {
        enabledStatuses: {
          newOrder: true,
          noAnswer: true,
          shipped: true,
          rejectedOffer: true,
          reminder: true
        }
      },
    };
  }

  // Status Settings
  static async getStatusSettings(): Promise<any> {
    try {
      return await this.readConfigFile<any>('status-settings.json');
    } catch (error) {
      // Return default settings if file doesn't exist
      return {
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
    }
  }

  static async setStatusSettings(settings: any): Promise<void> {
    return this.writeConfigFile('status-settings.json', settings);
  }
} 