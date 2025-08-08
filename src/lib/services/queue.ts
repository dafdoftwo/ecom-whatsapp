import { Queue, Worker, Job } from 'bullmq';
import { WhatsAppService } from './whatsapp';
import { GoogleSheetsService } from './google-sheets';
import { NetworkResilienceService } from './network-resilience';
import { ConfigService } from './config';
import type { SheetRow } from '../types/config';

export interface MessageJob {
  phoneNumber: string;
  message: string;
  orderId: string;
  rowIndex: number;
  messageType: 'newOrder' | 'noAnswer' | 'shipped' | 'rejectedOffer' | 'reminder';
}

export interface ReminderJob {
  orderId: string;
  rowIndex: number;
  phoneNumber: string;
  customerName: string;
  orderStatus: string;
}

// Local queue implementation for development/fallback
class LocalQueue<T> {
  private items: Array<T & { delay?: number }> = [];
  private isProcessing = false;

  async add(data: T, options?: { delay?: number }): Promise<void> {
    this.items.push({ ...data, delay: options?.delay || 0 });
  }

  async close(): Promise<void> {
    this.items = [];
    this.isProcessing = false;
  }

  size(): number {
    return this.items.length;
  }

  // Add method to get items for external processing
  get currentItems(): Array<T & { delay?: number }> {
    return [...this.items];
  }

  // Clear processed items
  clearItems(): void {
    this.items = [];
  }
}

interface QueueConfig {
  connection?: {
    host: string;
    port: number;
    password?: string;
  };
}

export class QueueService {
  private static isInitialized = false;
  private static useRedis = false;
  private static messageQueue: Queue<MessageJob> | LocalQueue<MessageJob>;
  private static reminderQueue: Queue<ReminderJob> | LocalQueue<ReminderJob>;
  private static rejectedOfferQueue: Queue<ReminderJob> | LocalQueue<ReminderJob>;
  private static messageWorker: Worker<MessageJob> | null;
  private static reminderWorker: Worker<ReminderJob> | null;
  private static rejectedOfferWorker: Worker<ReminderJob> | null;
  private static localProcessingInterval: NodeJS.Timeout | null = null;

  private static async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      try {
        await this.initialize();
      } catch (e) {
        console.warn('⚠️ Queue initialization failed, forcing local fallback:', e);
        // Force local fallback
        this.useRedis = false;
        this.messageQueue = new LocalQueue<MessageJob>();
        this.reminderQueue = new LocalQueue<ReminderJob>();
        this.rejectedOfferQueue = new LocalQueue<ReminderJob>();
        this.startLocalProcessing();
        this.isInitialized = true;
      }
    }
  }

  static async initialize() {
    try {
      if (process.env.REDIS_URL) {
        try {
          // Initialize queues with Redis
          this.messageQueue = new Queue<MessageJob>('message-queue', {
            connection: {
              host: new URL(process.env.REDIS_URL).hostname,
              port: parseInt(new URL(process.env.REDIS_URL).port || '6379'),
              password: new URL(process.env.REDIS_URL).password || undefined,
            },
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
            connection: {
              host: new URL(process.env.REDIS_URL).hostname,
              port: parseInt(new URL(process.env.REDIS_URL).port || '6379'),
              password: new URL(process.env.REDIS_URL).password || undefined,
            },
            defaultJobOptions: {
              removeOnComplete: 100,
              removeOnFail: 50,
            },
          });

          this.rejectedOfferQueue = new Queue<ReminderJob>('rejected-offer-queue', {
            connection: {
              host: new URL(process.env.REDIS_URL).hostname,
              port: parseInt(new URL(process.env.REDIS_URL).port || '6379'),
              password: new URL(process.env.REDIS_URL).password || undefined,
            },
            defaultJobOptions: {
              removeOnComplete: 100,
              removeOnFail: 50,
            },
          });

          // Initialize workers
          this.messageWorker = new Worker<MessageJob>('message-queue', async (job) => {
            await this.processMessageJob(job);
          }, {
            connection: {
              host: new URL(process.env.REDIS_URL).hostname,
              port: parseInt(new URL(process.env.REDIS_URL).port || '6379'),
              password: new URL(process.env.REDIS_URL).password || undefined,
            },
            concurrency: 1,
          });

          this.reminderWorker = new Worker<ReminderJob>('reminder-queue', async (job) => {
            await this.processReminderJob(job);
          }, {
            connection: {
              host: new URL(process.env.REDIS_URL).hostname,
              port: parseInt(new URL(process.env.REDIS_URL).port || '6379'),
              password: new URL(process.env.REDIS_URL).password || undefined,
            },
            concurrency: 1,
          });

          this.rejectedOfferWorker = new Worker<ReminderJob>('rejected-offer-queue', async (job) => {
            await this.processRejectedOfferJob(job);
          }, {
            connection: {
              host: new URL(process.env.REDIS_URL).hostname,
              port: parseInt(new URL(process.env.REDIS_URL).port || '6379'),
              password: new URL(process.env.REDIS_URL).password || undefined,
            },
            concurrency: 1,
          });

          // Set up error handlers
          this.setupErrorHandlers();

          console.log('Redis queue service initialized successfully');
        } catch (redisError) {
          console.warn('⚠️ Redis unavailable, switching to local fallback:', redisError);
          this.useRedis = false;
        }
      }

      if (!this.useRedis) {
        // Local fallback queues
        this.messageQueue = new LocalQueue<MessageJob>();
        this.reminderQueue = new LocalQueue<ReminderJob>();
        this.rejectedOfferQueue = new LocalQueue<ReminderJob>();
        this.messageWorker = null;
        this.reminderWorker = null;
        this.rejectedOfferWorker = null;
        this.startLocalProcessing();
      }

      this.setupErrorHandlers();
      this.isInitialized = true;
    } catch (error) {
      console.error('Error initializing queue service:', error);
      throw error;
    }
  }

  private static startLocalProcessing() {
    // Process local queue every 5 seconds
    this.localProcessingInterval = setInterval(async () => {
      try {
        // Process message queue
        const messageJobs = (this.messageQueue as LocalQueue<MessageJob>).currentItems;
        if (messageJobs.length > 0) {
          console.log(`📱 Processing ${messageJobs.length} local message jobs...`);
          for (const job of messageJobs) {
            try {
              // Apply delay if specified
              if (job.delay && job.delay > 0) {
                await new Promise(resolve => setTimeout(resolve, job.delay));
              }
              
              // Create proper job structure
              const jobData = { data: job as MessageJob };
              await this.processMessageJob(jobData as Job<MessageJob>);
            } catch (error) {
              console.error('Error processing local message job:', error);
            }
          }
          // Clear processed items
          (this.messageQueue as LocalQueue<MessageJob>).clearItems();
        }

        // Process reminder queue
        const reminderJobs = (this.reminderQueue as LocalQueue<ReminderJob>).currentItems;
        if (reminderJobs.length > 0) {
          console.log(`⏰ Processing ${reminderJobs.length} local reminder jobs...`);
          for (const job of reminderJobs) {
            try {
              // Apply delay if specified
              if (job.delay && job.delay > 0) {
                await new Promise(resolve => setTimeout(resolve, job.delay));
              }
              
              // Create proper job structure
              const jobData = { data: job as ReminderJob };
              await this.processReminderJob(jobData as Job<ReminderJob>);
            } catch (error) {
              console.error('Error processing local reminder job:', error);
            }
          }
          // Clear processed items
          (this.reminderQueue as LocalQueue<ReminderJob>).clearItems();
        }

        // Process rejected offer queue
        const rejectedJobs = (this.rejectedOfferQueue as LocalQueue<ReminderJob>).currentItems;
        if (rejectedJobs.length > 0) {
          console.log(`❌ Processing ${rejectedJobs.length} local rejected offer jobs...`);
          for (const job of rejectedJobs) {
            try {
              // Apply delay if specified
              if (job.delay && job.delay > 0) {
                await new Promise(resolve => setTimeout(resolve, job.delay));
              }
              
              // Create proper job structure with proper ReminderJob interface
              const reminderJobData: ReminderJob = {
                orderId: job.orderId,
                rowIndex: job.rowIndex,
                phoneNumber: job.phoneNumber,
                customerName: job.customerName,
                orderStatus: 'رفض الاستلام' // Default status for rejected offers
              };
              const jobData = { data: reminderJobData };
              await this.processRejectedOfferJob(jobData as Job<ReminderJob>);
            } catch (error) {
              console.error('Error processing local rejected offer job:', error);
            }
          }
          // Clear processed items
          (this.rejectedOfferQueue as LocalQueue<ReminderJob>).clearItems();
        }
      } catch (error) {
        console.error('Error in local queue processing:', error);
      }
    }, 5000);
  }

  private static setupErrorHandlers() {
    this.messageWorker?.on('failed', (job, err) => {
      console.error(`Message job ${job?.id} failed:`, err);
    });

    this.reminderWorker?.on('failed', (job, err) => {
      console.error(`Reminder job ${job?.id} failed:`, err);
    });

    this.rejectedOfferWorker?.on('failed', (job, err) => {
      console.error(`Rejected offer job ${job?.id} failed:`, err);
    });
  }

  // Add immediate message to queue
  static async addMessageJob(jobData: MessageJob): Promise<void> {
    await this.ensureInitialized();
    if (this.useRedis) {
      await (this.messageQueue as Queue<MessageJob>).add('send-message', jobData, {
        delay: Math.random() * 2000 + 1000,
      });
    } else {
      await (this.messageQueue as LocalQueue<MessageJob>).add(jobData, {
        delay: Math.random() * 2000 + 1000,
      });
    }
  }

  // Add delayed reminder job
  static async addReminderJob(jobData: ReminderJob, delayHours: number): Promise<void> {
    await this.ensureInitialized();
    if (this.useRedis) {
      await (this.reminderQueue as Queue<ReminderJob>).add('send-reminder', jobData, {
        delay: delayHours * 60 * 60 * 1000,
      });
    } else {
      await (this.reminderQueue as LocalQueue<ReminderJob>).add(jobData, {
        delay: delayHours * 60 * 60 * 1000,
      });
    }
  }

  // Add delayed rejected offer job
  static async addRejectedOfferJob(jobData: ReminderJob, delayHours: number): Promise<void> {
    await this.ensureInitialized();
    if (this.useRedis) {
      await (this.rejectedOfferQueue as Queue<ReminderJob>).add('send-rejected-offer', jobData, {
        delay: delayHours * 60 * 60 * 1000,
      });
    } else {
      await (this.rejectedOfferQueue as LocalQueue<ReminderJob>).add(jobData, {
        delay: delayHours * 60 * 60 * 1000,
      });
    }
  }

  // Process message job
  static async processMessageJob(job: Job<MessageJob>): Promise<void> {
    const { phoneNumber, message, orderId, rowIndex, messageType } = job.data;
    
    try {
      console.log(`📱 Processing message job for order ${orderId} with network resilience...`);
      
      // Use NetworkResilienceService for resilient WhatsApp message sending
      const success = await NetworkResilienceService.sendWhatsAppMessageResilient(phoneNumber, message);
      
      if (success) {
        // Update Google Sheets with the sent message status - DISABLED (READ-ONLY MODE)
        // await GoogleSheetsService.updateWhatsAppStatus(
        //   rowIndex,
        //   `${messageType} sent`,
        //   message.substring(0, 50) + '...'
        // );
        console.log(`🔒 READ-ONLY: Would update row ${rowIndex} with status: ${messageType} sent`);
        console.log(`✅ Message sent successfully to ${phoneNumber} for order ${orderId} (resilient)`);
      } else {
        throw new Error('Failed to send WhatsApp message');
      }
    } catch (error) {
      console.error(`❌ Error processing message job for order ${orderId}:`, error);
      
      // Log network resilience stats for debugging
      const stats = NetworkResilienceService.getStats();
      console.error(`Network stats: ${stats.totalRetries} retries, circuit breaker: ${stats.circuitBreakerState}`);
      
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
  static async processReminderJob(job: Job<ReminderJob>): Promise<void> {
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
  static async processRejectedOfferJob(job: Job<ReminderJob>): Promise<void> {
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
    if (this.useRedis) {
      const [messageWaiting, messageActive, reminderWaiting, rejectedWaiting] = await Promise.all([
        (this.messageQueue as Queue<MessageJob>).getWaiting(),
        (this.messageQueue as Queue<MessageJob>).getActive(),
        (this.reminderQueue as Queue<ReminderJob>).getWaiting(),
        (this.rejectedOfferQueue as Queue<ReminderJob>).getWaiting(),
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
    } else {
      const [messageWaiting, messageActive, reminderWaiting, rejectedWaiting] = await Promise.all([
        (this.messageQueue as LocalQueue<MessageJob>).size(),
        (this.messageQueue as LocalQueue<MessageJob>).size(), // Active jobs are not tracked in LocalQueue
        (this.reminderQueue as LocalQueue<ReminderJob>).size(),
        (this.rejectedOfferQueue as LocalQueue<ReminderJob>).size(),
      ]);

      return {
        messageQueue: {
          waiting: messageWaiting,
          active: messageActive,
        },
        reminderQueue: {
          waiting: reminderWaiting,
        },
        rejectedOfferQueue: {
          waiting: rejectedWaiting,
        },
      };
    }
  }

  // Clean up resources
  static async cleanup() {
    if (this.useRedis) {
      // No explicit close needed for BullMQ jobs, they are managed by the queue itself
      // await Promise.all([
      //   this.messageWorker?.close(),
      //   this.reminderWorker?.close(),
      //   this.rejectedOfferWorker?.close(),
      //   this.messageQueue?.close(),
      //   this.reminderQueue?.close(),
      //   this.rejectedOfferQueue?.close(),
      // ]);
    } else {
      if (this.localProcessingInterval) {
        clearInterval(this.localProcessingInterval);
        this.localProcessingInterval = null;
      }
      await (this.messageQueue as LocalQueue<MessageJob>).close();
      await (this.reminderQueue as LocalQueue<ReminderJob>).close();
      await (this.rejectedOfferQueue as LocalQueue<ReminderJob>).close();
    }
  }
} 