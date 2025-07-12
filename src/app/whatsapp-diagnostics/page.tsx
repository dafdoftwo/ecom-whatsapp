'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Activity, 
  Database, 
  HardDrive,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Trash2,
  ArrowLeft
} from 'lucide-react';

interface SessionDiagnostics {
  session: {
    exists: boolean;
    isValid: boolean;
    sizeMB: number;
    path: string;
    validationDetails?: string;
  };
  connection: {
    isConnected: boolean;
    health: {
      isHealthy: boolean;
      lastHealthCheck: string;
      uptime: number;
      status: string;
      reconnectAttempts: number;
      isInitializing: boolean;
    };
    clientInfo?: {
      pushname: string | object;
      wid: string | object;
    };
  };
  recommendations: {
    shouldClearSession: boolean;
    shouldReconnect: boolean;
    needsQRScan: boolean;
  };
  timestamp: string;
}

export default function WhatsAppDiagnostics() {
  const [diagnostics, setDiagnostics] = useState<SessionDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadDiagnostics = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/whatsapp/session-info');
      if (response.ok) {
        const data = await response.json();
        setDiagnostics(data);
      }
    } catch (error) {
      console.error('Error loading diagnostics:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action: 'clear-session' | 'smart-initialize') => {
    setActionLoading(action);
    try {
      const endpoint = action === 'clear-session' 
        ? '/api/whatsapp/clear-session' 
        : '/api/whatsapp/smart-initialize';
      
      const response = await fetch(endpoint, { method: 'POST' });
      const result = await response.json();
      
      if (response.ok) {
        alert(result.message || 'تم تنفيذ العملية بنجاح');
        await loadDiagnostics();
      } else {
        throw new Error(result.error || 'فشل في العملية');
      }
    } catch (error) {
      console.error(`Error with ${action}:`, error);
      alert(`فشل في ${action}: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`);
    } finally {
      setActionLoading(null);
    }
  };

  const safeStringify = (value: any): string => {
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value);
    }
    return String(value || '');
  };

  useEffect(() => {
    loadDiagnostics();
    const interval = setInterval(loadDiagnostics, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        background: 'linear-gradient(135deg, var(--gray-50), var(--white))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div className="text-center">
          <div className="loading" style={{ width: '60px', height: '60px', margin: '0 auto 1rem' }}></div>
          <h3>جاري تحميل التشخيص...</h3>
          <p style={{ color: 'var(--gray-600)' }}>يتم فحص حالة النظام...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'linear-gradient(135deg, var(--gray-50), var(--white))' }}>
      {/* Enhanced Header */}
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
          backgroundImage: 'radial-gradient(circle at 25% 75%, rgba(120, 119, 198, 0.3) 0%, transparent 50%), radial-gradient(circle at 75% 25%, rgba(255, 255, 255, 0.1) 0%, transparent 50%)',
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
                  <span style={{ fontSize: '2rem' }}>🔧</span>
                </div>
                <div>
                  <h1 style={{ fontSize: '2.5rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                    تشخيص النظام
                  </h1>
                  <p style={{ fontSize: '1.1rem', opacity: '0.9', marginBottom: '0' }}>
                    معلومات تفصيلية عن حالة الواتساب والجلسات
                  </p>
                </div>
              </div>
            </div>
          
            <div className="flex gap-2">
              <button 
                className="btn btn-secondary"
                onClick={loadDiagnostics} 
                disabled={loading}
                style={{ backdropFilter: 'blur(10px)', background: 'rgba(255, 255, 255, 0.2)', border: '1px solid rgba(255, 255, 255, 0.3)' }}
              >
                <span style={{ marginLeft: '0.5rem' }}>{loading ? '⟳' : '🔄'}</span>
                {loading ? 'جاري التحديث...' : 'تحديث التشخيص'}
              </button>
            
              <button 
                className="btn"
                onClick={() => window.location.href = '/'}
                style={{ backdropFilter: 'blur(10px)', background: 'rgba(255, 255, 255, 0.2)', border: '1px solid rgba(255, 255, 255, 0.3)' }}
              >
                <span style={{ marginLeft: '0.5rem' }}>🏠</span>
              العودة للرئيسية
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container" style={{ paddingTop: '2rem', paddingBottom: '2rem', marginTop: '-2rem', position: 'relative', zIndex: 1 }}>

        {diagnostics && (
          <>
            {/* Session Information */}
            <div className="card mb-4">
              <div className="card-header" style={{ background: 'linear-gradient(135deg, var(--primary-light), rgba(124, 58, 237, 0.1))' }}>
                <h3 style={{ marginBottom: '0.5rem' }}>🗂️ معلومات الجلسة</h3>
                <p style={{ marginBottom: '0', color: 'var(--gray-600)' }}>
                  تفاصيل ملفات جلسة الواتساب المحفوظة
                </p>
              </div>
              <div className="card-body">
                <div className="grid grid-cols-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span style={{ fontWeight: '500' }}>وجود الجلسة:</span>
                      <span className={`badge ${diagnostics.session.exists ? 'badge-success' : 'badge-danger'}`}>
                        {diagnostics.session.exists ? '✅ موجودة' : '❌ غير موجودة'}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between mb-2">
                      <span style={{ fontWeight: '500' }}>صحة الجلسة:</span>
                      <span className={`badge ${diagnostics.session.isValid ? 'badge-success' : 'badge-danger'}`}>
                        {diagnostics.session.isValid ? '✅ صحيحة' : '❌ معطلة'}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between mb-2">
                      <span style={{ fontWeight: '500' }}>حجم الجلسة:</span>
                      <span className="badge badge-secondary">
                        📊 {diagnostics.session.sizeMB} MB
                      </span>
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ marginBottom: '1rem' }}>
                      <span style={{ fontWeight: '500', display: 'block', marginBottom: '0.5rem' }}>مسار الجلسة:</span>
                      <div style={{ 
                        fontSize: '0.8rem', 
                        color: 'var(--gray-600)', 
                        background: 'var(--gray-100)',
                        padding: '0.5rem',
                        borderRadius: 'var(--border-radius)',
                        wordBreak: 'break-all',
                        fontFamily: 'monospace'
                      }}>
                        {diagnostics.session.path}
                      </div>
                    </div>
                    
                    {diagnostics.session.validationDetails && (
                      <div>
                        <span style={{ fontWeight: '500', display: 'block', marginBottom: '0.5rem' }}>تفاصيل التحقق:</span>
                        <div style={{ 
                          fontSize: '0.8rem', 
                          color: 'var(--gray-600)',
                          background: 'var(--gray-100)',
                          padding: '0.5rem',
                          borderRadius: 'var(--border-radius)'
                        }}>
                          {diagnostics.session.validationDetails}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Connection Status */}
            <div className="card mb-4">
              <div className="card-header" style={{ background: 'linear-gradient(135deg, var(--success-light), rgba(5, 150, 105, 0.1))' }}>
                <h3 style={{ marginBottom: '0.5rem' }}>📡 حالة الاتصال</h3>
                <p style={{ marginBottom: '0', color: 'var(--gray-600)' }}>
                  معلومات الاتصال الحالي والصحة العامة
                </p>
              </div>
              <div className="card-body">
                <div className="grid grid-cols-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span style={{ fontWeight: '500' }}>حالة الاتصال:</span>
                      <span className={`badge ${diagnostics.connection.isConnected ? 'badge-success' : 'badge-danger'}`}>
                        {diagnostics.connection.isConnected ? '✅ متصل' : '❌ غير متصل'}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between mb-2">
                      <span style={{ fontWeight: '500' }}>الصحة العامة:</span>
                      <span className={`badge ${diagnostics.connection.health.isHealthy ? 'badge-success' : 'badge-warning'}`}>
                        {diagnostics.connection.health.isHealthy ? '✅ سليم' : '⚠️ يحتاج فحص'}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between mb-2">
                      <span style={{ fontWeight: '500' }}>محاولات إعادة الاتصال:</span>
                      <span className="badge badge-secondary">
                        🔄 {diagnostics.connection.health.reconnectAttempts}
                      </span>
                    </div>
                  </div>
                  
                  <div>
                    {diagnostics.connection.clientInfo && (
                      <div style={{ marginBottom: '1rem' }}>
                        <span style={{ fontWeight: '500', display: 'block', marginBottom: '0.5rem' }}>معلومات الحساب:</span>
                        <div style={{ 
                          background: 'var(--gray-100)',
                          padding: '0.75rem',
                          borderRadius: 'var(--border-radius)',
                          fontSize: '0.9rem'
                        }}>
                          <div style={{ marginBottom: '0.5rem' }}>
                            <strong>الاسم:</strong> {safeStringify(diagnostics.connection.clientInfo.pushname)}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)', fontFamily: 'monospace' }}>
                            <strong>معرف الحساب:</strong> {safeStringify(diagnostics.connection.clientInfo.wid)}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div>
                      <span style={{ fontWeight: '500', display: 'block', marginBottom: '0.5rem' }}>آخر فحص:</span>
                      <div style={{ 
                        fontSize: '0.8rem', 
                        color: 'var(--gray-600)',
                        background: 'var(--gray-100)',
                        padding: '0.5rem',
                        borderRadius: 'var(--border-radius)'
                      }}>
                        {new Date(diagnostics.connection.health.lastHealthCheck).toLocaleString('ar-EG')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Recommendations */}
            <div className="card mb-4">
              <div className="card-header" style={{ background: 'linear-gradient(135deg, var(--warning-light), rgba(217, 119, 6, 0.1))' }}>
                <h3 style={{ marginBottom: '0.5rem' }}>💡 التوصيات والإجراءات</h3>
                <p style={{ marginBottom: '0', color: 'var(--gray-600)' }}>
                  إجراءات موصى بها لحل المشاكل المكتشفة
                </p>
              </div>
              <div className="card-body">
                {diagnostics.recommendations.shouldClearSession && (
                  <div className="alert alert-danger mb-3">
                      <strong>🗑️ يُنصح بمسح الجلسة</strong><br />
                      الجلسة المحفوظة معطلة أو تالفة ويجب مسحها لبدء جلسة جديدة.
                    <div style={{ marginTop: '0.75rem' }}>
                      <button 
                        className={`btn ${actionLoading === 'clear-session' ? 'btn-secondary' : 'btn-danger'}`}
                          onClick={() => handleAction('clear-session')}
                          disabled={actionLoading === 'clear-session'}
                        >
                        <span style={{ marginLeft: '0.5rem' }}>🗑️</span>
                          {actionLoading === 'clear-session' ? 'جاري المسح...' : 'مسح الجلسة'}
                      </button>
                    </div>
                      </div>
                )}

                {diagnostics.recommendations.shouldReconnect && (
                  <div className="alert alert-primary mb-3">
                      <strong>🔄 يُنصح بإعادة الاتصال</strong><br />
                      الجلسة صحيحة ولكن الاتصال منقطع. يمكن إعادة الاتصال مباشرة.
                    <div style={{ marginTop: '0.75rem' }}>
                      <button 
                        className={`btn ${actionLoading === 'smart-initialize' ? 'btn-secondary' : 'btn-primary'}`}
                          onClick={() => handleAction('smart-initialize')}
                          disabled={actionLoading === 'smart-initialize'}
                        >
                        <span style={{ marginLeft: '0.5rem' }}>🔄</span>
                          {actionLoading === 'smart-initialize' ? 'جاري الاتصال...' : 'إعادة اتصال ذكي'}
                      </button>
                    </div>
                      </div>
                )}

                {diagnostics.recommendations.needsQRScan && (
                  <div className="alert alert-success mb-3">
                      <strong>📱 يحتاج مسح QR كود</strong><br />
                      لا توجد جلسة صحيحة. يحتاج النظام لمسح QR كود جديد لبدء الاتصال.
                    <div style={{ marginTop: '0.75rem' }}>
                      <button 
                        className="btn btn-success"
                          onClick={() => window.location.href = '/'}
                        >
                        <span style={{ marginLeft: '0.5rem' }}>🏠</span>
                          العودة للصفحة الرئيسية
                      </button>
                    </div>
                      </div>
                )}

                {!diagnostics.recommendations.shouldClearSession && 
                 !diagnostics.recommendations.shouldReconnect && 
                 !diagnostics.recommendations.needsQRScan && (
                  <div className="alert alert-success">
                      <strong>✅ كل شيء يعمل بشكل طبيعي</strong><br />
                      لا توجد مشاكل مكتشفة في الجلسة أو الاتصال.
                  </div>
                )}
              </div>
            </div>

            {/* Technical Details */}
            <div className="card">
              <div className="card-header" style={{ background: 'linear-gradient(135deg, var(--gray-100), var(--gray-50))' }}>
                <h3 style={{ marginBottom: '0.5rem' }}>🔍 التفاصيل التقنية</h3>
                <p style={{ marginBottom: '0', color: 'var(--gray-600)' }}>
                  معلومات تقنية للمطورين والدعم الفني
                </p>
              </div>
              <div className="card-body">
                <div style={{ 
                  fontSize: '0.75rem', 
                  background: 'var(--gray-100)', 
                  padding: '1rem', 
                  borderRadius: 'var(--border-radius)',
                  overflow: 'auto',
                  fontFamily: 'monospace',
                  direction: 'ltr',
                  whiteSpace: 'pre-wrap'
                }}>
                  {JSON.stringify(diagnostics, null, 2)}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
} 