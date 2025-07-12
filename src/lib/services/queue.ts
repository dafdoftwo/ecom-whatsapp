import { Queue, Worker, Job } from 'bullmq';
import { WhatsAppService } from './whatsapp';
import { GoogleSheetsService } from './google-sheets';
import { ConfigService } from './config';
import type { SheetRow } from '../types/config';

// Redis connection configuration
const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
};

export interface MessageJob {
  phoneNumber: string;
  message: string;
  orderId: string;
  rowIndex: number;
  messageType: 'newOrder' | 'noAnswer' | 'reminder' | 'rejectedOffer' | 'shipped' | 'welcome' | 'confirmed' | 'delivered' | 'cancelled';
}

export interface ReminderJob {
  orderId: string;
  rowIndex: number;
  phoneNumber: string;
  customerName: string;
  orderStatus: string;
}

export class QueueService {
  private static messageQueue: Queue<MessageJob>;
  private static reminderQueue: Queue<ReminderJob>;
  private static rejectedOfferQueue: Queue<ReminderJob>;
  private static messageWorker: Worker<MessageJob>;
  private static reminderWorker: Worker<ReminderJob>;
  private static rejectedOfferWorker: Worker<ReminderJob>;

  static async initialize() {
    try {
      // Initialize queues
      this.messageQueue = new Queue<MessageJob>('message-queue', {
        connection: redisConnection,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      });

      this.reminderQueue = new Queue<ReminderJob>('reminder-queue', {
        connection: redisConnection,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      });

      this.rejectedOfferQueue = new Queue<ReminderJob>('rejected-offer-queue', {
        connection: redisConnection,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      });

      // Initialize workers
      this.messageWorker = new Worker<MessageJob>(
        'message-queue',
        this.processMessageJob.bind(this),
        { connection: redisConnection }
      );

      this.reminderWorker = new Worker<ReminderJob>(
        'reminder-queue',
        this.processReminderJob.bind(this),
        { connection: redisConnection }
      );

      this.rejectedOfferWorker = new Worker<ReminderJob>(
        'rejected-offer-queue',
        this.processRejectedOfferJob.bind(this),
        { connection: redisConnection }
      );

      // Set up error handlers
      this.setupErrorHandlers();

      console.log('Queue service initialized successfully');
    } catch (error) {
      console.error('Error initializing queue service:', error);
      throw error;
    }
  }

  private static setupErrorHandlers() {
    this.messageWorker.on('failed', (job, err) => {
      console.error(`Message job ${job?.id} failed:`, err);
    });

    this.reminderWorker.on('failed', (job, err) => {
      console.error(`Reminder job ${job?.id} failed:`, err);
    });

    this.rejectedOfferWorker.on('failed', (job, err) => {
      console.error(`Rejected offer job ${job?.id} failed:`, err);
    });
  }

  // Add immediate message to queue
  static async addMessageJob(jobData: MessageJob): Promise<void> {
    await this.messageQueue.add('send-message', jobData, {
      // Add small delay to prevent rate limiting
      delay: Math.random() * 2000 + 1000, // 1-3 seconds random delay
    });
  }

  // Add delayed reminder job
  static async addReminderJob(jobData: ReminderJob, delayHours: number): Promise<void> {
    await this.reminderQueue.add('send-reminder', jobData, {
      delay: delayHours * 60 * 60 * 1000, // Convert hours to milliseconds
    });
  }

  // Add delayed rejected offer job
  static async addRejectedOfferJob(jobData: ReminderJob, delayHours: number): Promise<void> {
    await this.rejectedOfferQueue.add('send-rejected-offer', jobData, {
      delay: delayHours * 60 * 60 * 1000, // Convert hours to milliseconds
    });
  }

  // Process message job
  private static async processMessageJob(job: Job<MessageJob>): Promise<void> {
    const { phoneNumber, message, orderId, rowIndex, messageType } = job.data;
    
    try {
      const whatsapp = WhatsAppService.getInstance();
      const success = await whatsapp.sendMessage(phoneNumber, message);
      
      if (success) {
        // Update Google Sheets with the sent message status - DISABLED (READ-ONLY MODE)
        // await GoogleSheetsService.updateWhatsAppStatus(
        //   rowIndex,
        //   `${messageType} sent`,
        //   message.substring(0, 50) + '...'
        // );
        console.log(`🔒 READ-ONLY: Would update row ${rowIndex} with status: ${messageType} sent`);
        console.log(`Message sent successfully to ${phoneNumber} for order ${orderId}`);
      } else {
        throw new Error('Failed to send WhatsApp message');
      }
    } catch (error) {
      console.error(`Error processing message job for order ${orderId}:`, error);
      
      // Update Google Sheets with error status - DISABLED (READ-ONLY MODE)
      // await GoogleSheetsService.updateWhatsAppStatus(
      //   rowIndex,
      //   'message failed',
      //   `Error: ${error}`
      // );
      console.log(`🔒 READ-ONLY: Would update row ${rowIndex} with error status: message failed`);
      
      throw error;
    }
  }

  // Process reminder job
  private static async processReminderJob(job: Job<ReminderJob>): Promise<void> {
    const { orderId, rowIndex, phoneNumber, customerName, orderStatus } = job.data;
    
    try {
      // Get current sheet data to check if status has changed
      const sheetData = await GoogleSheetsService.getSheetData() as (SheetRow & { rowIndex: number })[];
      const currentRow = sheetData.find((row) => row.orderId === orderId);
      
      if (!currentRow || currentRow.orderStatus !== orderStatus) {
        console.log(`Order ${orderId} status has changed, skipping reminder`);
        return;
      }

      // Get message template
      const { templates } = await ConfigService.getMessageTemplates();
      const message = templates.reminder
        .replace('{name}', customerName)
        .replace('{orderId}', orderId);

      // Send reminder message
      const messageJob: MessageJob = {
        phoneNumber,
        message,
        orderId,
        rowIndex,
        messageType: 'reminder',
      };

      await this.addMessageJob(messageJob);
      console.log(`Reminder job scheduled for order ${orderId}`);
    } catch (error) {
      console.error(`Error processing reminder job for order ${orderId}:`, error);
      throw error;
    }
  }

  // Process rejected offer job
  private static async processRejectedOfferJob(job: Job<ReminderJob>): Promise<void> {
    const { orderId, rowIndex, phoneNumber, customerName } = job.data;
    
    try {
      // Get current sheet data to check if status is still rejected
      const sheetData = await GoogleSheetsService.getSheetData() as (SheetRow & { rowIndex: number })[];
      const currentRow = sheetData.find((row) => row.orderId === orderId);
      
      if (!currentRow || (currentRow.orderStatus !== 'مرفوض' && currentRow.orderStatus !== 'تم الرفض')) {
        console.log(`Order ${orderId} status has changed from rejected, skipping offer`);
        return;
      }

      // Get message template
      const { templates } = await ConfigService.getMessageTemplates();
      
      // Calculate discount amounts
      const originalAmount = parseFloat(currentRow.totalPrice?.toString() || '0');
      const discountedAmount = Math.round(originalAmount * 0.8); // 20% discount
      const savedAmount = originalAmount - discountedAmount;
      
      // Replace variables in the message
      const message = templates.rejectedOffer
        .replace(/{name}/g, customerName)
        .replace(/{orderId}/g, orderId)
        .replace(/{amount}/g, originalAmount.toString())
        .replace(/{discountedAmount}/g, discountedAmount.toString())
        .replace(/{savedAmount}/g, savedAmount.toString())
        .replace(/{productName}/g, currentRow.productName || 'المنتج')
        .replace(/{companyName}/g, 'متجرنا');

      // Send rejected offer message
      const messageJob: MessageJob = {
        phoneNumber,
        message,
        orderId,
        rowIndex,
        messageType: 'rejectedOffer',
      };

      await this.addMessageJob(messageJob);
      console.log(`🎁 Rejected offer sent for order ${orderId} - 20% discount offer`);
    } catch (error) {
      console.error(`Error processing rejected offer job for order ${orderId}:`, error);
      throw error;
    }
  }

  // Get queue statistics
  static async getQueueStats() {
    const [messageWaiting, messageActive, reminderWaiting, rejectedWaiting] = await Promise.all([
      this.messageQueue.getWaiting(),
      this.messageQueue.getActive(),
      this.reminderQueue.getWaiting(),
      this.rejectedOfferQueue.getWaiting(),
    ]);

    return {
      messageQueue: {
        waiting: messageWaiting.length,
        active: messageActive.length,
      },
      reminderQueue: {
        waiting: reminderWaiting.length,
      },
      rejectedOfferQueue: {
        waiting: rejectedWaiting.length,
      },
    };
  }

  // Clean up resources
  static async cleanup() {
    await Promise.all([
      this.messageWorker?.close(),
      this.reminderWorker?.close(),
      this.rejectedOfferWorker?.close(),
      this.messageQueue?.close(),
      this.reminderQueue?.close(),
      this.rejectedOfferQueue?.close(),
    ]);
  }
} 