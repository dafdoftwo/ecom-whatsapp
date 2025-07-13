'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  RefreshCw, 
  Trash2, 
  Activity,
  Smartphone,
  Clock,
  Database,
  Zap,
  Settings
} from 'lucide-react';

interface ConnectionStatus {
  success: boolean;
  connection: {
    isConnected: boolean;
    quality: 'excellent' | 'good' | 'poor' | 'critical';
    uptime: string;
    uptimeMs: number;
    clientInfo: any;
    qrCode: string | null;
  };
  session: {
    exists: boolean;
    isValid: boolean;
    health: 'healthy' | 'degraded' | 'critical';
    canRestore: boolean;
    size: number;
    lastModified: string | null;
  };
  health: {
    sessionHealth: 'healthy' | 'degraded' | 'critical';
    reconnectAttempts: number;
    browserRestarts: number;
    lastHeartbeat: string | null;
    isInitializing: boolean;
  };
  recommendations: {
    shouldClearSession: boolean;
    shouldReconnect: boolean;
    needsQRScan: boolean;
  };
  timestamp: string;
}

interface PersistentWhatsAppManagerProps {
  onConnectionSuccess?: () => void;
  autoStart?: boolean;
}

export default function PersistentWhatsAppManager({ 
  onConnectionSuccess, 
  autoStart = true 
}: PersistentWhatsAppManagerProps) {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Fetch connection status
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/whatsapp/persistent-connection');
      const data = await response.json();
      
      if (data.success) {
        setStatus(data);
        setError(null);
        
        // Trigger success callback if connected
        if (data.connection.isConnected && onConnectionSuccess) {
          onConnectionSuccess();
        }
      } else {
        setError(data.error || 'Failed to fetch status');
      }
    } catch (err) {
      setError('Network error while fetching status');
      console.error('Error fetching status:', err);
    }
  }, [onConnectionSuccess]);

  // Execute action
  const executeAction = async (action: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/whatsapp/persistent-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      
      const data = await response.json();
      
      if (data.success) {
        await fetchStatus(); // Refresh status after action
      } else {
        setError(data.error || data.message || 'Action failed');
      }
    } catch (err) {
      setError('Network error while executing action');
      console.error('Error executing action:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-refresh status
  useEffect(() => {
    fetchStatus();
    
    if (autoRefresh) {
      const interval = setInterval(fetchStatus, 5000); // Refresh every 5 seconds
      return () => clearInterval(interval);
    }
  }, [fetchStatus, autoRefresh]);

  // Auto-start if enabled
  useEffect(() => {
    if (autoStart && status && !status.connection.isConnected && !status.health.isInitializing) {
      executeAction('initialize');
    }
  }, [autoStart, status]);

  // Get connection quality color
  const getQualityColor = (quality: string) => {
    switch (quality) {
      case 'excellent': return 'bg-green-500';
      case 'good': return 'bg-blue-500';
      case 'poor': return 'bg-yellow-500';
      case 'critical': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  // Get health status icon
  const getHealthIcon = (health: string) => {
    switch (health) {
      case 'healthy': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'degraded': return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'critical': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  if (!status) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            اتصال الواتساب المستمر
          </CardTitle>
          <CardDescription>جاري تحميل حالة الاتصال...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <RefreshCw className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            اتصال الواتساب المستمر
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={status.connection.isConnected ? "default" : "destructive"}>
              {status.connection.isConnected ? 'متصل' : 'غير متصل'}
            </Badge>
            <div className={`w-3 h-3 rounded-full ${getQualityColor(status.connection.quality)}`} />
          </div>
        </CardTitle>
        <CardDescription>
          إدارة الاتصال المستمر مع الواتساب مع المراقبة التلقائية والاستعادة
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Connection Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <Activity className="h-5 w-5 text-blue-500" />
            <div>
              <p className="font-medium">جودة الاتصال</p>
              <p className="text-sm text-gray-600 capitalize">{status.connection.quality}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <Clock className="h-5 w-5 text-green-500" />
            <div>
              <p className="font-medium">مدة التشغيل</p>
              <p className="text-sm text-gray-600">{status.connection.uptime}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <Database className="h-5 w-5 text-purple-500" />
            <div>
              <p className="font-medium">حالة الجلسة</p>
              <div className="flex items-center gap-1">
                {getHealthIcon(status.session.health)}
                <span className="text-sm">{status.session.health}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Client Info */}
        {status.connection.clientInfo && (
          <div className="p-3 bg-green-50 rounded-lg">
            <p className="font-medium text-green-800">متصل كـ:</p>
            <p className="text-sm text-green-600">
              {status.connection.clientInfo.pushname} ({status.connection.clientInfo.wid?.user})
            </p>
          </div>
        )}

        {/* QR Code */}
        {status.connection.qrCode && (
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <p className="font-medium text-blue-800 mb-3">امسح الكود لتسجيل الدخول</p>
            <div className="flex justify-center">
              <img 
                src={status.connection.qrCode} 
                alt="QR Code" 
                className="max-w-xs border rounded-lg shadow-md"
                style={{ maxWidth: '300px', maxHeight: '300px' }}
                onError={(e) => {
                  console.error('QR Code image load error:', e);
                  // Hide the image if it fails to load
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <p className="text-sm text-blue-600 mt-2">
              استخدم تطبيق الواتساب لمسح الكود
            </p>
          </div>
        )}

        {/* Recommendations */}
        {(status.recommendations.shouldClearSession || 
          status.recommendations.shouldReconnect || 
          status.recommendations.needsQRScan) && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>توصيات:</strong>
              <ul className="mt-2 space-y-1">
                {status.recommendations.shouldClearSession && (
                  <li>• يُنصح بمسح الجلسة وإعادة التشغيل</li>
                )}
                {status.recommendations.shouldReconnect && (
                  <li>• يمكن إعادة الاتصال باستخدام الجلسة الحالية</li>
                )}
                {status.recommendations.needsQRScan && (
                  <li>• يحتاج مسح QR كود للمصادقة</li>
                )}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => executeAction('initialize')}
            disabled={isLoading}
            variant={status.connection.isConnected ? "outline" : "default"}
          >
            {isLoading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
            تهيئة الاتصال
          </Button>
          
          <Button
            onClick={() => executeAction('reconnect')}
            disabled={isLoading}
            variant="outline"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            إعادة الاتصال
          </Button>
          
          <Button
            onClick={() => executeAction('clear-session')}
            disabled={isLoading}
            variant="destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            مسح الجلسة
          </Button>
          
          <Button
            onClick={() => setShowAdvanced(!showAdvanced)}
            variant="outline"
            size="sm"
          >
            <Settings className="h-4 w-4 mr-2" />
            خيارات متقدمة
          </Button>
        </div>

        {/* Advanced Options */}
        {showAdvanced && (
          <>
            <Separator />
            <div className="space-y-4">
              <h4 className="font-medium">خيارات متقدمة</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">إحصائيات الاتصال</p>
                  <div className="text-sm space-y-1">
                    <p>محاولات إعادة الاتصال: {status.health.reconnectAttempts}</p>
                    <p>إعادة تشغيل المتصفح: {status.health.browserRestarts}</p>
                    <p>حجم الجلسة: {status.session.size}MB</p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <p className="text-sm font-medium">آخر فحص</p>
                  <div className="text-sm space-y-1">
                    <p>النبضة الأخيرة: {status.health.lastHeartbeat ? 
                      new Date(status.health.lastHeartbeat).toLocaleString('ar-EG') : 
                      'غير متاح'}</p>
                    <p>تحديث الحالة: {new Date(status.timestamp).toLocaleString('ar-EG')}</p>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button
                  onClick={() => executeAction('health-check')}
                  disabled={isLoading}
                  variant="outline"
                  size="sm"
                >
                  فحص الصحة
                </Button>
                
                <Button
                  onClick={() => executeAction('restart-browser')}
                  disabled={isLoading}
                  variant="outline"
                  size="sm"
                >
                  إعادة تشغيل المتصفح
                </Button>
                
                <Button
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  variant="outline"
                  size="sm"
                >
                  {autoRefresh ? 'إيقاف' : 'تشغيل'} التحديث التلقائي
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
} 