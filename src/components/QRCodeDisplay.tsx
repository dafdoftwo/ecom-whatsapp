'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, QrCode, CheckCircle, AlertCircle } from 'lucide-react';

interface QRCodeDisplayProps {
  onConnectionSuccess?: () => void;
}

export default function QRCodeDisplay({ onConnectionSuccess }: QRCodeDisplayProps) {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [message, setMessage] = useState<string>('');

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
          <Button 
            onClick={fetchQRCode}
            disabled={isLoading}
            variant="outline"
            className="border-red-300 text-red-700 hover:bg-red-100"
          >
            <RefreshCw className={`h-4 w-4 ml-1 ${isLoading ? 'animate-spin' : ''}`} />
            إعادة المحاولة
          </Button>
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
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={fetchQRCode}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ml-1 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'جاري التحضير...' : 'تحديث QR Code'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
} 