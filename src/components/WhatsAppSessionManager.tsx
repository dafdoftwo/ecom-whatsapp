'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  RefreshCw, 
  QrCode, 
  CheckCircle, 
  Trash2, 
  AlertCircle, 
  Wifi, 
  WifiOff,
  Activity,
  Shield,
  AlertTriangle
} from 'lucide-react';

interface SessionState {
  status: 'not_initialized' | 'initializing' | 'waiting_qr' | 'authenticating' | 'connected' | 'disconnected' | 'error';
  qrCode?: string;
  error?: string;
  lastActivity?: string;
  connectionAttempts: number;
  sessionHealth: 'healthy' | 'degraded' | 'critical';
}

interface HealthInfo {
  isHealthy: boolean;
  issues: string[];
  recommendations: string[];
}

interface WhatsAppSessionManagerProps {
  onConnectionSuccess?: () => void;
  autoInitialize?: boolean;
}

export default function WhatsAppSessionManager({ 
  onConnectionSuccess, 
  autoInitialize = true 
}: WhatsAppSessionManagerProps) {
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch session state
  const fetchSessionState = useCallback(async () => {
    try {
      const response = await fetch('/api/whatsapp/session');
      const data = await response.json();
      
      if (data.success) {
        setSessionState(data.state);
        setHealth(data.health);
        
        // Check if connected
        if (data.state.status === 'connected' && onConnectionSuccess) {
          onConnectionSuccess();
        }
      }
    } catch (error) {
      console.error('Error fetching session state:', error);
    }
  }, [onConnectionSuccess]);

  // Initialize session
  const initializeSession = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/whatsapp/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'initialize' })
      });
      
      const data = await response.json();
      if (data.state) {
        setSessionState(data.state);
      }
    } catch (error) {
      console.error('Error initializing session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Regenerate QR
  const regenerateQR = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/whatsapp/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'regenerate-qr' })
      });
      
      const data = await response.json();
      if (data.state) {
        setSessionState(data.state);
      }
    } catch (error) {
      console.error('Error regenerating QR:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Clear session
  const clearSession = async () => {
    setIsLoading(true);
    setShowConfirmClear(false);
    try {
      const response = await fetch('/api/whatsapp/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' })
      });
      
      const data = await response.json();
      if (data.state) {
        setSessionState(data.state);
      }
      
      // Auto-initialize after clearing
      if (autoInitialize) {
        setTimeout(() => initializeSession(), 2000);
      }
    } catch (error) {
      console.error('Error clearing session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-refresh
  useEffect(() => {
    fetchSessionState();
    
    if (autoRefresh) {
      const interval = setInterval(fetchSessionState, 3000);
      return () => clearInterval(interval);
    }
  }, [fetchSessionState, autoRefresh]);

  // Auto-initialize on mount
  useEffect(() => {
    if (autoInitialize && sessionState?.status === 'not_initialized') {
      initializeSession();
    }
  }, [sessionState?.status, autoInitialize]);

  // Render status icon
  const renderStatusIcon = () => {
    if (!sessionState) return null;
    
    switch (sessionState.status) {
      case 'connected':
        return <Wifi className="h-5 w-5 text-green-600" />;
      case 'disconnected':
        return <WifiOff className="h-5 w-5 text-red-600" />;
      case 'waiting_qr':
        return <QrCode className="h-5 w-5 text-blue-600" />;
      case 'initializing':
      case 'authenticating':
        return <RefreshCw className="h-5 w-5 text-orange-600 animate-spin" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Activity className="h-5 w-5 text-gray-600" />;
    }
  };

  // Render health badge
  const renderHealthBadge = () => {
    if (!sessionState) return null;
    
    const healthColors = {
      healthy: 'bg-green-100 text-green-800',
      degraded: 'bg-orange-100 text-orange-800',
      critical: 'bg-red-100 text-red-800'
    };
    
    const healthIcons = {
      healthy: <Shield className="h-3 w-3" />,
      degraded: <AlertTriangle className="h-3 w-3" />,
      critical: <AlertCircle className="h-3 w-3" />
    };
    
    const healthLabels = {
      healthy: 'صحة جيدة',
      degraded: 'صحة متدهورة',
      critical: 'صحة حرجة'
    };
    
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${healthColors[sessionState.sessionHealth]}`}>
        {healthIcons[sessionState.sessionHealth]}
        {healthLabels[sessionState.sessionHealth]}
      </span>
    );
  };

  // Get status message
  const getStatusMessage = () => {
    if (!sessionState) return 'جاري التحميل...';
    
    const messages = {
      not_initialized: 'لم يتم التهيئة بعد',
      initializing: 'جاري التهيئة...',
      waiting_qr: 'في انتظار مسح QR Code',
      authenticating: 'جاري المصادقة...',
      connected: 'متصل ويعمل بشكل طبيعي',
      disconnected: 'غير متصل',
      error: sessionState.error || 'حدث خطأ'
    };
    
    return messages[sessionState.status];
  };

  // Confirmation dialog
  if (showConfirmClear) {
    return (
      <Card className="border-2 border-orange-200 bg-orange-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-orange-800">
            <AlertCircle className="h-5 w-5" />
            تأكيد حذف الجلسة
          </CardTitle>
          <CardDescription className="text-orange-600">
            هل أنت متأكد من حذف جلسة الواتساب الحالية؟ ستحتاج إلى مسح QR Code جديد.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button 
              variant="danger" 
              onClick={clearSession}
              disabled={isLoading}
            >
              <Trash2 className="h-4 w-4 ml-1" />
              نعم، احذف الجلسة
            </Button>
            <Button 
              variant="secondary" 
              onClick={() => setShowConfirmClear(false)}
              disabled={isLoading}
            >
              إلغاء
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Main render
  const cardBorderColor = sessionState?.status === 'connected' ? 'border-green-200' : 
                         sessionState?.status === 'error' ? 'border-red-200' : 
                         sessionState?.status === 'waiting_qr' ? 'border-blue-200' : 
                         'border-gray-200';
                         
  const cardBgColor = sessionState?.status === 'connected' ? 'bg-green-50' : 
                     sessionState?.status === 'error' ? 'bg-red-50' : 
                     sessionState?.status === 'waiting_qr' ? 'bg-blue-50' : 
                     'bg-gray-50';

  return (
    <Card className={`border-2 ${cardBorderColor} ${cardBgColor}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {renderStatusIcon()}
            إدارة جلسة الواتساب
          </CardTitle>
          {renderHealthBadge()}
        </div>
        <CardDescription>
          {getStatusMessage()}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* QR Code Display */}
        {sessionState?.status === 'waiting_qr' && sessionState.qrCode && (
          <div className="flex flex-col items-center space-y-4">
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <img 
                src={sessionState.qrCode} 
                alt="WhatsApp QR Code" 
                className="w-64 h-64 object-contain"
              />
            </div>
            <div className="text-center space-y-2">
              <p className="text-sm text-gray-600">
                1. افتح تطبيق الواتساب على هاتفك
              </p>
              <p className="text-sm text-gray-600">
                2. اذهب إلى الإعدادات ← الأجهزة المرتبطة
              </p>
              <p className="text-sm text-gray-600">
                3. اضغط على "ربط جهاز" وامسح الكود أعلاه
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <div className="animate-pulse w-2 h-2 bg-blue-600 rounded-full"></div>
              في انتظار المسح...
            </div>
          </div>
        )}

        {/* Health Issues */}
        {health && !health.isHealthy && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <h4 className="font-medium text-orange-800 mb-2">مشاكل محتملة:</h4>
            <ul className="list-disc list-inside text-sm text-orange-700 space-y-1">
              {health.issues.map((issue, index) => (
                <li key={index}>{issue}</li>
              ))}
            </ul>
            {health.recommendations.length > 0 && (
              <>
                <h4 className="font-medium text-orange-800 mt-3 mb-2">توصيات:</h4>
                <ul className="list-disc list-inside text-sm text-orange-700 space-y-1">
                  {health.recommendations.map((rec, index) => (
                    <li key={index}>{rec}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {/* Connection Info */}
        {sessionState?.status === 'connected' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-green-800">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">متصل بنجاح</span>
            </div>
            {sessionState.connectionAttempts > 0 && (
              <p className="text-sm text-green-700 mt-1">
                محاولات الاتصال: {sessionState.connectionAttempts}
              </p>
            )}
          </div>
        )}

        {/* Error Display */}
        {sessionState?.status === 'error' && sessionState.error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-red-800">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">خطأ</span>
            </div>
            <p className="text-sm text-red-700 mt-1">{sessionState.error}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          {sessionState?.status === 'not_initialized' && (
            <Button 
              variant="primary"
              onClick={initializeSession}
              disabled={isLoading}
            >
              <Wifi className="h-4 w-4 ml-1" />
              بدء الاتصال
            </Button>
          )}

          {sessionState?.status === 'waiting_qr' && (
            <Button 
              variant="primary"
              onClick={regenerateQR}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ml-1 ${isLoading ? 'animate-spin' : ''}`} />
              إعادة توليد QR Code
            </Button>
          )}

          {sessionState?.status === 'error' && (
            <Button 
              variant="secondary"
              onClick={initializeSession}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ml-1 ${isLoading ? 'animate-spin' : ''}`} />
              المحاولة مرة أخرى
            </Button>
          )}

          <Button 
            variant="warning"
            onClick={() => setShowConfirmClear(true)}
            disabled={isLoading || sessionState?.status === 'not_initialized'}
          >
            <Trash2 className="h-4 w-4 ml-1" />
            حذف الجلسة
          </Button>

          <Button 
            variant="secondary"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <Activity className="h-4 w-4 ml-1" />
            {autoRefresh ? 'إيقاف' : 'تشغيل'} التحديث التلقائي
          </Button>
        </div>

        {/* Session Info */}
        {sessionState && (
          <div className="text-xs text-gray-500 space-y-1">
            <p>الحالة: {sessionState.status}</p>
            <p>محاولات الاتصال: {sessionState.connectionAttempts}</p>
            {sessionState.lastActivity && (
              <p>آخر نشاط: {new Date(sessionState.lastActivity).toLocaleString('ar-EG')}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
} 