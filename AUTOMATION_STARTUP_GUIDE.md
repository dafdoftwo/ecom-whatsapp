# دليل تشغيل محرك الأتمتة الموثوق
## RELIABLE AUTOMATION ENGINE STARTUP GUIDE

هذا الدليل يساعدك في تشغيل محرك الأتمتة بشكل موثوق وحل مشاكل عدم التشغيل.

## 🚀 التشغيل السريع (Quick Start)

### 1. فحص سريع للنظام
```bash
GET /api/automation/quick-check
```
يفحص حالة جميع المكونات في ثوانٍ ويعطي توصيات فورية.

### 2. تشغيل موثوق للمحرك
```bash
POST /api/automation/reliable-start
```
يبدأ المحرك مع فحوصات شاملة ومعالجة أفضل للأخطاء.

### 3. تشخيص شامل (إذا فشل التشغيل)
```bash
GET /api/automation/diagnostics
```
تحليل تفصيلي للمشاكل مع توصيات محددة.

## 🔍 خطوات استكشاف الأخطاء

### خطوة 1: فحص أساسي
```bash
# فحص سريع لحالة النظام
curl -X GET http://localhost:3000/api/automation/quick-check

# فحص حالة المحرك
curl -X GET http://localhost:3000/api/automation/status
```

### خطوة 2: إذا ظهرت مشاكل في التكوين

#### مشكلة Google Sheets:
```bash
# فحص إعدادات Google Sheets
curl -X GET http://localhost:3000/api/config/google

# إعادة تكوين (إذا لزم الأمر)
curl -X POST http://localhost:3000/api/config/google \
  -H "Content-Type: application/json" \
  -d '{
    "spreadsheetUrl": "YOUR_GOOGLE_SHEETS_URL",
    "credentialsPath": "path/to/credentials.json"
  }'
```

#### مشكلة WhatsApp:
```bash
# فحص حالة WhatsApp
curl -X GET http://localhost:3000/api/whatsapp/status

# إعادة تهيئة WhatsApp
curl -X POST http://localhost:3000/api/whatsapp/initialize
```

### خطوة 3: بدء التشغيل الموثوق

```bash
# التشغيل مع فحوصات شاملة
curl -X POST http://localhost:3000/api/automation/reliable-start
```

## 🔧 حل المشاكل الشائعة

### المشكلة: "Automation engine is not running"
**الحل:**
1. تأكد من تكوين Google Sheets
2. تأكد من صحة قوالب الرسائل
3. استخدم نقطة نهاية التشغيل الموثوق

### المشكلة: "Google Sheets configuration invalid"
**الحل:**
1. تحقق من رابط Google Sheets
2. تأكد من وجود ملف الاعتماد
3. تحقق من أذونات الوصول

### المشكلة: "WhatsApp not connected"
**الحل:**
1. قم بمسح QR code جديد
2. تأكد من استقرار الاتصال بالإنترنت
3. أعد تشغيل خدمة WhatsApp

### المشكلة: "Queue service not working"
**الحل:**
1. تحقق من Redis connection
2. النظام سيعمل بوضع local fallback

## 📊 مراقبة الأداء

### فحص الأداء المباشر:
```bash
GET /api/automation/performance
```

### إحصائيات مفصلة:
```bash
GET /api/automation/status
```

### مراقبة الذاكرة المؤقتة:
```bash
GET /api/automation/cache
```

## 🎯 نصائح التشغيل الأمثل

### 1. تسلسل التشغيل الصحيح:
1. تكوين Google Sheets أولاً
2. تهيئة WhatsApp ثانياً
3. بدء محرك الأتمتة أخيراً

### 2. التحقق من المتطلبات:
- ✅ Google Sheets URL صحيح
- ✅ ملف credentials.json موجود
- ✅ أذونات الوصول مفعلة
- ✅ قوالب الرسائل مكتملة

### 3. مراقبة دورية:
- فحص الحالة كل 5 دقائق
- مراقبة الأداء يومياً
- تنظيف الذاكرة المؤقتة أسبوعياً

## 🔄 إعادة التشغيل الآمن

```bash
# إيقاف المحرك
curl -X POST http://localhost:3000/api/automation/stop

# انتظار 5 ثوانٍ
sleep 5

# بدء موثوق
curl -X POST http://localhost:3000/api/automation/reliable-start
```

## 🚨 إشارات الخطر

### مؤشرات تتطلب تدخل فوري:
- ❌ "Authentication failed" - مشكلة أذونات Google
- ❌ "Critical startup error" - خطأ في التكوين الأساسي
- ❌ "Processing loop failed" - مشكلة في معالجة البيانات

### مؤشرات تحذيرية (لا تمنع التشغيل):
- ⚠️ "WhatsApp not connected" - الرسائل ستُخزن في الطابور
- ⚠️ "Redis unavailable" - سيعمل النظام محلياً
- ⚠️ "Cache miss" - سيتم التحقق من WhatsApp API

## 📋 قائمة التحقق قبل التشغيل

### متطلبات أساسية:
- [ ] Google Sheets URL محدد
- [ ] ملف credentials.json موجود
- [ ] أذونات Google Sheets مفعلة
- [ ] قوالب الرسائل مكتملة
- [ ] إعدادات التوقيت صحيحة

### متطلبات اختيارية:
- [ ] WhatsApp متصل (الرسائل ستُحفظ في الطابور إذا لم يكن متصلاً)
- [ ] Redis متوفر (سيعمل النظام محلياً إذا لم يكن متوفراً)

## 🎉 علامات النجاح

عندما يعمل النظام بنجاح سترى:
```
✅ OPTIMIZED Egyptian automation engine started successfully
🎯 System is now ready to process orders automatically
📊 Next processing cycle will begin in 30 seconds
⚡ Processing completed successfully in XXXms
📊 Cache stats: XX hits, XX misses, XX API calls
```

## 🆘 الحصول على المساعدة

### للتشخيص السريع:
1. `GET /api/automation/quick-check` - فحص سريع
2. `GET /api/automation/diagnostics` - تشخيص شامل
3. `GET /api/automation/performance` - مراقبة الأداء

### للمشاكل المعقدة:
1. فحص logs في console
2. تحقق من إعدادات البيئة
3. اختبر كل خدمة منفصلة

---

**ملاحظة مهمة:** النظام مصمم ليعمل حتى لو لم تكن جميع الخدمات متاحة. WhatsApp و Redis اختياريان - الرسائل ستُحفظ في الطابور حتى تصبح الخدمات متاحة. 