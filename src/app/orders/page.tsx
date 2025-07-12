'use client';

import React, { useState, useEffect } from 'react';

interface ProcessedOrder {
  rowIndex: number;
  customerName: string;
  primaryPhone: string;
  secondaryPhone: string;
  whatsappNumber: string;
  productName: string;
  productValue: string;
  orderStatus: string;
  processedPhone: string;
  phoneValidation: {
    isValid: boolean;
    isEgyptian: boolean;
    errors: string[];
    originalFormat: string;
    finalFormat: string;
  };
  whatsappValidation: {
    isRegistered: boolean;
    isValid: boolean;
    error?: string;
  };
  sentMessages: Array<{
    type: string;
    timestamp: string;
    status: 'sent' | 'failed' | 'pending';
  }>;
  lastUpdate: string;
  orderDate?: string;
  governorate?: string;
  area?: string;
  address?: string;
}

interface OrdersStats {
  total: number;
  valid: number;
  invalid: number;
  withErrors: number;
  egyptian: number;
  whatsappRegistered: number;
  messagesSent: number;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<ProcessedOrder[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<ProcessedOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [stats, setStats] = useState<OrdersStats>({
    total: 0,
    valid: 0,
    invalid: 0,
    withErrors: 0,
    egyptian: 0,
    whatsappRegistered: 0,
    messagesSent: 0
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [phoneFilter, setPhoneFilter] = useState('all');

  useEffect(() => {
    loadOrders();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadOrders, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    applyFilters();
  }, [orders, searchTerm, statusFilter, phoneFilter]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/orders/processed');
      const data = await response.json();
      
      if (data.success) {
        setOrders(data.orders);
        setStats(data.stats);
        setLastSync(new Date().toLocaleString('ar-EG'));
      }
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = orders;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(order => 
        order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.processedPhone.includes(searchTerm) ||
        order.orderStatus.includes(searchTerm)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(order => {
        switch (statusFilter) {
          case 'new': return ['جديد', 'طلب جديد', 'قيد المراجعة', 'قيد المراجعه', ''].includes(order.orderStatus);
          case 'no_answer': return ['لم يتم الرد', 'لم يرد', 'لا يرد', 'عدم الرد'].includes(order.orderStatus);
          case 'confirmed': return ['تم التأكيد', 'تم التاكيد', 'مؤكد'].includes(order.orderStatus);
          case 'shipped': return ['تم الشحن', 'قيد الشحن'].includes(order.orderStatus);
          case 'rejected': return ['تم الرفض', 'مرفوض', 'رفض الاستلام', 'رفض الأستلام', 'لم يتم الاستلام'].includes(order.orderStatus);
          case 'delivered': return ['تم التوصيل', 'تم التوصيل بنجاح'].includes(order.orderStatus);
          default: return true;
        }
      });
    }

    // Phone filter
    if (phoneFilter !== 'all') {
      filtered = filtered.filter(order => {
        switch (phoneFilter) {
          case 'valid': return order.phoneValidation.isValid;
          case 'invalid': return !order.phoneValidation.isValid;
          case 'egyptian': return order.phoneValidation.isEgyptian;
          case 'whatsapp': return order.whatsappValidation.isRegistered;
          case 'errors': return order.primaryPhone.includes('#ERROR!') || order.secondaryPhone.includes('#ERROR!');
          default: return true;
        }
      });
    }

    setFilteredOrders(filtered);
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, string> = {
      'جديد': 'badge-primary',
      'طلب جديد': 'badge-primary',
      'قيد المراجعة': 'badge-primary',
      'قيد المراجعه': 'badge-primary',
      'لم يتم الرد': 'badge-warning',
      'لم يرد': 'badge-warning',
      'لا يرد': 'badge-warning',
      'عدم الرد': 'badge-warning',
      'تم التأكيد': 'badge-success',
      'تم التاكيد': 'badge-success',
      'مؤكد': 'badge-success',
      'تم الشحن': 'badge-secondary',
      'قيد الشحن': 'badge-secondary',
      'تم الرفض': 'badge-danger',
      'مرفوض': 'badge-danger',
      'رفض الاستلام': 'badge-danger',
      'رفض الأستلام': 'badge-danger',
      'لم يتم الاستلام': 'badge-danger',
      'تم التوصيل': 'badge-success',
      'تم التوصيل بنجاح': 'badge-success'
    };

    const badgeClass = statusMap[status] || 'badge-secondary';
    
    return (
      <span className={`badge ${badgeClass}`}>
        {status || 'غير محدد'}
      </span>
    );
  };

  const getMessageIndicators = (sentMessages: ProcessedOrder['sentMessages']) => {
    const messageTypes = ['newOrder', 'noAnswer', 'shipped', 'rejectedOffer', 'reminder'];
    const typeLabels = {
      newOrder: '🆕',
      noAnswer: '📞', 
      shipped: '🚚',
      rejectedOffer: '🎁',
      reminder: '⏰'
    };

    return (
      <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
        {messageTypes.map(type => {
          const message = sentMessages.find(m => m.type === type);
          if (message) {
            const badgeClass = message.status === 'sent' ? 'badge-success' : 
                             message.status === 'failed' ? 'badge-danger' : 'badge-secondary';
            return (
              <span 
                key={type} 
                className={`badge ${badgeClass}`}
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                title={`${type}: ${message.status} - ${new Date(message.timestamp).toLocaleString('ar-EG')}`}
              >
                {typeLabels[type as keyof typeof typeLabels]}
              </span>
            );
          }
          return null;
        })}
      </div>
    );
  };

  const exportToCSV = () => {
    const headers = ['اسم العميل', 'رقم الهاتف المعالج', 'اسم المنتج', 'قيمة المنتج', 'حالة الطلب', 'صحة الرقم', 'واتساب مسجل', 'رسائل مرسلة'];
    const csvData = filteredOrders.map(order => [
      order.customerName,
      order.processedPhone,
      order.productName,
      order.productValue,
      order.orderStatus,
      order.phoneValidation.isValid ? 'صحيح' : 'خاطئ',
      order.whatsappValidation.isRegistered ? 'نعم' : 'لا',
      order.sentMessages.length.toString()
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `orders-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div style={{ background: 'linear-gradient(135deg, var(--gray-50), var(--white))' }}>
      {/* Header Section */}
      <div style={{ 
        background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))', 
        color: 'white',
        padding: '3rem 0 4rem 0',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(120, 119, 198, 0.3) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.1) 0%, transparent 50%)',
          pointerEvents: 'none'
        }} />
        
        <div className="container" style={{ position: 'relative' }}>
      <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div style={{ 
                  background: 'rgba(255, 255, 255, 0.2)', 
                  padding: '1rem', 
                  borderRadius: 'var(--border-radius-lg)',
                  backdropFilter: 'blur(10px)'
                }}>
                  <span style={{ fontSize: '2rem' }}>📦</span>
                </div>
          <div>
                  <h1 style={{ fontSize: '2.5rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                    إدارة الطلبات
                  </h1>
                  <p style={{ fontSize: '1.1rem', opacity: '0.9', marginBottom: '0' }}>
                    نظام متقدم لإدارة ومتابعة طلبات العملاء المصريين
                  </p>
          </div>
        </div>
      </div>

            <div className="flex gap-2">
              <button 
                className="btn btn-secondary"
                onClick={exportToCSV}
                style={{ backdropFilter: 'blur(10px)', background: 'rgba(255, 255, 255, 0.2)', border: '1px solid rgba(255, 255, 255, 0.3)' }}
              >
                <span style={{ marginLeft: '0.5rem' }}>💾</span>
                تصدير Excel
              </button>
              <button 
                className="btn"
                onClick={loadOrders} 
                disabled={loading}
                style={{ backdropFilter: 'blur(10px)', background: 'rgba(255, 255, 255, 0.2)', border: '1px solid rgba(255, 255, 255, 0.3)' }}
              >
                <span style={{ marginLeft: '0.5rem' }}>{loading ? '⟳' : '🔄'}</span>
                {loading ? 'جاري التحديث...' : 'تحديث البيانات'}
              </button>
            </div>
          </div>
        </div>
      </div>
        
      <div className="container" style={{ paddingTop: '2rem', paddingBottom: '2rem', marginTop: '-2rem', position: 'relative', zIndex: 1 }}>
        
        {/* Statistics Cards - Enhanced Design */}
        <div className="grid grid-cols-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
          <div className="stat-card" style={{ 
            background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))', 
            color: 'white',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ position: 'absolute', top: '10px', right: '15px', fontSize: '2rem', opacity: '0.3' }}>👥</div>
            <div className="stat-number">{stats.total}</div>
            <div className="stat-label" style={{ color: 'rgba(255,255,255,0.9)' }}>إجمالي الطلبات</div>
          </div>
          
          <div className="stat-card" style={{ 
            background: 'linear-gradient(135deg, var(--success), #047857)', 
            color: 'white',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ position: 'absolute', top: '10px', right: '15px', fontSize: '2rem', opacity: '0.3' }}>✅</div>
            <div className="stat-number">{stats.valid}</div>
            <div className="stat-label" style={{ color: 'rgba(255,255,255,0.9)' }}>أرقام صحيحة</div>
            </div>

          <div className="stat-card" style={{ 
            background: 'linear-gradient(135deg, var(--danger), #b91c1c)', 
            color: 'white',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ position: 'absolute', top: '10px', right: '15px', fontSize: '2rem', opacity: '0.3' }}>❌</div>
            <div className="stat-number">{stats.invalid}</div>
            <div className="stat-label" style={{ color: 'rgba(255,255,255,0.9)' }}>أرقام خاطئة</div>
          </div>

          <div className="stat-card" style={{ 
            background: 'linear-gradient(135deg, var(--warning), #b45309)', 
            color: 'white',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ position: 'absolute', top: '10px', right: '15px', fontSize: '2rem', opacity: '0.3' }}>⚠️</div>
            <div className="stat-number">{stats.withErrors}</div>
            <div className="stat-label" style={{ color: 'rgba(255,255,255,0.9)' }}>أخطاء معالجة</div>
          </div>

          <div className="stat-card" style={{ 
            background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', 
            color: 'white',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ position: 'absolute', top: '10px', right: '15px', fontSize: '2rem', opacity: '0.3' }}>🇪🇬</div>
            <div className="stat-number">{stats.egyptian}</div>
            <div className="stat-label" style={{ color: 'rgba(255,255,255,0.9)' }}>أرقام مصرية</div>
          </div>

          <div className="stat-card" style={{ 
            background: 'linear-gradient(135deg, #10b981, #065f46)', 
            color: 'white',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ position: 'absolute', top: '10px', right: '15px', fontSize: '2rem', opacity: '0.3' }}>💬</div>
            <div className="stat-number">{stats.whatsappRegistered}</div>
            <div className="stat-label" style={{ color: 'rgba(255,255,255,0.9)' }}>واتساب مسجل</div>
          </div>

          <div className="stat-card" style={{ 
            background: 'linear-gradient(135deg, #f59e0b, #d97706)', 
            color: 'white',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ position: 'absolute', top: '10px', right: '15px', fontSize: '2rem', opacity: '0.3' }}>📨</div>
            <div className="stat-number">{stats.messagesSent}</div>
            <div className="stat-label" style={{ color: 'rgba(255,255,255,0.9)' }}>رسائل مرسلة</div>
          </div>
      </div>

        {/* Enhanced Filters Card */}
        <div className="card mb-4">
          <div className="card-header" style={{ background: 'linear-gradient(135deg, var(--gray-50), var(--white))' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0' }}>
              <span style={{ fontSize: '1.2rem' }}>🔍</span>
            فلترة وبحث الطلبات
            </h3>
            <p style={{ marginBottom: '0', fontSize: '0.9rem', color: 'var(--gray-600)' }}>
              ابحث وصفي طلباتك بسهولة
            </p>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
              <div>
                <label className="label">🔍 البحث السريع</label>
                <input
                  type="text"
                  className="input"
                  placeholder="اسم العميل، المنتج، رقم الهاتف..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

              <div>
                <label className="label">📋 حالة الطلب</label>
              <select 
                  className="input"
                value={statusFilter} 
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">جميع الحالات</option>
                  <option value="new">🆕 طلبات جديدة</option>
                  <option value="no_answer">📞 لم يرد</option>
                  <option value="confirmed">✅ تم التأكيد</option>
                  <option value="shipped">🚚 تم الشحن</option>
                  <option value="rejected">❌ مرفوض</option>
                  <option value="delivered">📦 تم التوصيل</option>
              </select>
            </div>

              <div>
                <label className="label">📱 حالة الرقم</label>
              <select 
                  className="input"
                value={phoneFilter} 
                onChange={(e) => setPhoneFilter(e.target.value)}
              >
                <option value="all">جميع الأرقام</option>
                  <option value="valid">✅ أرقام صحيحة</option>
                  <option value="invalid">❌ أرقام خاطئة</option>
                  <option value="egyptian">🇪🇬 أرقام مصرية</option>
                  <option value="whatsapp">💬 مسجل على واتساب</option>
                  <option value="errors">⚠️ يحتوي على أخطاء</option>
              </select>
            </div>

              <div>
                <label className="label">⏰ آخر تحديث</label>
                <div className="input" style={{ background: 'var(--gray-100)', color: 'var(--gray-600)' }}>
                {lastSync || 'لم يتم التحديث بعد'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Orders Table */}
        <div className="card">
          <div className="card-header" style={{ background: 'linear-gradient(135deg, var(--primary-light), rgba(124, 58, 237, 0.1))' }}>
            <div className="flex items-center justify-between">
              <h3 style={{ marginBottom: '0' }}>
                📊 قائمة الطلبات ({filteredOrders.length} من {orders.length})
              </h3>
              <div className="flex gap-2" style={{ fontSize: '0.875rem' }}>
                <span className="badge badge-primary">🆕 جديد</span>
                <span className="badge badge-warning">📞 لم يرد</span>
                <span className="badge badge-secondary">🚚 شحن</span>
                <span className="badge badge-success">🎁 عرض</span>
                <span className="badge badge-secondary">⏰ تذكير</span>
              </div>
            </div>
          </div>
          <div className="card-body" style={{ padding: '0' }}>
          {loading ? (
              <div className="text-center" style={{ padding: '3rem' }}>
                <div className="loading" style={{ width: '60px', height: '60px', margin: '0 auto 1rem' }}></div>
                <h3>جاري تحميل البيانات</h3>
                <p style={{ color: 'var(--gray-600)' }}>يتم جلب أحدث البيانات من Google Sheets...</p>
            </div>
          ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ 
                  width: '100%', 
                  borderCollapse: 'collapse',
                  fontSize: '0.875rem'
                }}>
                <thead>
                    <tr style={{ background: 'var(--gray-100)' }}>
                      <th style={{ padding: '1rem 0.75rem', textAlign: 'center', borderBottom: '2px solid var(--gray-200)', fontWeight: '600' }}>الصف</th>
                      <th style={{ padding: '1rem 0.75rem', textAlign: 'right', borderBottom: '2px solid var(--gray-200)', fontWeight: '600' }}>اسم العميل</th>
                      <th style={{ padding: '1rem 0.75rem', textAlign: 'right', borderBottom: '2px solid var(--gray-200)', fontWeight: '600' }}>الرقم المعالج</th>
                      <th style={{ padding: '1rem 0.75rem', textAlign: 'right', borderBottom: '2px solid var(--gray-200)', fontWeight: '600' }}>رقم إضافي</th>
                      <th style={{ padding: '1rem 0.75rem', textAlign: 'right', borderBottom: '2px solid var(--gray-200)', fontWeight: '600' }}>اسم المنتج</th>
                      <th style={{ padding: '1rem 0.75rem', textAlign: 'center', borderBottom: '2px solid var(--gray-200)', fontWeight: '600' }}>القيمة</th>
                      <th style={{ padding: '1rem 0.75rem', textAlign: 'center', borderBottom: '2px solid var(--gray-200)', fontWeight: '600' }}>حالة الطلب</th>
                      <th style={{ padding: '1rem 0.75rem', textAlign: 'center', borderBottom: '2px solid var(--gray-200)', fontWeight: '600' }}>حالة الرقم</th>
                      <th style={{ padding: '1rem 0.75rem', textAlign: 'center', borderBottom: '2px solid var(--gray-200)', fontWeight: '600' }}>واتساب</th>
                      <th style={{ padding: '1rem 0.75rem', textAlign: 'center', borderBottom: '2px solid var(--gray-200)', fontWeight: '600' }}>الرسائل المرسلة</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order, index) => (
                      <tr key={order.rowIndex} style={{ 
                        background: index % 2 === 0 ? 'var(--white)' : 'var(--gray-50)',
                        transition: 'all 0.2s ease'
                      }}>
                        <td style={{ 
                          padding: '1rem 0.75rem', 
                          textAlign: 'center', 
                          borderBottom: '1px solid var(--gray-200)',
                          fontFamily: 'monospace',
                          fontWeight: '600',
                          color: 'var(--primary)'
                        }}>
                        {order.rowIndex}
                      </td>
                        <td style={{ 
                          padding: '1rem 0.75rem', 
                          borderBottom: '1px solid var(--gray-200)',
                          fontWeight: '600'
                        }}>
                        {order.customerName}
                      </td>
                        <td style={{ padding: '1rem 0.75rem', borderBottom: '1px solid var(--gray-200)' }}>
                          <div>
                            <div style={{ fontFamily: 'monospace', marginBottom: '0.25rem' }}>
                            {order.processedPhone}
                          </div>
                          {(order.primaryPhone.includes('#ERROR!') || order.secondaryPhone.includes('#ERROR!')) && (
                              <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>
                              ERROR معالج
                              </span>
                          )}
                        </div>
                      </td>
                        <td style={{ 
                          padding: '1rem 0.75rem', 
                          borderBottom: '1px solid var(--gray-200)',
                          fontFamily: 'monospace',
                          fontSize: '0.8rem',
                          color: 'var(--gray-600)'
                        }}>
                        {order.secondaryPhone && order.secondaryPhone !== order.processedPhone 
                          ? order.secondaryPhone 
                          : '-'
                        }
                      </td>
                        <td style={{ padding: '1rem 0.75rem', borderBottom: '1px solid var(--gray-200)' }}>
                        {order.productName}
                      </td>
                        <td style={{ 
                          padding: '1rem 0.75rem', 
                          textAlign: 'center', 
                          borderBottom: '1px solid var(--gray-200)',
                          fontWeight: '600',
                          color: 'var(--success)'
                        }}>
                        {order.productValue}
                      </td>
                        <td style={{ padding: '1rem 0.75rem', textAlign: 'center', borderBottom: '1px solid var(--gray-200)' }}>
                        {getStatusBadge(order.orderStatus)}
                      </td>
                        <td style={{ padding: '1rem 0.75rem', textAlign: 'center', borderBottom: '1px solid var(--gray-200)' }}>
                          <div>
                            <span className={`badge ${order.phoneValidation.isValid ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.7rem', marginBottom: '0.25rem', display: 'block' }}>
                            {order.phoneValidation.isValid ? '✓ صحيح' : '✗ خاطئ'}
                            </span>
                          {order.phoneValidation.isEgyptian && (
                              <span className="badge badge-secondary" style={{ fontSize: '0.7rem' }}>
                              🇪🇬 مصري
                              </span>
                          )}
                        </div>
                      </td>
                        <td style={{ padding: '1rem 0.75rem', textAlign: 'center', borderBottom: '1px solid var(--gray-200)' }}>
                          <span className={`badge ${order.whatsappValidation.isRegistered ? 'badge-success' : 'badge-secondary'}`} style={{ fontSize: '0.7rem' }}>
                          {order.whatsappValidation.isRegistered ? '✓ مسجل' : '✗ غير مسجل'}
                          </span>
                      </td>
                        <td style={{ padding: '1rem 0.75rem', textAlign: 'center', borderBottom: '1px solid var(--gray-200)' }}>
                        {order.sentMessages.length > 0 ? (
                            <div>
                            {getMessageIndicators(order.sentMessages)}
                              <div style={{ fontSize: '0.7rem', color: 'var(--gray-500)', marginTop: '0.25rem' }}>
                              {order.sentMessages.length} رسالة
                            </div>
                          </div>
                        ) : (
                            <span style={{ color: 'var(--gray-400)', fontSize: '0.8rem' }}>لا توجد</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {filteredOrders.length === 0 && (
                  <div className="text-center" style={{ padding: '3rem', color: 'var(--gray-500)' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
                    <h3>لا توجد نتائج</h3>
                    <p>لا توجد طلبات تطابق معايير البحث المحددة</p>
                </div>
              )}
            </div>
          )}
          </div>
        </div>

        {/* Enhanced Info Alert */}
        <div className="alert alert-primary" style={{ marginTop: '2rem' }}>
          <strong>💡 معلومات هامة:</strong>
          <div style={{ marginTop: '1rem' }}>
            <div className="grid grid-cols-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', fontSize: '0.875rem' }}>
              <div>
                <strong>🔄 التحديث التلقائي:</strong><br />
                يتم تحديث البيانات كل 30 ثانية تلقائياً
              </div>
              <div>
                <strong>🛠️ معالجة الأخطاء:</strong><br />
                الأرقام المحتوية على #ERROR! تتم معالجتها آلياً
              </div>
              <div>
                <strong>📱 أولوية الأرقام:</strong><br />
                رقم الواتساب له أولوية على رقم الهاتف العادي
              </div>
              <div>
                <strong>📊 مصدر البيانات:</strong><br />
                البيانات مجلوبة من Google Sheets (قراءة فقط)
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
} 