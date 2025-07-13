'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  Loader2, 
  QrCode, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  RefreshCw, 
  Trash2,
  Clock,
  Wifi,
  WifiOff
} from 'lucide-react';

interface WhatsAppStatus {
  isConnected: boolean;
  sessionExists: boolean;
  hasQrCode: boolean;
  qrCode?: string;
  needsQRScan: boolean;
  message: string;
  clientInfo?: any;
}

interface InitializationProgress {
  isInitializing: boolean;
  currentStep: string;
  elapsedSeconds: number;
  attempts: number;
  startTime: number;
}

export default function EnhancedWhatsAppManager() {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [progress, setProgress] = useState<InitializationProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning' | 'info'; text: string } | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-refresh status
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchStatus, 5000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh]);

  // Progress monitoring during initialization
  useEffect(() => {
    if (progress?.isInitializing) {
      progressRef.current = setInterval(fetchProgress, 2000);
    } else if (progressRef.current) {
      clearInterval(progressRef.current);
      progressRef.current = null;
    }

    return () => {
      if (progressRef.current) {
        clearInterval(progressRef.current);
      }
    };
  }, [progress?.isInitializing]);

  // Initial load
  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/whatsapp/status');
      const data = await response.json();
      setStatus(data);
      
      if (data.isConnected) {
        setAutoRefresh(false);
        setMessage({ type: 'success', text: 'الواتساب متصل ويعمل بشكل طبيعي' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'فشل في جلب حالة الواتساب' });
    }
  };

  const fetchProgress = async () => {
    try {
      const response = await fetch('/api/whatsapp/robust-initialize');
      const data = await response.json();
      setProgress(data);
      
      if (!data.isInitializing) {
        setProgress(null);
        fetchStatus(); // Refresh status when initialization completes
      }
    } catch (error) {
      console.error('Error fetching progress:', error);
    }
  };

  const robustInitialize = async () => {
    try {
      setLoading(true);
      setMessage({ type: 'info', text: 'بدء التهيئة المحسنة للواتساب...' });
      setAutoRefresh(true);
      
      const response = await fetch('/api/whatsapp/robust-initialize', {
        method: 'POST'
      });
      const data = await response.json();
      
      if (data.success) {
        if (data.isConnected) {
          setMessage({ type: 'success', text: data.message });
          setAutoRefresh(false);
        } else if (data.needsQRScan) {
          setMessage({ 
            type: 'info', 
            text: `${data.message} - الكود صالح لمدة 3 دقائق` 
          });
        }
      } else {
        setMessage({ 
          type: 'error', 
          text: `${data.message}${data.recommendation ? ` - ${data.recommendation}` : ''}` 
        });
        setAutoRefresh(false);
      }
      
      fetchStatus();
      
    } catch (error) {
      setMessage({ type: 'error', text: 'فشل في تهيئة الواتساب' });
      setAutoRefresh(false);
    } finally {
      setLoading(false);
    }
  };

  const clearSession = async () => {
    if (!confirm('هل أنت متأكد من حذف جلسة الواتساب؟ ستحتاج لمسح QR كود جديد.')) {
      return;
    }

    try {
      setLoading(true);
      setMessage({ type: 'warning', text: 'جاري حذف الجلسة...' });
      
      const response = await fetch('/api/whatsapp/clear-session', {
        method: 'POST'
      });
      const data = await response.json();
      
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        setStatus(null);
        setProgress(null);
        setTimeout(fetchStatus, 1000);
      } else {
        setMessage({ type: 'error', text: data.error || 'فشل في حذف الجلسة' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'فشل في حذف الجلسة' });
    } finally {
      setLoading(false);
    }
  };

  const getProgressPercentage = (): number => {
    if (!progress?.isInitializing) return 0;
    
    const maxTime = 90; // 90 seconds max
    const elapsed = progress.elapsedSeconds;
    const percentage = Math.min((elapsed / maxTime) * 100, 95); // Cap at 95%
    
    return percentage;
  };

  const getConnectionIcon = () => {
    if (status?.isConnected) {
      return <Wifi className="w-5 h-5 text-green-600" />;
    } else if (progress?.isInitializing) {
      return <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />;
    } else {
      return <WifiOff className="w-5 h-5 text-red-600" />;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {getConnectionIcon()}
            إدارة اتصال الواتساب المحسن
          </CardTitle>
          <CardDescription>
            إدارة متقدمة لاتصال الواتساب مع معالجة محسنة للمهل الزمنية
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Connection Status */}
          {status && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    {status.isConnected ? (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-600" />
                    )}
                    <span className="font-semibold">الحالة</span>
                  </div>
                  <Badge 
                    variant={status.isConnected ? "secondary" : "secondary"}
                    className={status.isConnected ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}
                  >
                    {status.isConnected ? 'متصل' : 'غير متصل'}
                  </Badge>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <QrCode className="w-4 h-4" />
                    <span className="font-semibold">QR Code</span>
                  </div>
                  <Badge variant={status.hasQrCode ? "secondary" : "secondary"}>
                    {status.hasQrCode ? 'متوفر' : 'غير متوفر'}
                  </Badge>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span className="font-semibold">التحديث التلقائي</span>
                  </div>
                  <Badge variant={autoRefresh ? "secondary" : "secondary"}>
                    {autoRefresh ? 'مفعل' : 'معطل'}
                  </Badge>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Initialization Progress */}
          {progress?.isInitializing && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="pt-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-blue-800">جاري التهيئة...</span>
                    <span className="text-sm text-blue-600">
                      {progress.elapsedSeconds}s / 90s
                    </span>
                  </div>
                  
                  <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
                    <div 
                      className="bg-blue-600 h-2 rounded-full" 
                      style={{ width: `${getProgressPercentage()}%` }}
                    ></div>
                  </div>
                  
                  <div className="text-sm text-blue-700">
                    <strong>الخطوة الحالية:</strong> {progress.currentStep}
                  </div>
                  
                  <div className="text-xs text-blue-600">
                    المحاولة رقم: {progress.attempts} | 
                    الوقت المنقضي: {Math.floor(progress.elapsedSeconds / 60)}:{(progress.elapsedSeconds % 60).toString().padStart(2, '0')}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* QR Code Display */}
          {status?.hasQrCode && status.qrCode && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-4 text-center">
                <div className="space-y-3">
                  <h3 className="font-semibold text-green-800">امسح QR Code للاتصال</h3>
                  <div className="flex justify-center">
                    <img 
                      src={status.qrCode} 
                      alt="WhatsApp QR Code" 
                      className="w-64 h-64 border-2 border-green-300 rounded-lg"
                    />
                  </div>
                  <p className="text-sm text-green-700">
                    افتح الواتساب على هاتفك → الإعدادات → الأجهزة المرتبطة → ربط جهاز
                  </p>
                  <p className="text-xs text-green-600">
                    ⏰ الكود صالح لمدة 3 دقائق
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button 
              onClick={robustInitialize} 
              disabled={loading || progress?.isInitializing}
              size="sm"
            >
              {loading || progress?.isInitializing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              تهيئة محسنة
            </Button>
            
            <Button 
              onClick={fetchStatus} 
              disabled={loading}
              variant="secondary"
              size="sm"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              تحديث الحالة
            </Button>
            
            <Button 
              onClick={clearSession} 
              disabled={loading}
              variant="danger"
              size="sm"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              مسح الجلسة
            </Button>
            
            <Button 
              onClick={() => setAutoRefresh(!autoRefresh)} 
              disabled={loading}
              variant={autoRefresh ? "warning" : "secondary"}
              size="sm"
            >
              <Clock className="w-4 h-4 mr-2" />
              {autoRefresh ? 'إيقاف' : 'تفعيل'} التحديث التلقائي
            </Button>
          </div>

          {/* Messages */}
          {message && (
            <Alert className={
              message.type === 'error' ? 'border-red-500' : 
              message.type === 'warning' ? 'border-yellow-500' : 
              message.type === 'success' ? 'border-green-500' : 'border-blue-500'
            }>
              {message.type === 'error' ? <XCircle className="w-4 h-4" /> : 
               message.type === 'warning' ? <AlertTriangle className="w-4 h-4" /> : 
               message.type === 'success' ? <CheckCircle className="w-4 h-4" /> :
               <Clock className="w-4 h-4" />}
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          )}

          {/* Client Info */}
          {status?.clientInfo && (
            <Card className="bg-gray-50 border-gray-200">
              <CardContent className="pt-4">
                <h4 className="font-semibold text-gray-800 mb-2">معلومات الاتصال:</h4>
                <div className="text-sm text-gray-600 space-y-1">
                  <div><strong>الاسم:</strong> {status.clientInfo.pushname}</div>
                  <div><strong>الرقم:</strong> {status.clientInfo.wid?.user}</div>
                  <div><strong>منصة WhatsApp:</strong> {status.clientInfo.platform}</div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Help */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <h4 className="font-semibold text-blue-800 mb-2">نصائح لحل مشاكل الاتصال:</h4>
              <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
                <li><strong>إذا انتهت المهلة الزمنية:</strong> انتظر دقيقة ثم حاول مرة أخرى</li>
                <li><strong>إذا فشل التوليد:</strong> امسح الجلسة وحاول مرة أخرى</li>
                <li><strong>مشاكل الشبكة:</strong> تحقق من اتصال الإنترنت</li>
                <li><strong>التهيئة المحسنة:</strong> تستغرق حتى 90 ثانية مع إعادة المحاولة التلقائية</li>
              </ul>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
} 