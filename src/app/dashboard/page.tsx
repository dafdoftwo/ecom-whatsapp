'use client';

import { useEffect, useState } from 'react';
import { MainLayout } from '@/components/main-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { RefreshCw, Play, Square, MessageSquare, Clock, CheckCircle, XCircle } from 'lucide-react';

interface SheetRow {
  name: string;
  phone: string;
  orderId: string;
  orderStatus: string;
  whatsappStatus?: string;
  lastMessageSent?: string;
  lastUpdated?: string;
  rowIndex?: number;
}

interface AutomationStats {
  engine: {
    isRunning: boolean;
    processedOrdersCount: number;
    trackedOrdersCount: number;
  };
  queues: {
    messageQueue: { waiting: number; active: number; };
    reminderQueue: { waiting: number; };
    rejectedOfferQueue: { waiting: number; };
  };
}

interface WhatsAppStatus {
  isConnected: boolean;
  qrCode?: string;
  clientInfo?: Record<string, unknown>;
}

export default function DashboardPage() {
  const [sheetData, setSheetData] = useState<SheetRow[]>([]);
  const [automationStats, setAutomationStats] = useState<AutomationStats | null>(null);
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      setRefreshing(true);
      
      const [sheetResponse, statsResponse, whatsappResponse] = await Promise.all([
        fetch('/api/sheets/data'),
        fetch('/api/automation/status'),
        fetch('/api/whatsapp/status'),
      ]);

      if (sheetResponse.ok) {
        const data = await sheetResponse.json();
        setSheetData(data);
      }

      if (statsResponse.ok) {
        const stats = await statsResponse.json();
        setAutomationStats(stats);
      }

      if (whatsappResponse.ok) {
        const status = await whatsappResponse.json();
        setWhatsappStatus(status);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const toggleAutomation = async () => {
    try {
      const endpoint = automationStats?.engine.isRunning ? '/api/automation/stop' : '/api/automation/start';
      const response = await fetch(endpoint, { method: 'POST' });
      
      if (response.ok) {
        fetchData(); // Refresh data after toggle
      }
    } catch (error) {
      console.error('Error toggling automation:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      'طلب جديد': { variant: 'default', label: 'طلب جديد' },
      'لا يرد': { variant: 'secondary', label: 'لا يرد' },
      'مرفوض': { variant: 'destructive', label: 'مرفوض' },
      'تم التأكيد': { variant: 'default', label: 'تم التأكيد' },
      'تم الشحن': { variant: 'default', label: 'تم الشحن' },
    };
    
    const config = statusMap[status] || { variant: 'outline' as const, label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
            <p>جاري تحميل البيانات...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">لوحة التحكم</h1>
            <p className="text-muted-foreground">مراقبة النظام وحالة الطلبات</p>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={fetchData} 
              variant="outline" 
              disabled={refreshing}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              تحديث
            </Button>
            <Button 
              onClick={toggleAutomation}
              variant={automationStats?.engine.isRunning ? 'destructive' : 'default'}
              className="gap-2"
            >
              {automationStats?.engine.isRunning ? (
                <>
                  <Square className="h-4 w-4" />
                  إيقاف الأتمتة
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  تشغيل الأتمتة
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">حالة الواتساب</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {whatsappStatus?.isConnected ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-green-600">متصل</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span className="text-red-600">غير متصل</span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">الرسائل في الانتظار</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(automationStats?.queues.messageQueue.waiting || 0) + 
                 (automationStats?.queues.messageQueue.active || 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                {automationStats?.queues.messageQueue.active || 0} قيد التنفيذ
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">التذكيرات المجدولة</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {automationStats?.queues.reminderQueue.waiting || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">عروض الخصم المجدولة</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {automationStats?.queues.rejectedOfferQueue.waiting || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Orders Table */}
        <Card>
          <CardHeader>
            <CardTitle>الطلبات الحالية</CardTitle>
            <CardDescription>
              عرض مباشر لجميع الطلبات وحالة الواتساب
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الاسم</TableHead>
                  <TableHead className="text-right">رقم الهاتف</TableHead>
                  <TableHead className="text-right">رقم الطلب</TableHead>
                  <TableHead className="text-right">حالة الطلب</TableHead>
                  <TableHead className="text-right">حالة الواتساب</TableHead>
                  <TableHead className="text-right">آخر رسالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sheetData.map((row, index) => (
                  <TableRow key={`${row.orderId}-${index}`}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>{row.phone}</TableCell>
                    <TableCell>{row.orderId}</TableCell>
                    <TableCell>{getStatusBadge(row.orderStatus)}</TableCell>
                    <TableCell>
                      {row.whatsappStatus && (
                        <Badge variant="secondary">{row.whatsappStatus}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {row.lastMessageSent || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
} 