import { NextResponse } from 'next/server';
import { AutomationEngine } from '@/lib/services/automation-engine';
import { QueueService } from '@/lib/services/queue';
import { WhatsAppService } from '@/lib/services/whatsapp';

export async function GET() {
  try {
    // Get detailed stats from automation engine with error handling
    let detailedStats;
    try {
      detailedStats = await AutomationEngine.getDetailedStats();
    } catch (error) {
      console.log('Google Sheets not configured yet, using default stats');
      // Return default stats when Google Sheets is not configured
      detailedStats = {
        engine: {
          isRunning: false,
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
        orderStatuses: {},
        egyptianStats: {
          supportedStatuses: [
            'قيد المراجعة',
            'لا يرد', 
            'رفض الاستلام',
            'تم التاكيد',
            'تم الشحن',
            'تم التوصيل'
          ],
          totalProcessed: 0,
          pendingOffers: 0,
        }
      };
    }
    
    // Get queue statistics
    let queueStats;
    try {
      queueStats = await QueueService.getQueueStats();
    } catch (error) {
      console.log('Queue service not initialized, using default queue stats');
      queueStats = {
        messageQueue: { waiting: 0, active: 0, completed: 0, failed: 0 },
        reminderQueue: { waiting: 0, active: 0, completed: 0, failed: 0 },
        rejectedOfferQueue: { waiting: 0, active: 0, completed: 0, failed: 0 }
      };
    }
    
    // Get WhatsApp status
    const whatsapp = WhatsAppService.getInstance();
    const whatsappStatus = whatsapp.getStatus();
    
    // Calculate total queue counts
    const totalWaiting = queueStats.messageQueue.waiting + queueStats.reminderQueue.waiting + queueStats.rejectedOfferQueue.waiting;
    const totalActive = queueStats.messageQueue.active;
    
    // Combine all statistics
    const combinedStats = {
      engine: detailedStats.engine,
      processing: detailedStats.processing,
      phoneNumbers: detailedStats.phoneNumbers,
      orderStatuses: detailedStats.orderStatuses,
      queue: queueStats,
      whatsapp: {
        isConnected: whatsappStatus.isConnected,
        sessionStatus: whatsappStatus.sessionExists ? 'exists' : 'none',
        clientInfo: whatsappStatus.clientInfo,
      },
      summary: {
        totalProcessed: detailedStats.processing.validOrders,
        totalFailed: detailedStats.processing.invalidOrders,
        queuedMessages: totalWaiting + totalActive,
        systemHealth: calculateSystemHealth(detailedStats, queueStats, whatsappStatus),
      },
      egyptianStats: detailedStats.egyptianStats,
      configurationStatus: {
        googleConfigured: detailedStats.processing.totalOrders > 0,
        whatsappConfigured: whatsappStatus.sessionExists,
        messagesConfigured: true // Always true as we have defaults
      }
    };

    return NextResponse.json(combinedStats);
  } catch (error) {
    console.error('Error getting automation status:', error);
    return NextResponse.json(
      { error: 'Failed to get automation status' },
      { status: 500 }
    );
  }
}

function calculateSystemHealth(
  detailedStats: any,
  queueStats: any,
  whatsappStatus: ReturnType<typeof WhatsAppService.prototype.getStatus>
): 'excellent' | 'good' | 'warning' | 'critical' {
  let score = 100;

  // Deduct points for various issues
  if (!detailedStats.engine.isRunning) score -= 30;
  if (!whatsappStatus.isConnected) score -= 25;
  if (detailedStats.processing.totalOrders === 0) score -= 20; // Google not configured
  if (detailedStats.processing.invalidOrders > detailedStats.processing.validOrders * 0.2) score -= 20;
  
  // Check if there are too many waiting jobs (potential bottleneck)
  const totalWaiting = queueStats.messageQueue.waiting + queueStats.reminderQueue.waiting + queueStats.rejectedOfferQueue.waiting;
  if (totalWaiting > 50) score -= 15; // Arbitrary threshold
  
  if (detailedStats.phoneNumbers.invalid > detailedStats.phoneNumbers.valid * 0.3) score -= 10;

  if (score >= 90) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'warning';
  return 'critical';
} 