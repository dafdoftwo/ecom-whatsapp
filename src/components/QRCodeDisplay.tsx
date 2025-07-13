'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, QrCode, CheckCircle, Trash2, AlertCircle } from 'lucide-react';

interface QRCodeDisplayProps {
  onConnectionSuccess?: () => void;
}

export default function QRCodeDisplay({ onConnectionSuccess }: QRCodeDisplayProps) {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  const fetchQRCode = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/whatsapp/qr-display');
      const data = await response.json();
      
      if (data.success) {
        if (data.isConnected) {
          setIsConnected(true);
          setQrCode(null);
          setMessage('WhatsApp متصل بنجاح!');
          onConnectionSuccess?.();
        } else if (data.qrCode) {
          setQrCode(data.qrCode);
          setMessage(data.message || 'امسح الكود باستخدام الواتساب');
        } else {
          setError(data.message || 'فشل في توليد QR Code');
        }
      } else {
        setError(data.message || data.error || 'فشل في الحصول على QR Code');
      }
    } catch (err) {
      setError('خطأ في الاتصال بالخادم');
      console.error('Error fetching QR code:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const regenerateQRCode = async () => {
    setIsLoading(true);
    setError(null);
    setMessage('جاري إعادة توليد QR Code...');
    
    try {
      const response = await fetch('/api/whatsapp/regenerate-qr', {
        method: 'POST'
      });
      const data = await response.json();
      
      if (data.success && data.qrCode) {
        setQrCode(data.qrCode);
        setIsConnected(false);
        setMessage('تم توليد QR Code جديد - امسح الكود للاتصال');
      } else {
        setError(data.message || 'فشل في إعادة توليد QR Code');
      }
    } catch (err) {
      setError('خطأ في إعادة توليد QR Code');
      console.error('Error regenerating QR code:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const clearSession = async () => {
    setIsLoading(true);
    setError(null);
    setShowConfirmClear(false);
    
    try {
      const response = await fetch('/api/whatsapp/clear-session', {
        method: 'POST'
      });
      const data = await response.json();
      
      if (data.success) {
        setIsConnected(false);
        setQrCode(null);
        setMessage('تم حذف الجلسة بنجاح - جاري توليد QR Code جديد...');
        // Wait a bit then fetch new QR
        setTimeout(() => fetchQRCode(), 2000);
      } else {
        setError(data.message || 'فشل في حذف الجلسة');
      }
    } catch (err) {
      setError('خطأ في حذف الجلسة');
      console.error('Error clearing session:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-refresh to check for connection
  useEffect(() => {
    if (qrCode && !isConnected) {
      const interval = setInterval(async () => {
        try {
          const response = await fetch('/api/whatsapp/status');
          const status = await response.json();
          
          if (status.isConnected) {
            setIsConnected(true);
            setQrCode(null);
            setMessage('WhatsApp متصل بنجاح!');
            onConnectionSuccess?.();
            clearInterval(interval);
          }
        } catch (err) {
          console.error('Error checking connection status:', err);
        }
      }, 3000);

      return () => clearInterval(interval);
    }
  }, [qrCode, isConnected, onConnectionSuccess]);

  // Initial load
  useEffect(() => {
    fetchQRCode();
  }, []);

  // Confirmation dialog for clearing session
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

  if (isConnected) {
    return (
      <Card className="border-2 border-green-200 bg-green-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-800">
            <CheckCircle className="h-5 w-5" />
            WhatsApp متصل بنجاح
          </CardTitle>
          <CardDescription className="text-green-600">
            النظام متصل بالواتساب ويعمل بشكل طبيعي
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button 
              variant="warning" 
              size="sm"
              onClick={() => setShowConfirmClear(true)}
              className="text-orange-600 hover:text-orange-700"
            >
              <Trash2 className="h-4 w-4 ml-1" />
              حذف الجلسة الحالية
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-2 border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-800">
            <AlertCircle className="h-5 w-5" />
            خطأ في الاتصال
          </CardTitle>
          <CardDescription className="text-red-600">
            {error}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button 
              variant="secondary" 
              size="sm"
              onClick={fetchQRCode}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ml-1 ${isLoading ? 'animate-spin' : ''}`} />
              المحاولة مرة أخرى
            </Button>
            <Button 
              variant="warning" 
              size="sm"
              onClick={() => setShowConfirmClear(true)}
              className="text-orange-600 hover:text-orange-700"
            >
              <Trash2 className="h-4 w-4 ml-1" />
              حذف الجلسة
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-blue-200 bg-blue-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="h-5 w-5 text-blue-600" />
          مسح QR Code للاتصال بالواتساب
        </CardTitle>
        <CardDescription>
          {isLoading ? 'جاري تحضير الكود...' : message || 'امسح هذا الكود باستخدام تطبيق الواتساب على هاتفك المحمول'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center w-64 h-64 bg-white rounded-lg">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : qrCode ? (
            <>
              <div className="bg-white p-4 rounded-lg shadow-sm">
                <img 
                  src={qrCode} 
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
            </>
          ) : (
            <div className="text-center">
              <p className="text-gray-500 mb-4">لا يوجد QR Code متاح</p>
            </div>
          )}
          
          <div className="flex gap-2 flex-wrap justify-center">
            <Button 
              variant="primary" 
              size="sm"
              onClick={regenerateQRCode}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ml-1 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? 'جاري التحضير...' : 'إعادة توليد QR Code'}
            </Button>
            
            <Button 
              variant="warning" 
              size="sm"
              onClick={() => setShowConfirmClear(true)}
              disabled={isLoading}
              className="text-orange-600 hover:text-orange-700"
            >
              <Trash2 className="h-4 w-4 ml-1" />
              حذف الجلسة
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 