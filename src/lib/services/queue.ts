import { Queue, Worker, Job } from 'bullmq';
import { WhatsAppService } from './whatsapp';
import { GoogleSheetsService } from './google-sheets';
import { ConfigService } from './config';
import type { SheetRow } from '../types/config';

// Local queue implementation for when Redis is not available
class LocalQueue<T> {
  private jobs: Array<{ id: string; data: T; delay?: number; createdAt: number }> = [];
  private idCounter = 0;

  async add(name: string, data: T, options?: { delay?: number }): Promise<void> {
    this.jobs.push({
      id: `local-${this.idCounter++}`,
      data,
      delay: options?.delay || 0,
      createdAt: Date.now()
    });
  }

  async getWaiting(): Promise<Array<{ data: T }>> {
    const now = Date.now();
    return this.jobs
      .filter(job => now >= job.createdAt + (job.delay || 0))
      .map(job => ({ data: job.data }));
  }

  async getActive(): Promise<Array<{ data: T }>> {
    return [];
  }

  async close(): Promise<void> {
    this.jobs = [];
  }
}

// Redis connection configuration
let redisConnection: any = null;
let useLocalQueue = false;

// Check if we have a valid Redis URL
if (process.env.REDIS_URL) {
  try {
    const url = new URL(process.env.REDIS_URL);
    redisConnection = {
      host: url.hostname,
      port: parseInt(url.port || '6379'),
      password: url.password || undefined,
      username: url.username || 'default'
    };
    console.log('Using Redis URL from environment');
  } catch (error) {
    console.warn('Invalid REDIS_URL, falling back to local queue:', error);
    useLocalQueue = true;
  }
} else if (process.env.NODE_ENV === 'production') {
  console.log('No REDIS_URL in production, using local queue implementation');
  useLocalQueue = true;
} else {
  // Development mode - try localhost
  redisConnection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  };
}

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
  private static messageQueue: Queue<MessageJob> | LocalQueue<MessageJob>;
  private static reminderQueue: Queue<ReminderJob> | LocalQueue<ReminderJob>;
  private static rejectedOfferQueue: Queue<ReminderJob> | LocalQueue<ReminderJob>;
  private static messageWorker: Worker<MessageJob> | null;
  private static reminderWorker: Worker<ReminderJob> | null;
  private static rejectedOfferWorker: Worker<ReminderJob> | null;
  private static localProcessingInterval: NodeJS.Timeout | null = null;

  static async initialize() {
    try {
      if (useLocalQueue) {
        // Use local queue implementation
        console.log('Initializing local queue service (no Redis)...');
        
        this.messageQueue = new LocalQueue<MessageJob>();
        this.reminderQueue = new LocalQueue<ReminderJob>();
        this.rejectedOfferQueue = new LocalQueue<ReminderJob>();
        
        // Start local processing
        this.startLocalProcessing();
        
        console.log('Local queue service initialized successfully');
      } else {
        // Try to use Redis
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

          console.log('Redis queue service initialized successfully');
        } catch (redisError) {
          console.error('Redis connection failed, falling back to local queue:', redisError);
          
          // Fall back to local queue
          useLocalQueue = true;
          this.messageQueue = new LocalQueue<MessageJob>();
          this.reminderQueue = new LocalQueue<ReminderJob>();
          this.rejectedOfferQueue = new LocalQueue<ReminderJob>();
          
          // Start local processing
          this.startLocalProcessing();
          
          console.log('Fallback to local queue service completed');
        }
      }
    } catch (error) {
      console.error('Error initializing queue service:', error);
      // Don't throw - use local queue as last resort
      useLocalQueue = true;
      this.messageQueue = new LocalQueue<MessageJob>();
      this.reminderQueue = new LocalQueue<ReminderJob>();
      this.rejectedOfferQueue = new LocalQueue<ReminderJob>();
      this.startLocalProcessing();
    }
  }

  private static startLocalProcessing() {
    // Process local queue every 5 seconds
    this.localProcessingInterval = setInterval(async () => {
      try {
        // Process message queue
        const messageJobs = await (this.messageQueue as LocalQueue<MessageJob>).getWaiting();
        for (const job of messageJobs) {
          try {
            await this.processMessageJob({ data: job.data } as Job<MessageJob>);
          } catch (error) {
            console.error('Error processing local message job:', error);
          }
        }

        // Process reminder queue
        const reminderJobs = await (this.reminderQueue as LocalQueue<ReminderJob>).getWaiting();
        for (const job of reminderJobs) {
          try {
            await this.processReminderJob({ data: job.data } as Job<ReminderJob>);
          } catch (error) {
            console.error('Error processing local reminder job:', error);
          }
        }

        // Process rejected offer queue
        const rejectedJobs = await (this.rejectedOfferQueue as LocalQueue<ReminderJob>).getWaiting();
        for (const job of rejectedJobs) {
          try {
            await this.processRejectedOfferJob({ data: job.data } as Job<ReminderJob>);
          } catch (error) {
            console.error('Error processing local rejected offer job:', error);
          }
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
    if (useLocalQueue) {
      await (this.messageQueue as LocalQueue<MessageJob>).add('send-message', jobData, {
        // Add small delay to prevent rate limiting
        delay: Math.random() * 2000 + 1000, // 1-3 seconds random delay
      });
    } else {
      await this.messageQueue.add('send-message', jobData, {
        // Add small delay to prevent rate limiting
        delay: Math.random() * 2000 + 1000, // 1-3 seconds random delay
      });
    }
  }

  // Add delayed reminder job
  static async addReminderJob(jobData: ReminderJob, delayHours: number): Promise<void> {
    if (useLocalQueue) {
      await (this.reminderQueue as LocalQueue<ReminderJob>).add('send-reminder', jobData, {
        delay: delayHours * 60 * 60 * 1000, // Convert hours to milliseconds
      });
    } else {
      await this.reminderQueue.add('send-reminder', jobData, {
        delay: delayHours * 60 * 60 * 1000, // Convert hours to milliseconds
      });
    }
  }

  // Add delayed rejected offer job
  static async addRejectedOfferJob(jobData: ReminderJob, delayHours: number): Promise<void> {
    if (useLocalQueue) {
      await (this.rejectedOfferQueue as LocalQueue<ReminderJob>).add('send-rejected-offer', jobData, {
        delay: delayHours * 60 * 60 * 1000, // Convert hours to milliseconds
      });
    } else {
      await this.rejectedOfferQueue.add('send-rejected-offer', jobData, {
        delay: delayHours * 60 * 60 * 1000, // Convert hours to milliseconds
      });
    }
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
    if (useLocalQueue) {
      const [messageWaiting, messageActive, reminderWaiting, rejectedWaiting] = await Promise.all([
        (this.messageQueue as LocalQueue<MessageJob>).getWaiting(),
        (this.messageQueue as LocalQueue<MessageJob>).getActive(),
        (this.reminderQueue as LocalQueue<ReminderJob>).getWaiting(),
        (this.rejectedOfferQueue as LocalQueue<ReminderJob>).getWaiting(),
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
  }

  // Clean up resources
  static async cleanup() {
    if (useLocalQueue) {
      if (this.localProcessingInterval) {
        clearInterval(this.localProcessingInterval);
        this.localProcessingInterval = null;
      }
      await (this.messageQueue as LocalQueue<MessageJob>).close();
      await (this.reminderQueue as LocalQueue<ReminderJob>).close();
      await (this.rejectedOfferQueue as LocalQueue<ReminderJob>).close();
    } else {
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
} 