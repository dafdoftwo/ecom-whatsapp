# 🚀 نشر نظام الواتساب على Railway - دليل مفصل

## 🎯 لماذا Railway؟

✅ **مجاني** - 500 ساعة تشغيل مجاناً شهرياً  
✅ **دعم Redis** - قاعدة بيانات Redis مجانية  
✅ **دعم Puppeteer** - يدعم whatsapp-web.js بالكامل  
✅ **نظام ملفات ثابت** - يحافظ على جلسات الواتساب  
✅ **لا حدود زمنية** - لا يوجد timeout 15 ثانية مثل Vercel  
✅ **انطلاق تلقائي** - يعيد تشغيل النظام تلقائياً  

---

## 🛠️ خطوات النشر

### 1️⃣ إنشاء حساب Railway

1. انتقل إلى [railway.app](https://railway.app)
2. انقر على **"Start a New Project"**
3. سجل دخول باستخدام GitHub
4. اربط حساب GitHub الخاص بك

### 2️⃣ نشر المشروع

1. انقر على **"New Project"**
2. اختر **"Deploy from GitHub repo"**
3. ابحث عن `ecom-whatsapp`
4. انقر على **"Deploy"**

### 3️⃣ إضافة قاعدة بيانات Redis

1. في مشروع Railway، انقر على **"+ New"**
2. اختر **"Database"**
3. اختر **"Redis"**
4. انتظر حتى يتم إنشاء Redis instance

### 4️⃣ إعداد متغيرات البيئة

1. انقر على خدمة الـ Next.js app (ليس Redis)
2. انتقل إلى تبويب **"Variables"**
3. أضف المتغيرات التالية:

```env
# إعدادات الإنتاج
NODE_ENV=production
PORT=3000

# Redis (انسخ من خدمة Redis في Railway)
REDIS_URL=redis://default:password@redis.railway.internal:6379

# Google Sheets - احصل عليها من Google Cloud Console
GOOGLE_SPREADSHEET_ID=1abc123xyz...
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"your-project-id","private_key_id":"abc123","private_key":"-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n","client_email":"your-service-account@your-project.iam.gserviceaccount.com","client_id":"123456789","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/your-service-account%40your-project.iam.gserviceaccount.com"}

# إعدادات النظام (اختيارية)
AUTOMATION_INTERVAL=30000
REMINDER_DELAY_HOURS=24
REJECTED_OFFER_DELAY_HOURS=24
```

### 5️⃣ الحصول على REDIS_URL

1. انقر على خدمة **Redis** في مشروعك
2. انتقل إلى تبويب **"Connect"**
3. انسخ **"Redis URL"** أو **"Internal URL"**
4. أضفه كمتغير بيئة `REDIS_URL`

### 6️⃣ إعداد Google Sheets API

#### أ) إنشاء مشروع في Google Cloud:
1. انتقل إلى [Google Cloud Console](https://console.cloud.google.com/)
2. إنشاء مشروع جديد أو اختر مشروع موجود
3. فعّل **Google Sheets API**

#### ب) إنشاء Service Account:
1. انتقل إلى **"IAM & Admin" > "Service Accounts"**
2. انقر على **"Create Service Account"**
3. أعطه اسم مثل `whatsapp-automation`
4. انقر على **"Create and Continue"**

#### ج) إنشاء مفتاح JSON:
1. انقر على Service Account الذي أنشأته
2. انتقل إلى تبويب **"Keys"**
3. انقر على **"Add Key" > "Create new key"**
4. اختر **"JSON"** وانقر **"Create"**
5. سيتم تحميل ملف JSON

#### د) إعداد Google Sheets:
1. أنشئ جدول بيانات جديد في Google Sheets
2. انسخ **Spreadsheet ID** من URL:
   ```
   https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit
   ```
3. شارك الجدول مع **client_email** من ملف JSON
4. أعطه صلاحية **Editor**

#### هـ) إضافة البيانات في Railway:
1. **GOOGLE_SPREADSHEET_ID**: انسخ من URL الجدول
2. **GOOGLE_SERVICE_ACCOUNT_KEY**: انسخ محتويات ملف JSON كاملاً (في سطر واحد)

---

## 🔄 إعادة النشر

بعد تحديث الكود على GitHub:

1. Railway سيعيد النشر تلقائياً
2. أو انقر على **"Deploy"** يدوياً في Railway

---

## 🎯 بعد النشر

### 1️⃣ الحصول على URL التطبيق
1. في Railway، انقر على خدمة Next.js app
2. انتقل إلى تبويب **"Settings"**
3. انسخ **"Public Domain"** أو أنشئ domain مخصص

### 2️⃣ اختبار النظام
1. انتقل إلى `https://your-app.railway.app/whatsapp-diagnostics`
2. انقر على **"Initialize WhatsApp"**
3. امسح QR Code بهاتفك
4. انتظر رسالة **"Connected successfully"**

### 3️⃣ بدء التشغيل
1. انتقل إلى `/dashboard`
2. تأكد من اتصال الواتساب (أخضر)
3. تأكد من وجود بيانات في Google Sheets
4. انقر على **"Start Automation"**

---

## 📊 مراقبة النظام

### عرض Logs:
1. في Railway، انقر على خدمة Next.js app
2. انتقل إلى تبويب **"Logs"**
3. راقب رسائل النظام وأي أخطاء

### نقاط المراقبة المهمة:
- `/dashboard` - الحالة العامة
- `/whatsapp-diagnostics` - حالة الواتساب
- `/orders` - الطلبات المُعالجة
- `/api/duplicate-prevention` - إحصائيات منع التكرار

---

## 🐛 استكشاف الأخطاء الشائعة

### 1. **خطأ Redis Connection**
```
Error: Redis connection failed
```
**الحل**: تأكد من صحة `REDIS_URL` في متغيرات البيئة

### 2. **خطأ Google Sheets**
```
Error: Unable to access Google Sheets
```
**الحل**: 
- تأكد من صحة `GOOGLE_SERVICE_ACCOUNT_KEY`
- تأكد من مشاركة الجدول مع Service Account email
- تأكد من تفعيل Google Sheets API

### 3. **WhatsApp غير متصل**
```
WhatsApp Status: Disconnected
```
**الحل**:
- امسح QR Code مرة أخرى
- تأكد من أن الهاتف متصل بالإنترنت
- أعد تشغيل خدمة WhatsApp من `/whatsapp-diagnostics`

### 4. **التطبيق لا يعمل**
```
Application Error
```
**الحل**:
- فحص Logs في Railway
- تأكد من جميع متغيرات البيئة
- أعد النشر إذا لزم الأمر

---

## 🎉 مبروك! النظام جاهز

✅ **نظام أتمتة الواتساب يعمل الآن على Railway!**

### الميزات النشطة:
- 🚫 **منع تكرار الرسائل** - 100% ضمان
- 🔄 **معالجة الحالات الفارغة** - تلقائياً  
- 📱 **أتمتة الواتساب** - 24/7
- 📊 **مراقبة في الوقت الفعلي** - شاملة
- 🎁 **عروض خاصة للمرفوضين** - ذكية
- ⏰ **نظام تذكير متقدم** - 24 ساعة

### للوصول السريع:
- **لوحة التحكم**: `https://your-app.railway.app/dashboard`
- **إعدادات الرسائل**: `https://your-app.railway.app/settings`
- **تشخيص الواتساب**: `https://your-app.railway.app/whatsapp-diagnostics`
- **عرض الطلبات**: `https://your-app.railway.app/orders`

**🚀 نظام احترافي جاهز لزيادة المبيعات!** 