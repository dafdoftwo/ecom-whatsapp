'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Play, RotateCcw, MessageSquare, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';

interface NewOrderStats {
  totalNewOrderMessages: number;
  recentNewOrders: Array<{
    orderId: string;
    timestamp: string;
    hoursSinceSent: number;
  }>;
}

interface ForceProcessResult {
  success: boolean;
  totalOrders: number;
  newOrdersFound: number;
  messagesQueued: number;
  skipped: number;
  errors: string[];
}

export default function NewOrderDebugger() {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<NewOrderStats | null>(null);
  const [lastResult, setLastResult] = useState<ForceProcessResult | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/automation/new-order-stats');
      const data = await response.json();
      
      if (data.success) {
        setStats(data.newOrderStats);
        setMessage({ type: 'success', text: 'تم تحديث الإحصائيات بنجاح' });
      } else {
        setMessage({ type: 'error', text: data.arabicError || data.error });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'فشل في جلب الإحصائيات' });
    } finally {
      setLoading(false);
    }
  };

  const forceProcessNewOrders = async () => {
    try {
      setLoading(true);
      setMessage({ type: 'warning', text: 'جاري المعالجة القسرية للطلبات الجديدة...' });
      
      const response = await fetch('/api/automation/force-process-new-orders', {
        method: 'POST'
      });
      const data = await response.json();
      
      setLastResult(data.result);
      
      if (data.success) {
        setMessage({ 
          type: 'success', 
          text: `تمت المعالجة بنجاح! تم العثور على ${data.result.newOrdersFound} طلبات جديدة وتم جدولة ${data.result.messagesQueued} رسائل` 
        });
        // Refresh stats after processing
        setTimeout(fetchStats, 1000);
      } else {
        setMessage({ type: 'error', text: data.arabicError || data.error });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'فشل في المعالجة القسرية' });
    } finally {
      setLoading(false);
    }
  };

  const resetTracking = async () => {
    if (!confirm('هل أنت متأكد من إعادة تعيين تتبع الرسائل؟ هذا سيسمح بإعادة إرسال الرسائل المرسلة مسبقاً.')) {
      return;
    }

    try {
      setLoading(true);
      setMessage({ type: 'warning', text: 'جاري إعادة تعيين تتبع الرسائل...' });
      
      const response = await fetch('/api/automation/reset-tracking', {
        method: 'POST'
      });
      const data = await response.json();
      
      if (data.success) {
        setMessage({ 
          type: 'success', 
          text: `تم إعادة التعيين بنجاح! تم مسح ${data.result.clearedSentMessages} رسالة مرسلة` 
        });
        // Clear local stats
        setStats(null);
        setLastResult(null);
      } else {
        setMessage({ type: 'error', text: data.arabicError || data.error });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'فشل في إعادة تعيين التتبع' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            مشخص الطلبات الجديدة
          </CardTitle>
          <CardDescription>
            أداة لتشخيص وإصلاح مشكلة عدم إرسال رسائل الطلبات الجديدة
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button 
              onClick={fetchStats} 
              disabled={loading}
              variant="secondary"
              size="sm"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              تحديث الإحصائيات
            </Button>
            
            <Button 
              onClick={forceProcessNewOrders} 
              disabled={loading}
              size="sm"
            >
              <Play className="w-4 h-4 mr-2" />
              معالجة قسرية للطلبات الجديدة
            </Button>
            
            <Button 
              onClick={resetTracking} 
              disabled={loading}
              variant="danger"
              size="sm"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              إعادة تعيين التتبع
            </Button>
          </div>

          {/* Messages */}
          {message && (
            <Alert className={message.type === 'error' ? 'border-red-500' : message.type === 'warning' ? 'border-yellow-500' : 'border-green-500'}>
              {message.type === 'error' ? <XCircle className="w-4 h-4" /> : 
               message.type === 'warning' ? <AlertTriangle className="w-4 h-4" /> : 
               <CheckCircle className="w-4 h-4" />}
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          )}

          {/* Stats Display */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">إحصائيات الرسائل</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>إجمالي رسائل الطلبات الجديدة:</span>
                      <Badge variant="secondary">{stats.totalNewOrderMessages}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>الرسائل الحديثة (آخر 10):</span>
                      <Badge variant="outline">{stats.recentNewOrders.length}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">الرسائل الأحدث</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {stats.recentNewOrders.length > 0 ? (
                      stats.recentNewOrders.slice(0, 5).map((order, index) => (
                        <div key={index} className="flex justify-between items-center text-xs">
                          <span className="font-mono">{order.orderId}</span>
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{order.hoursSinceSent.toFixed(1)}س</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <span className="text-sm text-gray-500">لا توجد رسائل حديثة</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Last Process Result */}
          {lastResult && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">نتيجة آخر معالجة قسرية</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                  <div className="text-center">
                    <div className="font-semibold">{lastResult.totalOrders}</div>
                    <div className="text-gray-500">إجمالي الطلبات</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-blue-600">{lastResult.newOrdersFound}</div>
                    <div className="text-gray-500">طلبات جديدة</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-green-600">{lastResult.messagesQueued}</div>
                    <div className="text-gray-500">رسائل مجدولة</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-yellow-600">{lastResult.skipped}</div>
                    <div className="text-gray-500">مُتجاهلة</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-red-600">{lastResult.errors.length}</div>
                    <div className="text-gray-500">أخطاء</div>
                  </div>
                </div>
                
                {lastResult.errors.length > 0 && (
                  <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs">
                    <div className="font-semibold text-red-800 mb-1">الأخطاء:</div>
                    {lastResult.errors.slice(0, 3).map((error, index) => (
                      <div key={index} className="text-red-700">{error}</div>
                    ))}
                    {lastResult.errors.length > 3 && (
                      <div className="text-red-600">...و {lastResult.errors.length - 3} أخطاء أخرى</div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Instructions */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <h4 className="font-semibold text-blue-800 mb-2">كيفية الاستخدام:</h4>
              <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
                <li><strong>تحديث الإحصائيات:</strong> لعرض حالة رسائل الطلبات الجديدة الحالية</li>
                <li><strong>معالجة قسرية:</strong> لفرض إرسال رسائل للطلبات ذات الحالة "جديد"</li>
                <li><strong>إعادة تعيين التتبع:</strong> لمسح ذاكرة الرسائل المرسلة (استخدم بحذر)</li>
              </ol>
              <div className="mt-2 p-2 bg-yellow-100 border border-yellow-300 rounded text-xs text-yellow-800">
                <strong>تحذير:</strong> إعادة تعيين التتبع سيسمح بإعادة إرسال الرسائل للعملاء الذين تم إرسال رسائل لهم مسبقاً.
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
} 