'use client';

import React, { useState, useEffect } from 'react';

interface ConfigState {
  google: {
    spreadsheetUrl: string;
    credentials: string;
  };
  messages: Record<string, string>;
  timing: {
    checkIntervalSeconds: number;
    reminderDelayHours: number;
    rejectedOfferDelayHours: number;
  };
  statusSettings?: {
    enabledStatuses: {
      newOrder: boolean;
      noAnswer: boolean;
      shipped: boolean;
      rejectedOffer: boolean;
      reminder: boolean;
    };
    statusDescriptions?: Record<string, string>;
  };
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  sheetInfo?: {
    title: string;
    sheetCount: number;
    rowCount: number;
    columnCount: number;
  };
}

export default function SettingsPage() {
  const [config, setConfig] = useState<ConfigState>({
    google: { spreadsheetUrl: '', credentials: '' },
    messages: {},
    timing: { checkIntervalSeconds: 30, reminderDelayHours: 24, rejectedOfferDelayHours: 48 },
    statusSettings: {
      enabledStatuses: {
        newOrder: true,
        noAnswer: true,
        shipped: true,
        rejectedOffer: true,
        reminder: true
      }
    }
  });
  const [loading, setLoading] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [savedTab, setSavedTab] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('google');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const responses = await Promise.all([
        fetch('/api/config/google'),
        fetch('/api/config/messages'),
        fetch('/api/config/timing'),
        fetch('/api/config/status-settings')
      ]);

      const [googleData, messagesData, timingData, statusData] = await Promise.all(
        responses.map(r => r.json())
      );

      setConfig({
        google: googleData,
        messages: messagesData.templates || {},
        timing: timingData,
        statusSettings: statusData || {
          enabledStatuses: {
            newOrder: true,
            noAnswer: true,
            shipped: true,
            rejectedOffer: true,
            reminder: true
          }
        }
      });
    } catch (error) {
      console.error('Error loading config:', error);
    }
  };

  const saveGoogleConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/config/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config.google)
      });

      if (response.ok) {
        setSavedTab('google');
        await validateGoogleSettings();
        setTimeout(() => setSavedTab(null), 3000);
      }
    } catch (error) {
      console.error('Error saving Google config:', error);
    } finally {
      setLoading(false);
    }
  };

  const validateGoogleSettings = async () => {
    try {
      const response = await fetch('/api/sheets/validate');
      const result = await response.json();
      setValidationResult(result);
    } catch (error) {
      console.error('Error validating Google settings:', error);
    }
  };

  const saveMessages = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/config/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates: config.messages })
      });

      if (response.ok) {
        setSavedTab('messages');
        setTimeout(() => setSavedTab(null), 3000);
      }
    } catch (error) {
      console.error('Error saving messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveTiming = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/config/timing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config.timing)
      });

      if (response.ok) {
        setSavedTab('timing');
        setTimeout(() => setSavedTab(null), 3000);
      }
    } catch (error) {
      console.error('Error saving timing:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveStatusSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/config/status-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config.statusSettings)
      });

      if (response.ok) {
        setSavedTab('status');
        setTimeout(() => setSavedTab(null), 3000);
      }
    } catch (error) {
      console.error('Error saving status settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateConfigField = (section: keyof ConfigState, field: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const updateMessageTemplate = (templateKey: string, value: string) => {
    setConfig(prev => ({
      ...prev,
      messages: {
        ...prev.messages,
        [templateKey]: value
      }
    }));
  };

  const updateStatusSetting = (statusKey: string, value: boolean) => {
    setConfig(prev => ({
      ...prev,
      statusSettings: {
        ...prev.statusSettings!,
        enabledStatuses: {
          ...prev.statusSettings!.enabledStatuses,
          [statusKey]: value
        }
      }
    }));
  };

  const tabs = [
    { id: 'google', name: 'Google Sheets', icon: '🗂️' },
    { id: 'whatsapp', name: 'الواتساب', icon: '💬' },
    { id: 'messages', name: 'قوالب الرسائل', icon: '📝' },
    { id: 'timing', name: 'التوقيتات', icon: '⏰' },
    { id: 'status', name: 'الحالات المفعلة', icon: '🔘' }
  ];

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
          backgroundImage: 'radial-gradient(circle at 30% 40%, rgba(120, 119, 198, 0.3) 0%, transparent 50%), radial-gradient(circle at 70% 80%, rgba(255, 255, 255, 0.1) 0%, transparent 50%)',
          pointerEvents: 'none'
        }} />
        
        <div className="container" style={{ position: 'relative' }}>
          <div className="flex items-center gap-3">
            <div style={{ 
              background: 'rgba(255, 255, 255, 0.2)', 
              padding: '1rem', 
              borderRadius: 'var(--border-radius-lg)',
              backdropFilter: 'blur(10px)'
            }}>
              <span style={{ fontSize: '2rem' }}>⚙️</span>
            </div>
        <div>
              <h1 style={{ fontSize: '2.5rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                إعدادات النظام
              </h1>
              <p style={{ fontSize: '1.1rem', opacity: '0.9', marginBottom: '0' }}>
                تكوين وإدارة نظام أتمتة الواتساب للسوق المصري
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container" style={{ paddingTop: '2rem', paddingBottom: '2rem', marginTop: '-2rem', position: 'relative', zIndex: 1 }}>
        
        {/* Enhanced Tabs */}
        <div className="card mb-4" style={{ overflow: 'hidden' }}>
          <div style={{ background: 'linear-gradient(135deg, var(--gray-50), var(--white))' }}>
            <div style={{ display: 'flex', overflowX: 'auto', borderBottom: '1px solid var(--gray-200)' }}>
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '1rem 1.5rem',
                    border: 'none',
                    background: activeTab === tab.id ? 'var(--primary)' : 'transparent',
                    color: activeTab === tab.id ? 'white' : 'var(--gray-600)',
                    fontWeight: activeTab === tab.id ? '600' : '500',
                    cursor: 'pointer',
                    transition: 'var(--transition)',
                    borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <span style={{ fontSize: '1.1rem' }}>{tab.icon}</span>
                  {tab.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Google Sheets Tab */}
        {activeTab === 'google' && (
          <div className="card">
            <div className="card-header" style={{ background: 'linear-gradient(135deg, var(--primary-light), rgba(124, 58, 237, 0.1))' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>🗂️ ربط جدول Google Sheets</h3>
              <p style={{ marginBottom: '0', color: 'var(--gray-600)' }}>
                اربط النظام بجدول بيانات Google Sheets الخاص بطلباتك المصرية
              </p>
            </div>
            <div className="card-body">
              {/* Egyptian Data Format Info */}
              <div className="alert alert-primary mb-3">
                <strong>📊 تنسيق البيانات المصرية المطلوب:</strong><br />
                <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                  <strong>العمود D:</strong> رقم الواتساب (أولوية) | <strong>العمود C:</strong> رقم الهاتف | <strong>العمود M:</strong> حالة الطلب<br />
                  <strong>الحالات المدعومة:</strong> قيد المراجعة، لا يرد، رفض الاستلام، تم التاكيد، تم الشحن، تم التوصيل
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label className="label">🔗 رابط جدول البيانات</label>
                <input
                  type="url"
                  className="input"
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={config.google.spreadsheetUrl}
                  onChange={(e) => updateConfigField('google', 'spreadsheetUrl', e.target.value)}
                />
                <p style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: '0.5rem' }}>
                  انسخ رابط جدول Google Sheets الخاص بك من شريط العناوين
                </p>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label className="label">🔑 مفاتيح خدمة Google (JSON)</label>
                <textarea
                  className="textarea"
                  placeholder='{"type": "service_account", "project_id": "...", ...}'
                  value={config.google.credentials}
                  onChange={(e) => updateConfigField('google', 'credentials', e.target.value)}
                  rows={8}
                  style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                />
                <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: '0.5rem' }}>
                  <p>• اذهب إلى Google Cloud Console</p>
                  <p>• أنشئ Service Account جديد</p>
                  <p>• حمل ملف JSON وانسخ محتوياته هنا</p>
                  <p>• تأكد من إعطاء صلاحيات Google Sheets API</p>
                </div>
              </div>

              <div className="flex gap-2 mb-3">
                <button 
                  className={`btn ${savedTab === 'google' ? 'btn-success' : 'btn-primary'}`}
                  onClick={saveGoogleConfig} 
                  disabled={loading}
                >
                  {savedTab === 'google' ? '✅ تم الحفظ' : '💾 حفظ وتحقق'}
                </button>
                
                <button 
                  className="btn btn-secondary"
                  onClick={validateGoogleSettings}
                  disabled={loading}
                >
                  🔍 اختبار الاتصال
                </button>
              </div>

              {/* Enhanced Validation Results */}
              {validationResult && (
                <div>
                  {validationResult.isValid ? (
                    <div className="alert alert-success">
                      <strong>✅ تم الاتصال بنجاح مع Google Sheets</strong>
                        {validationResult.sheetInfo && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                          <p><strong>📊 {validationResult.sheetInfo.title}</strong></p>
                            <p>📄 {validationResult.sheetInfo.rowCount} صف × {validationResult.sheetInfo.columnCount} عمود</p>
                          </div>
                        )}
                    </div>
                  ) : (
                    <div className="alert alert-danger">
                      <strong>❌ أخطاء في الإعداد:</strong>
                      <ul style={{ marginTop: '0.5rem', paddingRight: '1rem' }}>
                          {validationResult.errors.map((error, i) => (
                            <li key={i}>• {error}</li>
                          ))}
                        </ul>
                    </div>
                  )}

                  {validationResult.warnings.length > 0 && (
                    <div className="alert alert-warning" style={{ marginTop: '1rem' }}>
                      <strong>⚠️ تحذيرات:</strong>
                      <ul style={{ marginTop: '0.5rem', paddingRight: '1rem' }}>
                          {validationResult.warnings.map((warning, i) => (
                            <li key={i}>• {warning}</li>
                          ))}
                        </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* WhatsApp Tab */}
        {activeTab === 'whatsapp' && (
          <div className="card">
            <div className="card-header" style={{ background: 'linear-gradient(135deg, var(--success-light), rgba(5, 150, 105, 0.1))' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>💬 إعدادات الواتساب</h3>
              <p style={{ marginBottom: '0', color: 'var(--gray-600)' }}>
                تكوين اتصال الواتساب للسوق المصري
              </p>
            </div>
            <div className="card-body">
              <div className="alert alert-primary">
                <strong>🇪🇬 نصائح هامة للسوق المصري:</strong><br />
                <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                  • استخدم رقم مصري للواتساب للحصول على أفضل معدل وصول<br />
                  • تأكد من أن الرقم موثق ومفعل للأعمال<br />
                  • تجنب إرسال رسائل مكثفة لتجنب الحظر<br />
                  • استخدم نصوص مناسبة للثقافة المصرية
                </div>
              </div>
              
              <div style={{ 
                background: 'var(--gray-50)', 
                padding: '2rem', 
                borderRadius: 'var(--border-radius)',
                textAlign: 'center',
                marginTop: '1rem'
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📱</div>
                <h3>إعدادات الواتساب</h3>
                <p style={{ color: 'var(--gray-600)', marginBottom: '1rem' }}>
                  إعدادات الواتساب وربط الحساب متاحة في لوحة المراقبة الرئيسية
                </p>
                <a href="/" className="btn btn-primary">
                  انتقل إلى لوحة المراقبة
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Messages Tab */}
        {activeTab === 'messages' && (
          <div className="card">
            <div className="card-header" style={{ background: 'linear-gradient(135deg, var(--warning-light), rgba(217, 119, 6, 0.1))' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>📝 قوالب الرسائل المصرية</h3>
              <p style={{ marginBottom: '0', color: 'var(--gray-600)' }}>
                تخصيص نصوص الرسائل لتناسب عملائك المصريين
              </p>
            </div>
            <div className="card-body">
              {/* Enhanced Variables Info */}
              <div className="alert alert-primary mb-3">
                  <strong>💳 نظام الدفع عند الاستلام - المتغيرات المتاحة:</strong><br />
                <div className="grid grid-cols-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                    <div>
                      <strong>🧑‍💼 بيانات العميل:</strong><br />
                      • {'{name}'} - اسم العميل الكريم<br />
                      • {'{phone}'} - رقم هاتف العميل
                    </div>
                    <div>
                      <strong>🛍️ بيانات الطلب:</strong><br />
                      • {'{orderId}'} - رقم الطلب<br />
                    • {'{amount}'} - مبلغ الطلب<br />
                      • {'{productName}'} - اسم المنتج
                    </div>
                    <div>
                      <strong>🏢 بيانات الشركة:</strong><br />
                      • {'{companyName}'} - اسم شركتك<br />
                      • {'{supportPhone}'} - رقم خدمة العملاء
                    </div>
                    <div>
                      <strong>🚚 بيانات الشحن:</strong><br />
                      • {'{trackingNumber}'} - رقم الشحنة<br />
                    • {'{deliveryAddress}'} - عنوان التوصيل
                  </div>
                </div>
                  </div>

              {/* Message Templates */}
              <div className="grid grid-cols-1 gap-3">
              {[
                  { key: 'newOrder', label: '🆕 رسالة الطلب الجديد', placeholder: 'أهلاً {name}، تم استلام طلبك رقم {orderId}...' },
                  { key: 'noAnswer', label: '📞 رسالة عدم الرد', placeholder: 'مرحباً {name}، لم نتمكن من الوصول إليك...' },
                  { key: 'shipped', label: '🚚 رسالة الشحن', placeholder: 'تم شحن طلبك رقم {orderId}...' },
                  { key: 'rejectedOffer', label: '🎁 رسالة العرض الخاص', placeholder: 'عرض خاص لك يا {name}! خصم 20%...' },
                  { key: 'reminder', label: '⏰ رسالة التذكير', placeholder: 'تذكير بطلبك رقم {orderId}...' }
              ].map((template) => (
                  <div key={template.key}>
                    <label className="label">{template.label}</label>
                    <textarea
                      className="textarea"
                      placeholder={template.placeholder}
                    value={config.messages[template.key] || ''}
                    onChange={(e) => updateMessageTemplate(template.key, e.target.value)}
                      rows={3}
                    />
                  </div>
                ))}
                </div>

              <button 
                className={`btn ${savedTab === 'messages' ? 'btn-success' : 'btn-primary'}`}
                onClick={saveMessages} 
                disabled={loading}
                style={{ marginTop: '1.5rem' }}
              >
                {savedTab === 'messages' ? '✅ تم الحفظ' : '💾 حفظ قوالب الرسائل'}
              </button>
            </div>
          </div>
        )}

        {/* Timing Tab */}
        {activeTab === 'timing' && (
          <div className="card">
            <div className="card-header" style={{ background: 'linear-gradient(135deg, var(--secondary-light), rgba(100, 116, 139, 0.1))' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>⏰ إعدادات التوقيتات</h3>
              <p style={{ marginBottom: '0', color: 'var(--gray-600)' }}>
                ضبط أوقات فحص الطلبات وإرسال الرسائل
              </p>
            </div>
            <div className="card-body">
              <div className="grid grid-cols-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                <div>
                  <label className="label">🔄 فترة فحص الطلبات (بالثواني)</label>
                  <input
                    type="number"
                    className="input"
                    min="10"
                    max="300"
                    value={config.timing.checkIntervalSeconds}
                    onChange={(e) => updateConfigField('timing', 'checkIntervalSeconds', parseInt(e.target.value))}
                  />
                  <p style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: '0.5rem' }}>
                    كم ثانية بين كل فحص للطلبات الجديدة (الافتراضي: 30 ثانية)
                  </p>
                </div>

                <div>
                  <label className="label">⏰ تأخير التذكير (بالساعات)</label>
                  <input
                    type="number"
                    className="input"
                    min="1"
                    max="168"
                    value={config.timing.reminderDelayHours}
                    onChange={(e) => updateConfigField('timing', 'reminderDelayHours', parseInt(e.target.value))}
                  />
                  <p style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: '0.5rem' }}>
                    كم ساعة قبل إرسال رسالة التذكير (الافتراضي: 24 ساعة)
                  </p>
                </div>

                <div>
                  <label className="label">🎁 تأخير العرض الخاص (بالساعات)</label>
                  <input
                    type="number"
                    className="input"
                    min="1"
                    max="168"
                    value={config.timing.rejectedOfferDelayHours}
                    onChange={(e) => updateConfigField('timing', 'rejectedOfferDelayHours', parseInt(e.target.value))}
                  />
                  <p style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: '0.5rem' }}>
                    كم ساعة قبل إرسال عرض خاص للطلبات المرفوضة (الافتراضي: 48 ساعة)
                  </p>
                </div>
              </div>

              <button 
                className={`btn ${savedTab === 'timing' ? 'btn-success' : 'btn-primary'}`}
                onClick={saveTiming} 
                disabled={loading}
                style={{ marginTop: '1.5rem' }}
              >
                {savedTab === 'timing' ? '✅ تم الحفظ' : '💾 حفظ إعدادات التوقيت'}
              </button>
            </div>
          </div>
        )}

        {/* Status Settings Tab */}
        {activeTab === 'status' && (
          <div className="card">
            <div className="card-header" style={{ background: 'linear-gradient(135deg, var(--success-light), rgba(5, 150, 105, 0.1))' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>🔘 الحالات المفعلة</h3>
              <p style={{ marginBottom: '0', color: 'var(--gray-600)' }}>
                تحكم في أنواع الرسائل التي يتم إرسالها تلقائياً
              </p>
            </div>
            <div className="card-body">
              {/* Enhanced Empty Status Section */}
              <div className="alert alert-success mb-4">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>🔳</span>
                  <div>
                    <strong style={{ fontSize: '1.1rem' }}>إدارة الحالات الفارغة</strong>
                    <p style={{ marginBottom: '0', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                      النظام يتعامل تلقائياً مع الطلبات ذات الحالة الفارغة
                    </p>
                  </div>
                </div>
                
                <div style={{ 
                  background: 'rgba(255, 255, 255, 0.7)',
                  padding: '1rem',
                  borderRadius: 'var(--border-radius)',
                  fontSize: '0.9rem'
                }}>
                  <h4 style={{ color: 'var(--success)', marginBottom: '0.5rem' }}>✅ كيف يعمل النظام:</h4>
                  <ul style={{ paddingRight: '1rem', marginBottom: '1rem' }}>
                    <li><strong>الحالة الفارغة ← طلب جديد:</strong> عندما تجد خانة "الحالة" فارغة، يعاملها النظام كطلب جديد تلقائياً</li>
                    <li><strong>لا حاجة لتعديل يدوي:</strong> لا تحتاج لتغيير الحالة الفارغة إلى "جديد" في Google Sheets</li>
                    <li><strong>رسائل تلقائية:</strong> سيتم إرسال رسالة "طلب جديد" للعملاء ذوي الحالة الفارغة</li>
                    <li><strong>تذكيرات شاملة:</strong> العملاء ذوو الحالة الفارغة سيحصلون على تذكيرات أيضاً</li>
                  </ul>
                  
                  <div style={{ 
                    background: 'rgba(37, 99, 235, 0.1)',
                    padding: '0.75rem',
                    borderRadius: 'var(--border-radius)',
                    borderRight: '4px solid var(--primary)'
                  }}>
                    <strong>💡 نصيحة:</strong> اتركوا خانة "الحالة" فارغة للطلبات الجديدة، والنظام سيتولى الباقي!
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                {[
                  { 
                    key: 'newOrder', 
                    label: '🆕 رسائل الطلبات الجديدة', 
                    desc: 'إرسال رسالة ترحيب للطلبات الجديدة والحالات الفارغة',
                    important: true 
                  },
                  { key: 'noAnswer', label: '📞 رسائل عدم الرد', desc: 'إرسال رسالة للعملاء الذين لم يردوا' },
                  { key: 'shipped', label: '🚚 رسائل الشحن', desc: 'إشعار العملاء بشحن طلباتهم' },
                  { key: 'rejectedOffer', label: '🎁 العروض الخاصة', desc: 'إرسال عروض للطلبات المرفوضة' },
                  { 
                    key: 'reminder', 
                    label: '⏰ رسائل التذكير', 
                    desc: 'تذكير العملاء بطلباتهم المعلقة (شامل الحالات الفارغة)',
                    important: true 
                  }
                ].map((status) => (
                  <div 
                    key={status.key} 
                    className="card" 
                    style={{ 
                      padding: '1rem',
                      border: status.important ? '2px solid var(--primary)' : '1px solid var(--gray-200)',
                      background: status.important ? 'linear-gradient(135deg, var(--primary-light), rgba(37, 99, 235, 0.05))' : 'var(--white)'
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 style={{ marginBottom: '0' }}>
                        {status.label}
                        {status.important && <span style={{ fontSize: '0.7rem', marginRight: '0.5rem', color: 'var(--primary)' }}>مهم</span>}
                      </h4>
                      <label style={{ 
                        position: 'relative', 
                        display: 'inline-block', 
                        width: '50px', 
                        height: '24px' 
                      }}>
                        <input 
                          type="checkbox"
                          checked={config.statusSettings?.enabledStatuses[status.key as keyof typeof config.statusSettings.enabledStatuses] || false}
                          onChange={(e) => updateStatusSetting(status.key, e.target.checked)}
                          style={{ display: 'none' }}
                        />
                        <span style={{
                          position: 'absolute',
                          cursor: 'pointer',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: config.statusSettings?.enabledStatuses[status.key as keyof typeof config.statusSettings.enabledStatuses] ? 'var(--success)' : 'var(--gray-300)',
                          borderRadius: '24px',
                          transition: 'var(--transition)'
                        }}>
                          <span style={{
                            position: 'absolute',
                            content: '',
                            height: '18px',
                            width: '18px',
                            right: config.statusSettings?.enabledStatuses[status.key as keyof typeof config.statusSettings.enabledStatuses] ? '3px' : '29px',
                            bottom: '3px',
                            background: 'white',
                            borderRadius: '50%',
                            transition: 'var(--transition)'
                          }} />
                        </span>
                      </label>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--gray-600)', marginBottom: '0' }}>
                      {status.desc}
                    </p>
                  </div>
                ))}
              </div>

              <button 
                className={`btn ${savedTab === 'status' ? 'btn-success' : 'btn-primary'}`}
                onClick={saveStatusSettings} 
                disabled={loading}
                style={{ marginTop: '1.5rem' }}
              >
                {savedTab === 'status' ? '✅ تم الحفظ' : '💾 حفظ إعدادات الحالات'}
              </button>
            </div>
          </div>
        )}

        {/* Enhanced Info Alert */}
        <div className="alert alert-primary" style={{ marginTop: '2rem' }}>
          <strong>💡 نصائح مهمة:</strong>
          <div style={{ marginTop: '1rem' }}>
            <div className="grid grid-cols-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', fontSize: '0.875rem' }}>
              <div>
                <strong>🔄 حفظ الإعدادات:</strong><br />
                تأكد من حفظ كل قسم بعد التعديل
              </div>
              <div>
                <strong>🧪 اختبار الإعدادات:</strong><br />
                استخدم أزرار الاختبار للتأكد من صحة البيانات
              </div>
              <div>
                <strong>📱 تجربة الرسائل:</strong><br />
                جرب الرسائل على رقمك أولاً قبل التفعيل
              </div>
              <div>
                <strong>🔒 أمان البيانات:</strong><br />
                جميع الإعدادات محفوظة بشكل آمن ومشفر
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
} 