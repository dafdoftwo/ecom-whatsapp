import { NextResponse } from 'next/server';
import { WhatsAppService } from '@/lib/services/whatsapp';

export async function GET() {
  try {
    const whatsapp = WhatsAppService.getInstance();
    
    // Get comprehensive status
    const status = whatsapp.getStatus();
    const health = whatsapp.getConnectionHealth();
    const sessionInfo = await whatsapp.getDetailedSessionInfo();
    
    // Determine connection quality
    let connectionQuality = 'excellent';
    if (health.reconnectAttempts > 0) {
      connectionQuality = 'good';
    }
    if (health.reconnectAttempts > 2) {
      connectionQuality = 'poor';
    }
    if (health.sessionHealth === 'critical') {
      connectionQuality = 'critical';
    }
    
    // Calculate uptime in human readable format
    const uptimeSeconds = Math.floor(health.totalUptime / 1000);
    const uptimeMinutes = Math.floor(uptimeSeconds / 60);
    const uptimeHours = Math.floor(uptimeMinutes / 60);
    const uptimeDisplay = `${uptimeHours}h ${uptimeMinutes % 60}m ${uptimeSeconds % 60}s`;
    
    // Prepare response
    const response = {
      success: true,
      connection: {
        isConnected: status.isConnected,
        quality: connectionQuality,
        uptime: uptimeDisplay,
        uptimeMs: health.totalUptime,
        clientInfo: status.clientInfo,
        qrCode: status.qrCode
      },
      session: {
        exists: sessionInfo.exists,
        isValid: sessionInfo.isValid,
        health: sessionInfo.health,
        canRestore: sessionInfo.canRestore,
        size: sessionInfo.size,
        lastModified: sessionInfo.lastModified
      },
      health: {
        sessionHealth: health.sessionHealth,
        reconnectAttempts: health.reconnectAttempts,
        browserRestarts: health.browserRestarts,
        lastHeartbeat: health.lastHeartbeat,
        isInitializing: health.isInitializing
      },
      recommendations: {
        shouldClearSession: health.sessionHealth === 'critical',
        shouldReconnect: !status.isConnected && sessionInfo.canRestore,
        needsQRScan: !sessionInfo.exists || !sessionInfo.isValid
      },
      timestamp: new Date().toISOString()
    };
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('Error getting persistent connection status:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to get connection status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;
    
    const whatsapp = WhatsAppService.getInstance();
    
    switch (action) {
      case 'initialize': {
        console.log('🚀 Persistent connection initialization requested');
        const result = await whatsapp.smartInitialize();
        return NextResponse.json({
          success: result.success,
          needsQR: result.needsQR,
          message: result.message,
          status: whatsapp.getStatus(),
          health: whatsapp.getConnectionHealth()
        });
      }
      
      case 'reconnect': {
        console.log('🔄 Force reconnection requested');
        try {
          await whatsapp.forceReconnect();
          return NextResponse.json({
            success: true,
            message: 'Reconnection initiated successfully',
            status: whatsapp.getStatus(),
            health: whatsapp.getConnectionHealth()
          });
        } catch (error) {
          return NextResponse.json({
            success: false,
            message: 'Failed to initiate reconnection',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      case 'clear-session': {
        console.log('🗑️ Session clearing requested');
        try {
          await whatsapp.clearSession();
          return NextResponse.json({
            success: true,
            message: 'Session cleared successfully',
            status: whatsapp.getStatus(),
            health: whatsapp.getConnectionHealth()
          });
        } catch (error) {
          return NextResponse.json({
            success: false,
            message: 'Failed to clear session',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      case 'health-check': {
        console.log('🏥 Health check requested');
        const status = whatsapp.getStatus();
        const health = whatsapp.getConnectionHealth();
        
        // Perform comprehensive health assessment
        const issues = [];
        const recommendations = [];
        
        if (!status.isConnected) {
          issues.push('WhatsApp is not connected');
          if (status.sessionExists) {
            recommendations.push('Try reconnecting');
          } else {
            recommendations.push('Scan QR code to authenticate');
          }
        }
        
        if (health.reconnectAttempts > 3) {
          issues.push('Multiple reconnection attempts detected');
          recommendations.push('Consider clearing session and starting fresh');
        }
        
        if (health.sessionHealth === 'critical') {
          issues.push('Session health is critical');
          recommendations.push('Clear session immediately');
        }
        
        if (health.browserRestarts > 2) {
          issues.push('Multiple browser restarts detected');
          recommendations.push('System may need restart');
        }
        
        return NextResponse.json({
          success: true,
          isHealthy: issues.length === 0,
          issues,
          recommendations,
          status,
          health,
          timestamp: new Date().toISOString()
        });
      }
      
      case 'restart-browser': {
        console.log('🔄 Browser restart requested');
        try {
          // Clear session and reinitialize
          await whatsapp.clearSession();
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
          const result = await whatsapp.smartInitialize();
          
          return NextResponse.json({
            success: true,
            message: 'Browser restarted successfully',
            needsQR: result.needsQR,
            status: whatsapp.getStatus(),
            health: whatsapp.getConnectionHealth()
          });
        } catch (error) {
          return NextResponse.json({
            success: false,
            message: 'Failed to restart browser',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      default:
        return NextResponse.json(
          { 
            success: false,
            error: 'Invalid action',
            validActions: ['initialize', 'reconnect', 'clear-session', 'health-check', 'restart-browser']
          },
          { status: 400 }
        );
    }
    
  } catch (error) {
    console.error('Error in persistent connection action:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to execute action',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 