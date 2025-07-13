'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  RefreshCw, 
  Trash2, 
  Shield, 
  Database,
  MessageSquare,
  Activity,
  Clock,
  HardDrive,
  Wifi,
  WifiOff
} from 'lucide-react';

interface SessionStatus {
  isConnected: boolean;
  isInitializing: boolean;
  qrCode: string | null;
  clientInfo: any;
  sessionExists: boolean;
  sessionHealth: any;
  lastSessionSave: string;
  reconnectAttempts: number;
}

interface SessionInfo {
  exists: boolean;
  isValid: boolean;
  size: number;
  lastModified: string | null;
  hasBackup: boolean;
  backupSize: number;
  health: any;
}

interface HealthAnalysis {
  overall: 'healthy' | 'warning' | 'critical';
  issues: string[];
  recommendations: string[];
}

interface PersistentSessionManagerProps {
  onConnectionSuccess?: () => void;
  autoInitialize?: boolean;
}

export default function PersistentSessionManager({ 
  onConnectionSuccess, 
  autoInitialize = true 
}: PersistentSessionManagerProps) {
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [healthAnalysis, setHealthAnalysis] = useState<HealthAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [testMessage, setTestMessage] = useState('');
  const [testPhoneNumber, setTestPhoneNumber] = useState('');

  // Fetch session status
  const fetchSessionStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/whatsapp/persistent-session');
      const data = await response.json();
      
      if (data.success) {
        setStatus(data.status);
        setSessionInfo(data.sessionInfo);
        setError(null);
        
        // Check if connected and notify parent
        if (data.status.isConnected && onConnectionSuccess) {
          onConnectionSuccess();
        }
      } else {
        setError(data.error || 'فشل في الحصول على حالة الجلسة');
      }
    } catch (error) {
      console.error('Error fetching session status:', error);
      setError('خطأ في الاتصال بالخادم');
    }
  }, [onConnectionSuccess]);

  // Perform health check
  const performHealthCheck = useCallback(async () => {
    try {
      const response = await fetch('/api/whatsapp/persistent-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'health-check' })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setStatus(data.status);
        setSessionInfo(data.sessionInfo);
        setHealthAnalysis(data.health);
        setError(null);
      } else {
        setError(data.error || 'فشل في فحص صحة الجلسة');
      }
    } catch (error) {
      console.error('Error performing health check:', error);
      setError('خطأ في فحص صحة الجلسة');
    }
  }, []);

  // Initialize session
  const initializeSession = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const response = await fetch('/api/whatsapp/persistent-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'initialize' })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setStatus(data.status);
        setSessionInfo(data.sessionInfo);
        setSuccess(data.message);
        
        if (data.status.isConnected && onConnectionSuccess) {
          onConnectionSuccess();
        }
      } else {
        setError(data.error || 'فشل في تهيئة الجلسة');
      }
    } catch (error) {
      console.error('Error initializing session:', error);
      setError('خطأ في تهيئة الجلسة');
    } finally {
      setIsLoading(false);
    }
  };

  // Clear session
  const clearSession = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const response = await fetch('/api/whatsapp/persistent-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setStatus(data.status);
        setSessionInfo(data.sessionInfo);
        setSuccess(data.message);
        setHealthAnalysis(null);
      } else {
        setError(data.error || 'فشل في حذف الجلسة');
      }
    } catch (error) {
      console.error('Error clearing session:', error);
      setError('خطأ في حذف الجلسة');
    } finally {
      setIsLoading(false);
    }
  };

  // Send test message
  const sendTestMessage = async () => {
    if (!testPhoneNumber || !testMessage) {
      setError('يرجى إدخال رقم الهاتف والرسالة');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const response = await fetch('/api/whatsapp/persistent-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'send-test-message',
          phoneNumber: testPhoneNumber,
          message: testMessage
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSuccess('تم إرسال الرسالة التجريبية بنجاح');
        setTestMessage('');
        setTestPhoneNumber('');
      } else {
        setError(data.error || 'فشل في إرسال الرسالة');
      }
    } catch (error) {
      console.error('Error sending test message:', error);
      setError('خطأ في إرسال الرسالة');
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-refresh
  useEffect(() => {
    fetchSessionStatus();
    
    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchSessionStatus();
      }, 5000); // Refresh every 5 seconds
      
      return () => clearInterval(interval);
    }
  }, [fetchSessionStatus, autoRefresh]);

  // Auto-initialize on mount
  useEffect(() => {
    if (autoInitialize && status && !status.isConnected && !status.isInitializing) {
      initializeSession();
    }
  }, [status, autoInitialize]);

  // Perform health check on mount
  useEffect(() => {
    performHealthCheck();
  }, [performHealthCheck]);

  const getStatusColor = (status: SessionStatus | null) => {
    if (!status) return 'bg-gray-500';
    if (status.isConnected) return 'bg-green-500';
    if (status.isInitializing) return 'bg-yellow-500';
    if (status.sessionExists) return 'bg-blue-500';
    return 'bg-red-500';
  };

  const getStatusText = (status: SessionStatus | null) => {
    if (!status) return 'غير معروف';
    if (status.isConnected) return 'متصل';
    if (status.isInitializing) return 'جاري التهيئة';
    if (status.sessionExists) return 'جلسة موجودة';
    return 'غير متصل';
  };

  const getHealthColor = (health: HealthAnalysis | null) => {
    if (!health) return 'text-gray-500';
    switch (health.overall) {
      case 'healthy': return 'text-green-500';
      case 'warning': return 'text-yellow-500';
      case 'critical': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const formatFileSize = (sizeInMB: number) => {
    if (sizeInMB === 0) return '0 MB';
    if (sizeInMB < 1) return `${(sizeInMB * 1024).toFixed(0)} KB`;
    return `${sizeInMB.toFixed(1)} MB`;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'غير متاح';
    return new Date(dateString).toLocaleString('ar-EG');
  };

  return (
    <div className="space-y-6">
      {/* Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            إدارة الجلسات الدائمة
          </CardTitle>
          <CardDescription>
            نظام إدارة جلسات الواتساب الاحترافي مع النسخ الاحتياطي التلقائي
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${getStatusColor(status)}`} />
              <span className="font-medium">{getStatusText(status)}</span>
              {status?.isConnected && <Wifi className="h-4 w-4 text-green-500" />}
              {status && !status.isConnected && <WifiOff className="h-4 w-4 text-red-500" />}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={performHealthCheck}
                disabled={isLoading}
              >
                <Activity className="h-4 w-4 mr-2" />
                فحص الصحة
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
                {autoRefresh ? 'إيقاف' : 'تشغيل'} التحديث
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alerts */}
      {error && (
        <Alert className="border-red-200 bg-red-50">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* Health Analysis */}
      {healthAnalysis && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className={`h-5 w-5 ${getHealthColor(healthAnalysis)}`} />
              تحليل صحة الجلسة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant={healthAnalysis.overall === 'healthy' ? 'default' : 
                              healthAnalysis.overall === 'warning' ? 'secondary' : 'destructive'}>
                  {healthAnalysis.overall === 'healthy' ? 'صحية' :
                   healthAnalysis.overall === 'warning' ? 'تحذير' : 'حرجة'}
                </Badge>
              </div>
              
              {healthAnalysis.issues.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">المشاكل المكتشفة:</h4>
                  <ul className="space-y-1">
                    {healthAnalysis.issues.map((issue, index) => (
                      <li key={index} className="flex items-center gap-2 text-sm">
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                        {issue}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {healthAnalysis.recommendations.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">التوصيات:</h4>
                  <ul className="space-y-1">
                    {healthAnalysis.recommendations.map((rec, index) => (
                      <li key={index} className="flex items-center gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Session Details */}
      {sessionInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              تفاصيل الجلسة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">حالة الجلسة:</span>
                  <Badge variant={sessionInfo.exists ? 'default' : 'secondary'}>
                    {sessionInfo.exists ? 'موجودة' : 'غير موجودة'}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">صحة الجلسة:</span>
                  <Badge variant={sessionInfo.isValid ? 'default' : 'destructive'}>
                    {sessionInfo.isValid ? 'صحيحة' : 'معطلة'}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">حجم الجلسة:</span>
                  <span className="text-sm">{formatFileSize(sessionInfo.size)}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">آخر تعديل:</span>
                  <span className="text-sm">{formatDate(sessionInfo.lastModified)}</span>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">نسخة احتياطية:</span>
                  <Badge variant={sessionInfo.hasBackup ? 'default' : 'secondary'}>
                    {sessionInfo.hasBackup ? 'موجودة' : 'غير موجودة'}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">حجم النسخة الاحتياطية:</span>
                  <span className="text-sm">{formatFileSize(sessionInfo.backupSize)}</span>
                </div>
                
                {status && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">آخر حفظ:</span>
                      <span className="text-sm">{formatDate(status.lastSessionSave)}</span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">محاولات الاتصال:</span>
                      <span className="text-sm">{status.reconnectAttempts}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* QR Code Display */}
      {status?.qrCode && (
        <Card>
          <CardHeader>
            <CardTitle>امسح QR Code للاتصال</CardTitle>
            <CardDescription>
              افتح الواتساب على هاتفك واذهب إلى الإعدادات {'>'}الأجهزة المرتبطة {'>'} ربط جهاز
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center">
              <div className="bg-white p-4 rounded-lg">
                <img 
                  src={`data:image/png;base64,${status.qrCode}`} 
                  alt="QR Code" 
                  className="w-64 h-64"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Control Buttons */}
      <Card>
        <CardHeader>
          <CardTitle>التحكم في الجلسة</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button 
              onClick={initializeSession}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              {status?.isConnected ? 'إعادة تهيئة' : 'تهيئة الجلسة'}
            </Button>
            
            <Button 
              variant="danger"
              onClick={clearSession}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              حذف الجلسة
            </Button>
            
            <Button 
              variant="secondary"
              onClick={fetchSessionStatus}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              تحديث الحالة
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Test Message */}
      {status?.isConnected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              اختبار إرسال الرسائل
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="testPhoneNumber">رقم الهاتف</Label>
                  <Input
                    id="testPhoneNumber"
                    type="text"
                    placeholder="201234567890"
                    value={testPhoneNumber}
                    onChange={(e) => setTestPhoneNumber(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="testMessage">الرسالة</Label>
                  <Input
                    id="testMessage"
                    type="text"
                    placeholder="رسالة تجريبية"
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                  />
                </div>
              </div>
              
              <Button 
                onClick={sendTestMessage}
                disabled={isLoading || !testPhoneNumber || !testMessage}
                className="flex items-center gap-2"
              >
                <MessageSquare className="h-4 w-4" />
                إرسال رسالة تجريبية
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 