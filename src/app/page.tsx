'use client';

import React, { useState, useEffect } from 'react';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import WhatsAppSessionManager from '@/components/WhatsAppSessionManager';

interface AutomationStats {
  engine: {
    isRunning: boolean;
    lastCheck: string;
    nextCheck: string;
  };
  processing: {
    totalOrders: number;
    validOrders: number;
    invalidOrders: number;
    egyptianNumbers: number;
  };
  phoneNumbers: {
    valid: number;
    invalid: number;
    processed: number;
    whatsappRegistered: number;
  };
  orderStatuses: Record<string, number>;
  egyptianStats: {
    supportedStatuses: string[];
    totalProcessed: number;
    pendingOffers: number;
  };
  configurationStatus?: {
    googleConfigured: boolean;
    whatsappConfigured: boolean;
    messagesConfigured: boolean;
  };
}

interface WhatsAppStatus {
  isConnected: boolean;
  sessionExists: boolean;
  needsQRScan?: boolean;
  hasQrCode?: boolean;
  qrCode?: string;
  sessionStatus?: string;
  message?: string;
  canRestoreSession?: boolean;
  isSessionCorrupted?: boolean;
  actionSuggestion?: string;
  health?: {
    isHealthy: boolean;
    lastHealthCheck: string;
    uptime: number;
    status: string;
    reconnectAttempts?: number;
    isInitializing?: boolean;
  };
  debug?: {
    reconnectAttempts: number;
    isInitializing: boolean;
    lastHealthCheck: string;
    uptime: number;
  };
  clientInfo?: {
    pushname: string;
    wid: string;
  };
  timestamp?: string;
}

export default function Dashboard() {
  const [stats, setStats] = useState<AutomationStats | null>(null);
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // Test WhatsApp states
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('مرحباً! هذه رسالة تجريبية لاختبار نظام الأتمتة.');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    details?: any;
    debug?: any;
  } | null>(null);

  // Empty Status Management states
  const [emptyStatusLoading, setEmptyStatusLoading] = useState(false);
  const [emptyStatusResult, setEmptyStatusResult] = useState<{
    success: boolean;
    message: string;
    data?: any;
  } | null>(null);

  useEffect(() => {
    loadDashboardData();
    
    // Refresh data every 30 seconds
    const interval = setInterval(loadDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Auto-refresh when QR code is displayed
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    // Auto-refresh every 5 seconds when QR code is displayed and not connected
    if (whatsappStatus?.hasQrCode && whatsappStatus?.qrCode && !whatsappStatus?.isConnected) {
      interval = setInterval(() => {
        loadDashboardData();
      }, 5000);
    }
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [whatsappStatus?.hasQrCode, whatsappStatus?.qrCode, whatsappStatus?.isConnected]);

  const loadDashboardData = async () => {
    try {
      const [automationResponse, whatsappResponse] = await Promise.all([
        fetch('/api/automation/status'),
        fetch('/api/whatsapp/status')
      ]);

      if (automationResponse.ok) {
        const automationData = await automationResponse.json();
        setStats(automationData);
      }

      if (whatsappResponse.ok) {
        const whatsappData = await whatsappResponse.json();
        setWhatsappStatus(whatsappData);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAutomationAction = async (action: 'start' | 'stop') => {
    setActionLoading(action);
    try {
      const response = await fetch(`/api/automation/${action}`, { method: 'POST' });
      if (response.ok) {
        await loadDashboardData();
      }
    } catch (error) {
      console.error(`Error ${action}ing automation:`, error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleWhatsAppAction = async (action: 'initialize' | 'logout' | 'clear-session' | 'force-reconnect' | 'smart-initialize') => {
    setActionLoading(action);
    try {
      let endpoint = '';
      switch (action) {
        case 'clear-session':
          endpoint = '/api/whatsapp/clear-session';
          break;
        case 'force-reconnect':
          endpoint = '/api/whatsapp/force-reconnect';
          break;
        case 'smart-initialize':
          endpoint = '/api/whatsapp/smart-initialize';
          break;
        default:
          endpoint = `/api/whatsapp/${action}`;
      }
      
      const response = await fetch(endpoint, { method: 'POST' });
      const result = await response.json();
      
      if (response.ok) {
        await loadDashboardData();
        
        // Show success messages
        if (action === 'clear-session') {
          alert('تم مسح الجلسة بنجاح! يمكنك الآن مسح QR كود جديد.');
        } else if (action === 'force-reconnect') {
          alert('تم إعادة الاتصال بنجاح!');
        } else if (action === 'smart-initialize') {
          if (result.success) {
            alert('تم الاتصال بنجاح! ✅');
          } else {
            alert(`تنبيه: ${result.message}`);
          }
        }
      } else {
        throw new Error(result.error || result.message || 'فشل في العملية');
      }
    } catch (error) {
      console.error(`Error with WhatsApp ${action}:`, error);
      
      // Show more specific error messages
      let errorMessage = 'خطأ غير معروف';
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          errorMessage = 'انتهت مهلة الاتصال. قد تكون الجلسة معطلة. جرب "مسح الجلسة" ثم "اتصال جديد".';
        } else {
          errorMessage = error.message;
        }
      }
      
      alert(`فشل في ${action === 'force-reconnect' ? 'إعادة الاتصال' : action === 'smart-initialize' ? 'الاتصال الذكي' : action}: ${errorMessage}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleTestWhatsApp = async () => {
    if (!testPhone.trim() || !testMessage.trim()) {
      setTestResult({
        success: false,
        message: 'يرجى إدخال رقم الهاتف والرسالة'
      });
      return;
    }

    setTestLoading(true);
    setTestResult(null);

    // Create abort controller for timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      const response = await fetch('/api/whatsapp/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber: testPhone,
          message: testMessage
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const result = await response.json();

      // Enhanced result handling
      if (result.success) {
        setTestResult({
          success: true,
          message: result.message,
          details: result.details
        });
        // Clear form on success
        setTestPhone('');
      } else {
        setTestResult({
          success: false,
          message: result.error || 'فشل في إرسال الرسالة التجريبية',
          debug: result.debug
        });
      }
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        setTestResult({
          success: false,
          message: '⏱️ انتهت مهلة الاختبار. قد يكون النظام يحاول إعادة الاتصال. حاول مرة أخرى خلال دقيقة.'
        });
      } else {
      setTestResult({
        success: false,
        message: 'فشل في إرسال الرسالة التجريبية'
      });
      }
    } finally {
      setTestLoading(false);
    }
  };

  const handleEmptyStatusAction = async (action: 'detect-and-update' | 'reset-tracking' | 'smart-process') => {
    setEmptyStatusLoading(true);
    setEmptyStatusResult(null);

    try {
      console.log(`🔄 Executing empty status action: ${action}`);

      const response = await fetch('/api/automation/empty-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action })
      });

      const result = await response.json();

      if (result.success) {
        setEmptyStatusResult({
          success: true,
          message: result.message,
          data: result.data
        });

        // Refresh dashboard data after successful operations
        await loadDashboardData();

        // Show specific success messages
        if (action === 'detect-and-update' && result.data?.updatedOrders > 0) {
          const updatedCount = result.data.updatedOrders;
          const customerNames = result.data.summary?.updatedCustomers?.map((c: any) => c.name).slice(0, 3).join(', ');
          const moreText = result.data.summary?.updatedCustomers?.length > 3 ? ` و ${result.data.summary.updatedCustomers.length - 3} آخرين` : '';
          
          alert(`✅ نجح التحديث!\n\nتم تحديث ${updatedCount} طلب بحالة فارغة إلى "جديد"\n\nالعملاء: ${customerNames}${moreText}\n\nالآن سيتم التعامل مع هذه الطلبات ضمن سيناريو "جديد" دون تكرار الرسائل.`);
        } else if (action === 'smart-process') {
          const emptyUpdated = result.data?.summary?.emptyStatusUpdated || 0;
          if (emptyUpdated > 0) {
            alert(`🧠 المعالجة الذكية مكتملة!\n\nتم تحديث ${emptyUpdated} طلب بحالة فارغة وتمت معالجة جميع الطلبات بنجاح.`);
          } else {
            alert('🧠 المعالجة الذكية مكتملة! تم فحص جميع الطلبات ولم توجد حالات فارغة تحتاج تحديث.');
          }
        }
      } else {
        setEmptyStatusResult({
          success: false,
          message: result.error || 'فشل في العملية',
          data: null
        });
      }
    } catch (error) {
      console.error('Error in empty status action:', error);
      setEmptyStatusResult({
        success: false,
        message: 'فشل في الاتصال بالخادم',
        data: null
      });
    } finally {
      setEmptyStatusLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ paddingTop: '4rem', paddingBottom: '4rem' }}>
        <div className="text-center">
          <div className="loading" style={{ width: '60px', height: '60px', marginBottom: '2rem', margin: '0 auto' }}></div>
          <h2>جاري تحميل النظام</h2>
          <p style={{ color: 'var(--gray-600)' }}>يتم تحميل بيانات النظام وحالة الاتصالات...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* قسم العنوان */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--gray-200)' }}>
        <div className="container" style={{ paddingTop: '2rem', paddingBottom: '2rem' }}>
          <div className="flex items-center justify-between">
              <div>
              <h1>🇪🇬 لوحة المراقبة والتحكم</h1>
              <p style={{ color: 'var(--gray-600)', marginBottom: '0' }}>مراقبة وإدارة نظام أتمتة الواتساب</p>
              </div>
            <div className="flex gap-2">
              <button 
                className="btn btn-secondary btn-sm"
                onClick={loadDashboardData} 
                disabled={!!actionLoading}
              >
                {loading ? '⟳' : '🔄'} تحديث
              </button>
              <a href="/settings" className="btn btn-primary btn-sm">⚙️ الإعدادات</a>
            </div>
          </div>
        </div>
      </div>

      <div className="container" style={{ paddingTop: '2rem', paddingBottom: '2rem' }}>
        
        {/* تنبيه حالة النظام */}
        <div className="alert alert-primary">
          <strong>🔒 وضع القراءة المحمي نشط</strong><br />
          النظام يقرأ من Google Sheets ويرسل رسائل الواتساب دون تعديل البيانات
              </div>

        {/* قسم QR Code */}
        {!whatsappStatus?.isConnected && (
          <div className="card mb-4">
            <div className="card-header">
              <h3>📱 ربط الواتساب</h3>
              <p style={{ marginBottom: '0', color: 'var(--gray-600)' }}>إدارة احترافية لجلسة الواتساب</p>
            </div>
            <div className="card-body">
              <WhatsAppSessionManager onConnectionSuccess={() => loadDashboardData()} />
            </div>
          </div>
        )}

        {/* بطاقات الحالة الرئيسية */}
        <div className="grid grid-cols-1 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
          {/* محرك الأتمتة */}
          <div className="card">
            <div className="card-body text-center">
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
                {stats?.engine.isRunning ? '⚡' : '⏸️'}
              </div>
              <h4>محرك الأتمتة</h4>
              <div className={`badge ${stats?.engine.isRunning ? 'badge-success' : 'badge-danger'}`}>
                {stats?.engine.isRunning ? 'يعمل' : 'متوقف'}
              </div>
              <div style={{ marginTop: '1rem' }}>
                <button 
                  className={`btn w-full ${stats?.engine.isRunning ? 'btn-danger' : 'btn-success'}`}
                  onClick={() => handleAutomationAction(stats?.engine.isRunning ? 'stop' : 'start')}
                  disabled={actionLoading === 'start' || actionLoading === 'stop'}
                >
                  {stats?.engine.isRunning ? '⏹️ إيقاف' : '▶️ تشغيل'}
                </button>
              </div>
                </div>
                </div>

          {/* إدارة الطلبات */}
          <div className="card">
            <div className="card-body text-center">
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📦</div>
              <h4>إدارة الطلبات</h4>
              <div className="stat-number" style={{ color: 'var(--primary)' }}>
                {stats?.processing.totalOrders || 0}
              </div>
              <div className="stat-label">إجمالي الطلبات</div>
              <div style={{ marginTop: '1rem' }}>
                <a href="/orders" className="btn btn-primary w-full">📋 عرض الطلبات</a>
                </div>
                </div>
              </div>
              
          {/* حالة الواتساب */}
          <div className="card">
            <div className="card-body text-center">
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
                {whatsappStatus?.isConnected ? '💚' : '💔'}
                </div>
              <h4>حالة الواتساب</h4>
              <div className={`badge ${whatsappStatus?.isConnected ? 'badge-success' : 'badge-danger'}`}>
                      {whatsappStatus?.isConnected ? 'متصل' : 'غير متصل'}
                  </div>
              {whatsappStatus?.isConnected && whatsappStatus.clientInfo && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--gray-600)' }}>
                  المستخدم: {whatsappStatus.clientInfo.pushname}
                </div>
              )}
              <div style={{ marginTop: '1rem' }}>
                <button 
                  className={`btn w-full ${whatsappStatus?.isConnected ? 'btn-danger' : 'btn-success'}`}
                  onClick={() => handleWhatsAppAction(whatsappStatus?.isConnected ? 'logout' : 'smart-initialize')}
                  disabled={!!actionLoading}
                >
                  {whatsappStatus?.isConnected ? '🔌 قطع الاتصال' : '🔗 اتصال'}
                </button>
              </div>
                </div>
                </div>

          {/* إدارة الحالات الفارغة */}
          <div className="card">
            <div className="card-body text-center">
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚠️</div>
              <h4>الحالات الفارغة</h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--gray-600)', marginBottom: '1rem' }}>معالجة وتحديث</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <button 
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleEmptyStatusAction('detect-and-update')}
                  disabled={emptyStatusLoading}
                >
                  🔍 البحث والتحديث
                </button>
                <button 
                  className="btn btn-warning btn-sm"
                  onClick={() => handleEmptyStatusAction('smart-process')}
                  disabled={emptyStatusLoading}
                >
                  🧠 المعالجة الذكية
                </button>
              </div>
              {emptyStatusResult && (
                <div className={`alert ${emptyStatusResult.success ? 'alert-success' : 'alert-danger'}`} style={{ marginTop: '1rem', fontSize: '0.75rem' }}>
                  {emptyStatusResult.message}
                </div>
              )}
        </div>
                </div>
                </div>

        {/* الإحصائيات العامة */}
        <div className="grid grid-cols-1 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div className="stat-card" style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))', color: 'white' }}>
            <div className="stat-number">{stats?.processing.totalOrders || 0}</div>
            <div className="stat-label" style={{ color: 'rgba(255,255,255,0.8)' }}>إجمالي الطلبات</div>
                </div>
          
          <div className="stat-card" style={{ background: 'linear-gradient(135deg, var(--success), #047857)', color: 'white' }}>
            <div className="stat-number">{stats?.phoneNumbers.whatsappRegistered || 0}</div>
            <div className="stat-label" style={{ color: 'rgba(255,255,255,0.8)' }}>أرقام واتساب صالحة</div>
                </div>
          
          <div className="stat-card" style={{ background: 'linear-gradient(135deg, var(--warning), #b45309)', color: 'white' }}>
            <div className="stat-number">{stats?.egyptianStats.pendingOffers || 0}</div>
            <div className="stat-label" style={{ color: 'rgba(255,255,255,0.8)' }}>عروض مجدولة</div>
        </div>

          <div className="stat-card" style={{ background: 'linear-gradient(135deg, #10b981, #065f46)', color: 'white' }}>
            <div className="stat-number">{stats?.egyptianStats.totalProcessed || 0}</div>
            <div className="stat-label" style={{ color: 'rgba(255,255,255,0.8)' }}>تم معالجتها</div>
                </div>
                </div>

        {/* إحصائيات النظام المصري */}
        <div className="card mb-4">
          <div className="card-header">
            <h3>🇪🇬 إحصائيات النظام المصري</h3>
            <p style={{ marginBottom: '0', color: 'var(--gray-600)' }}>تفاصيل الأداء والكفاءة</p>
                </div>
          <div className="card-body">
            {/* الحالات المدعومة */}
            <div className="mb-3">
              <h4>الحالات المدعومة:</h4>
              <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
                {stats?.egyptianStats.supportedStatuses.map((status) => (
                  <span key={status} className="badge badge-secondary">{status}</span>
                ))}
              </div>
            </div>

            {/* جودة المعالجة */}
            <div className="grid grid-cols-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div className="text-center" style={{ padding: '1rem', background: 'var(--gray-50)', borderRadius: 'var(--border-radius)' }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--success)', marginBottom: '0.5rem' }}>
                  {stats ? Math.round((stats.processing.validOrders / stats.processing.totalOrders) * 100) : 0}%
                </div>
                <div style={{ color: 'var(--gray-600)', fontSize: '0.875rem' }}>جودة البيانات</div>
                <div style={{ color: 'var(--gray-500)', fontSize: '0.75rem' }}>نسبة الطلبات الصحيحة</div>
              </div>
              
              <div className="text-center" style={{ padding: '1rem', background: 'var(--gray-50)', borderRadius: 'var(--border-radius)' }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary)', marginBottom: '0.5rem' }}>
                  {stats ? Math.round((stats.processing.egyptianNumbers / stats.processing.totalOrders) * 100) : 0}%
                </div>
                <div style={{ color: 'var(--gray-600)', fontSize: '0.875rem' }}>أرقام مصرية</div>
                <div style={{ color: 'var(--gray-500)', fontSize: '0.75rem' }}>نسبة الأرقام المحلية</div>
              </div>
              
              <div className="text-center" style={{ padding: '1rem', background: 'var(--gray-50)', borderRadius: 'var(--border-radius)' }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#7c3aed', marginBottom: '0.5rem' }}>
                  {stats ? Math.round((stats.phoneNumbers.whatsappRegistered / stats.phoneNumbers.processed) * 100) : 0}%
                </div>
                <div style={{ color: 'var(--gray-600)', fontSize: '0.875rem' }}>تغطية الواتساب</div>
                <div style={{ color: 'var(--gray-500)', fontSize: '0.75rem' }}>نسبة الأرقام المفعلة</div>
              </div>
            </div>
          </div>
        </div>

        {/* تجربة الواتساب */}
        {whatsappStatus?.isConnected && (
          <div className="card mb-4">
            <div className="card-header">
              <h3>🧪 تجربة الواتساب</h3>
              <p style={{ marginBottom: '0', color: 'var(--gray-600)' }}>أرسل رسالة تجريبية للتأكد من عمل النظام</p>
            </div>
            <div className="card-body">
              <div className="grid grid-cols-1" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label className="label">رقم الهاتف (مصري):</label>
                  <input
                    type="tel"
                    className="input"
                    placeholder="01122334455"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    dir="ltr"
                    style={{ textAlign: 'left' }}
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: '0.25rem' }}>
                    أدخل رقمك أو رقم آخر تملكه لتجربة النظام
                  </p>
                </div>

                <div>
                  <label className="label">الرسالة التجريبية:</label>
                  <textarea
                    className="textarea"
                    placeholder="اكتب رسالتك التجريبية هنا..."
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-3">
                <button 
                  className="btn btn-success"
                  onClick={handleTestWhatsApp}
                  disabled={testLoading}
                >
                  {testLoading ? '📤 جاري الإرسال...' : '📨 إرسال رسالة تجريبية'}
                </button>

                <button 
                  className="btn btn-secondary"
                  onClick={() => {
                    setTestPhone('');
                    setTestResult(null);
                  }}
                  disabled={testLoading}
                >
                  🗑️ مسح
                </button>
              </div>

              {/* نتائج التجربة */}
              {testResult && (
                <div className={`alert ${testResult.success ? 'alert-success' : 'alert-danger'}`} style={{ marginTop: '1rem' }}>
                  <strong>{testResult.success ? '✅ نجح الإرسال!' : '❌ فشل الإرسال'}</strong><br />
                  {testResult.message}
                      {testResult.details && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
                      <strong>تفاصيل:</strong><br />
                      الرقم المُعالج: {testResult.details.processedNumber}<br />
                      وقت الإرسال: {new Date(testResult.details.sentAt).toLocaleString('ar-EG')}
                        </div>
                      )}
                    </div>
              )}

              <div className="alert alert-primary" style={{ marginTop: '1rem' }}>
                <strong>💡 نصائح للتجربة:</strong><br />
                • استخدم رقمك الشخصي للتجربة<br />
                • تأكد من أن الرقم مصري (يبدأ بـ 01)<br />
                • تحقق من وصول الرسالة على هاتفك<br />
                • الرسالة ستحتوي على علامة "تجريبية"
              </div>
            </div>
            </div>
        )}

        {/* تنبيهات النظام */}
        {(!stats?.engine.isRunning || !whatsappStatus?.isConnected || !stats?.configurationStatus?.googleConfigured) && (
          <div style={{ marginBottom: '2rem' }}>
            {!stats?.configurationStatus?.googleConfigured && (
              <div className="alert alert-primary">
                  <strong>📊 مطلوب: تكوين Google Sheets</strong><br />
                  لم يتم ربط النظام بـ Google Sheets بعد. 
                <div style={{ marginTop: '1rem' }}>
                  <a href="/settings" className="btn btn-primary btn-sm">⚙️ اذهب للإعدادات</a>
                  </div>
              </div>
            )}

            {!whatsappStatus?.isConnected && (
              <div className="alert alert-success">
                  <strong>📱 مطلوب: ربط الواتساب</strong><br />
                  يحتاج النظام للاتصال بالواتساب لإرسال الرسائل. استخدم أزرار الواتساب في الأعلى للربط.
              </div>
            )}

            {(!stats?.engine.isRunning && stats?.configurationStatus?.googleConfigured && whatsappStatus?.isConnected) && (
              <div className="alert alert-warning">
                  <strong>⚡ جاهز للتشغيل!</strong><br />
                  النظام مُعد ومتصل. يمكنك الآن بدء محرك الأتمتة.
                <div style={{ marginTop: '1rem' }}>
                  <button 
                    className="btn btn-warning btn-sm"
                      onClick={() => handleAutomationAction('start')}
                      disabled={actionLoading === 'start'}
                    >
                    ▶️ {actionLoading === 'start' ? 'جاري التشغيل...' : 'بدء الأتمتة'}
                  </button>
                  </div>
              </div>
            )}

            {(stats?.engine.isRunning && stats?.configurationStatus?.googleConfigured && whatsappStatus?.isConnected) && (
              <div className="alert alert-success">
                  <strong>🎉 النظام يعمل بكامل طاقته!</strong><br />
                  جميع المكونات متصلة ومحرك الأتمتة يعمل. النظام يراقب الطلبات ويرسل الرسائل تلقائياً.
              </div>
            )}
          </div>
        )}

        {/* معلومات الحالات الفارغة */}
        <div className="alert alert-warning">
          <strong>🔧 ميزة حل مشكلة الرسائل المتكررة للحالات الفارغة</strong><br />
          إذا كانت لديك طلبات بحالة فارغة تتسبب في رسائل متكررة، استخدم أداة "إدارة الحالات الفارغة" أعلاه.<br />
          <strong>المعالجة الذكية:</strong> تكشف وتحدث الحالات الفارغة إلى "جديد" وتمنع التكرار.
        </div>

      </div>
    </div>
  );
}

