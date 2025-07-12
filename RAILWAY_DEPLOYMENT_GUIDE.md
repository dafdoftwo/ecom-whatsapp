# دليل حل مشاكل Railway للنظام
## Railway WhatsApp E-commerce Deployment Guide

## 🚨 المشكلة: النظام يعمل محلياً لكن لا يعمل على Railway

### 🔍 خطوات التشخيص

#### 1. شغل أداة تشخيص Railway:
```bash
GET https://ecom-whatsapp-production.up.railway.app/api/railway-diagnostics
```

هذا سيعطيك تقرير مفصل عن:
- متغيرات البيئة المفقودة
- مشاكل الأذونات
- حالة الخدمات
- توصيات محددة

### 🔧 الحلول الشائعة

#### 1. **متغيرات البيئة المطلوبة في Railway:**

في Railway Dashboard > Variables، أضف:

```env
# Google Sheets (مطلوب)
GOOGLE_SPREADSHEET_ID=your_sheet_id_here
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"..."}

# Redis (اختياري - النظام يعمل بدونه)
REDIS_URL=redis://default:password@redis-service:6379

# WhatsApp Session Path
WHATSAPP_SESSION_PATH=/tmp/whatsapp-session

# Config Path
CONFIG_DIR=/app/config
```

#### 2. **إعداد Google Service Account:**

1. احصل على ملف credentials.json من Google Cloud Console
2. افتح الملف وانسخ محتواه بالكامل
3. في Railway Variables، أضف:
   ```
   GOOGLE_SERVICE_ACCOUNT_KEY=<paste entire JSON content here>
   ```

#### 3. **مشكلة WhatsApp Session:**

WhatsApp session لا تنتقل مع deployment. الحل:

1. بعد النشر على Railway، افتح:
   ```
   POST https://ecom-whatsapp-production.up.railway.app/api/whatsapp/initialize
   ```

2. امسح QR code الجديد
3. Session ستُحفظ في `/tmp` على Railway

#### 4. **مشكلة ملفات التكوين:**

تأكد من أن Dockerfile ينسخ مجلد config:

```dockerfile
# في Dockerfile
COPY config ./config
```

وتأكد من أن .dockerignore لا يستثني config:
```
# .dockerignore
# لا تضع config/ هنا!
```

### 📝 خطوات النشر الكاملة

#### الخطوة 1: تحضير المشروع
```bash
# تأكد من أن كل شيء محدث
git add .
git commit -m "Railway deployment fixes"
git push origin main
```

#### الخطوة 2: إعداد Railway

1. اربط المستودع مع Railway
2. أضف متغيرات البيئة المطلوبة
3. Deploy

#### الخطوة 3: بعد النشر

1. تحقق من التشخيص:
   ```
   GET /api/railway-diagnostics
   ```

2. اتصل بـ WhatsApp:
   ```
   POST /api/whatsapp/initialize
   ```

3. اختبر معالجة الطلبات:
   ```
   POST /api/automation/force-process
   ```

### 🚀 حلول سريعة بدون WhatsApp

إذا كان WhatsApp صعب الاتصال على Railway، استخدم:

```bash
# معالجة الطلبات وحفظ الرسائل محلياً
POST /api/automation/force-process

# عرض الرسائل المحفوظة
GET /api/automation/force-process
```

### 🛠️ نصائح مهمة لـ Railway

1. **استخدم Volumes للبيانات الدائمة:**
   - WhatsApp sessions تُحذف عند restart
   - استخدم Railway Volumes للحفظ الدائم

2. **Redis اختياري:**
   - النظام يعمل بدون Redis
   - إذا أردت Redis، أضف Redis service في Railway

3. **Health Checks:**
   - Railway يستخدم `/api/health` للتحقق
   - تأكد من أن هذا endpoint يعمل

4. **Logs:**
   - تحقق من Railway logs لأي أخطاء
   - ابحث عن "Error" أو "Failed"

### 📊 مثال متغيرات Railway الكاملة

```env
# Required
GOOGLE_SPREADSHEET_ID=1ABC...XYZ
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}

# Optional but recommended
NODE_ENV=production
WHATSAPP_SESSION_PATH=/tmp/whatsapp-session
CONFIG_DIR=/app/config
AUTOMATION_INTERVAL=30000
REMINDER_DELAY_HOURS=24

# Optional Redis
REDIS_URL=redis://default:password@host:6379
```

### 🔍 أدوات التشخيص المتاحة

1. **تشخيص Railway:**
   ```
   GET /api/railway-diagnostics
   ```

2. **تشخيص عام:**
   ```
   GET /api/automation/diagnostics
   ```

3. **فحص سريع:**
   ```
   GET /api/automation/quick-check
   ```

4. **حالة النظام:**
   ```
   GET /api/system/info
   ```

### ❓ مشاكل شائعة وحلولها

**المشكلة**: "Google Sheets configuration invalid"
- **الحل**: تأكد من GOOGLE_SERVICE_ACCOUNT_KEY صحيح ومنسوخ بالكامل

**المشكلة**: "WhatsApp not connected"  
- **الحل**: طبيعي بعد deployment جديد، امسح QR code

**المشكلة**: "Config directory not found"
- **الحل**: تحقق من Dockerfile وتأكد من نسخ config/

**المشكلة**: "Cannot write to /tmp"
- **الحل**: نادر على Railway، لكن يمكن استخدام Volume

### 🎯 الخلاصة

1. أضف متغيرات البيئة المطلوبة
2. انشر على Railway
3. اتصل بـ WhatsApp
4. النظام جاهز!

**للمساعدة السريعة**: استخدم `/api/railway-diagnostics` للحصول على تقرير مفصل ومخصص لمشكلتك. 