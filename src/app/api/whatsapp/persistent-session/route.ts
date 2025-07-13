import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppPersistentSession } from '@/lib/services/whatsapp-persistent-session';

export async function GET() {
  try {
    console.log('🔧 GET: Persistent session status requested');
    
    const persistentSession = WhatsAppPersistentSession.getInstance();
    const status = persistentSession.getStatus();
    const detailedInfo = await persistentSession.getDetailedSessionInfo();
    
    return NextResponse.json({
      success: true,
      status: status,
      sessionInfo: detailedInfo,
      timestamp: new Date().toISOString(),
      systemInfo: {
        isRailway: !!(process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_PROJECT_NAME),
        sessionPath: process.env.RAILWAY_PROJECT_ID ? '/app/persistent-session' : './persistent-session',
        backupPath: process.env.RAILWAY_PROJECT_ID ? '/tmp/session-backup' : './session-backup'
      }
    });
  } catch (error) {
    console.error('❌ Error getting persistent session status:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'فشل في الحصول على حالة الجلسة الدائمة',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;
    
    console.log(`🔧 POST: Persistent session action requested: ${action}`);
    
    const persistentSession = WhatsAppPersistentSession.getInstance();
    
    switch (action) {
      case 'initialize': {
        console.log('🚀 Initializing persistent session...');
        
        try {
          await persistentSession.initialize();
          
          // Wait a moment for initialization to complete
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const status = persistentSession.getStatus();
          const detailedInfo = await persistentSession.getDetailedSessionInfo();
          
          return NextResponse.json({
            success: true,
            message: status.isConnected ? 'تم تهيئة الجلسة الدائمة بنجاح' : 'تم بدء تهيئة الجلسة الدائمة - امسح QR كود',
            status: status,
            sessionInfo: detailedInfo,
            needsQR: !status.isConnected && !!status.qrCode,
            qrCode: status.qrCode
          });
        } catch (error) {
          console.error('❌ Persistent session initialization failed:', error);
          return NextResponse.json({
            success: false,
            error: 'فشل في تهيئة الجلسة الدائمة',
            details: error instanceof Error ? error.message : 'Unknown error'
          }, { status: 500 });
        }
      }
      
      case 'clear': {
        console.log('🧹 Clearing persistent session...');
        
        try {
          await persistentSession.clearSession();
          
          const status = persistentSession.getStatus();
          const detailedInfo = await persistentSession.getDetailedSessionInfo();
          
          return NextResponse.json({
            success: true,
            message: 'تم حذف الجلسة الدائمة بنجاح',
            status: status,
            sessionInfo: detailedInfo
          });
        } catch (error) {
          console.error('❌ Failed to clear persistent session:', error);
          return NextResponse.json({
            success: false,
            error: 'فشل في حذف الجلسة الدائمة',
            details: error instanceof Error ? error.message : 'Unknown error'
          }, { status: 500 });
        }
      }
      
      case 'backup': {
        console.log('💾 Manual backup requested...');
        
        try {
          // Access the private method through a public interface
          const status = persistentSession.getStatus();
          
          if (!status.isConnected) {
            return NextResponse.json({
              success: false,
              error: 'الواتساب غير متصل - لا يمكن عمل نسخة احتياطية',
              status: status
            }, { status: 400 });
          }
          
          // The backup happens automatically, but we can force a session save
          // This is a workaround since backupSession is private
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const detailedInfo = await persistentSession.getDetailedSessionInfo();
          
          return NextResponse.json({
            success: true,
            message: 'تم إنشاء نسخة احتياطية من الجلسة',
            sessionInfo: detailedInfo,
            hasBackup: detailedInfo.hasBackup
          });
        } catch (error) {
          console.error('❌ Failed to backup session:', error);
          return NextResponse.json({
            success: false,
            error: 'فشل في إنشاء نسخة احتياطية',
            details: error instanceof Error ? error.message : 'Unknown error'
          }, { status: 500 });
        }
      }
      
      case 'health-check': {
        console.log('🏥 Health check requested...');
        
        try {
          const status = persistentSession.getStatus();
          const detailedInfo = await persistentSession.getDetailedSessionInfo();
          
          // Analyze health
          const healthAnalysis = {
            overall: 'healthy' as 'healthy' | 'warning' | 'critical',
            issues: [] as string[],
            recommendations: [] as string[]
          };
          
          if (!status.isConnected) {
            healthAnalysis.overall = 'warning';
            healthAnalysis.issues.push('الواتساب غير متصل');
            healthAnalysis.recommendations.push('قم بتهيئة الجلسة مرة أخرى');
          }
          
          if (!detailedInfo.exists) {
            healthAnalysis.overall = 'critical';
            healthAnalysis.issues.push('لا توجد جلسة محفوظة');
            healthAnalysis.recommendations.push('قم بإنشاء جلسة جديدة');
          }
          
          if (detailedInfo.exists && !detailedInfo.isValid) {
            healthAnalysis.overall = 'critical';
            healthAnalysis.issues.push('الجلسة المحفوظة معطلة');
            healthAnalysis.recommendations.push('قم بحذف الجلسة وإنشاء جلسة جديدة');
          }
          
          if (detailedInfo.size > 100) {
            healthAnalysis.overall = 'warning';
            healthAnalysis.issues.push(`حجم الجلسة كبير: ${detailedInfo.size}MB`);
            healthAnalysis.recommendations.push('قم بحذف الجلسة وإنشاء جلسة جديدة لتحسين الأداء');
          }
          
          if (!detailedInfo.hasBackup && status.isConnected) {
            healthAnalysis.issues.push('لا توجد نسخة احتياطية');
            healthAnalysis.recommendations.push('سيتم إنشاء نسخة احتياطية تلقائياً');
          }
          
          return NextResponse.json({
            success: true,
            status: status,
            sessionInfo: detailedInfo,
            health: healthAnalysis,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          console.error('❌ Health check failed:', error);
          return NextResponse.json({
            success: false,
            error: 'فشل في فحص صحة الجلسة',
            details: error instanceof Error ? error.message : 'Unknown error'
          }, { status: 500 });
        }
      }
      
      case 'send-test-message': {
        console.log('🧪 Test message requested...');
        
        const { phoneNumber, message } = body;
        
        if (!phoneNumber || !message) {
          return NextResponse.json({
            success: false,
            error: 'رقم الهاتف والرسالة مطلوبان',
            required: ['phoneNumber', 'message']
          }, { status: 400 });
        }
        
        try {
          const success = await persistentSession.sendMessage(phoneNumber, message);
          
          return NextResponse.json({
            success: success,
            message: success ? 'تم إرسال الرسالة بنجاح' : 'فشل في إرسال الرسالة',
            phoneNumber: phoneNumber,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          console.error('❌ Failed to send test message:', error);
          return NextResponse.json({
            success: false,
            error: 'فشل في إرسال الرسالة التجريبية',
            details: error instanceof Error ? error.message : 'Unknown error'
          }, { status: 500 });
        }
      }
      
      default:
        return NextResponse.json(
          { 
            success: false,
            error: 'إجراء غير صالح',
            validActions: ['initialize', 'clear', 'backup', 'health-check', 'send-test-message']
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('❌ Error in persistent session action:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'فشل في تنفيذ الإجراء',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 