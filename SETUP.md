# 🚀 إعداد نظام أتمتة الواتساب للتجارة الإلكترونية

## 📋 المتطلبات الأساسية

### 1️⃣ متطلبات النظام
- Node.js 18+ 
- Redis Server
- Google Sheets API Access
- WhatsApp Account

### 2️⃣ خدمات الاستضافة المدعومة
✅ **Railway** (الأفضل - مجاني)
✅ **Render** (مجاني مع قيود)
❌ **Vercel** (غير مدعوم - لا يدعم Puppeteer/Redis)

---

## ⚙️ خطوات الإعداد

### 1️⃣ استنساخ المشروع
```bash
git clone https://github.com/dafdoftwo/ecom-whatsapp.git
cd ecom-whatsapp
npm install
```

### 2️⃣ إعداد Google Sheets API
1. انتقل إلى [Google Cloud Console](https://console.cloud.google.com/)
2. إنشاء مشروع جديد أو اختيار مشروع موجود
3. تفعيل Google Sheets API
4. إنشاء Service Account Key
5. تحميل ملف JSON للـ credentials
6. نسخ محتويات الملف إلى `config/google.json`

### 3️⃣ إعداد ملف التكوين
```bash
# نسخ ملف المثال
cp config/google.json.example config/google.json

# تحرير الملف وإضافة بياناتك الحقيقية
nano config/google.json
```

### 4️⃣ إعداد Google Sheets
1. إنشاء جدول بيانات جديد في Google Sheets
2. تنسيق الأعمدة كما يلي:
   - العمود A: Customer Name (اسم العميل)
   - العمود B: Phone Number (رقم الهاتف)
   - العمود C: WhatsApp Number (رقم الواتساب)
   - العمود D: Order ID (رقم الطلب)
   - العمود E: Product Name (اسم المنتج)
   - العمود F: Total Price (السعر الإجمالي)
   - العمود G: Address (العنوان)
   - العمود H: Order Status (حالة الطلب)
   - العمود I: WhatsApp Status (حالة الواتساب)
   - العمود J: Notes (ملاحظات)

3. مشاركة الجدول مع Service Account Email من ملف google.json

### 5️⃣ تشغيل محلي للاختبار
```bash
# تشغيل Redis (macOS مع Homebrew)
brew services start redis

# أو تشغيل Redis مباشرة
redis-server

# تشغيل التطبيق
npm run dev
```

---

## ☁️ نشر على Railway (مجاني)

### 1️⃣ إعداد Railway
1. انتقل إلى [Railway.app](https://railway.app)
2. إنشاء حساب جديد
3. ربط حساب GitHub

### 2️⃣ إنشاء مشروع جديد
1. انقر على "New Project"
2. اختر "Deploy from GitHub repo"
3. اختر مستودع `ecom-whatsapp`

### 3️⃣ إضافة Redis
1. في مشروع Railway، انقر على "New Service"
2. اختر "Database" → "Redis"
3. سيتم إنشاء Redis instance تلقائياً

### 4️⃣ إعداد متغيرات البيئة
1. انقر على خدمة Next.js app
2. انتقل إلى "Variables"
3. أضف المتغيرات التالية:

```env
# Redis Configuration
REDIS_URL=redis://[redis-service-url]

# Google Sheets (نسخ من config/google.json)
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}

# App Configuration
NODE_ENV=production
PORT=3000
```

### 5️⃣ نشر التطبيق
1. Railway سيبدأ النشر تلقائياً
2. انتظر حتى يكتمل النشر
3. احصل على URL التطبيق

---

## 🔧 إعداد الواتساب

### 1️⃣ الاتصال الأولي
1. انتقل إلى `/whatsapp-diagnostics`
2. انقر على "Initialize WhatsApp"
3. امسح QR Code بهاتفك
4. انتظر رسالة "Connected successfully"

### 2️⃣ إعداد الرسائل
1. انتقل إلى `/settings`
2. خصص رسائل النظام حسب احتياجاتك
3. فعّل/ألغِ أنواع الرسائل المختلفة

---

## 📊 استخدام النظام

### 1️⃣ لوحة التحكم
- `/dashboard` - المراقبة العامة
- `/orders` - عرض الطلبات
- `/settings` - الإعدادات
- `/whatsapp-diagnostics` - تشخيص الواتساب

### 2️⃣ بدء التشغيل
1. تأكد من اتصال الواتساب
2. تأكد من وجود بيانات في Google Sheets
3. انقر على "Start Automation" في `/dashboard`

---

## 🐛 استكشاف الأخطاء

### مشاكل شائعة:
1. **WhatsApp disconnected**: إعادة مسح QR Code
2. **Google Sheets errors**: فحص الـ permissions
3. **Redis connection**: فحص REDIS_URL
4. **Message not sending**: فحص رقم الهاتف

### للدعم:
- فحص `/whatsapp-diagnostics` للحالة
- مراجعة logs في Railway
- اختبار `/api/test/duplicate-prevention`

---

## 🎯 مميزات النظام

✅ **منع تكرار الرسائل** - ضمان 100%  
✅ **معالجة الحالات الفارغة** - تلقائياً  
✅ **دعم الأرقام المصرية** - كامل  
✅ **نظام تذكير ذكي** - 24 ساعة  
✅ **عروض خاصة للمرفوضين** - تلقائياً  
✅ **مراقبة في الوقت الفعلي** - شاملة  

**🚀 نظام احترافي جاهز للإنتاج!** 