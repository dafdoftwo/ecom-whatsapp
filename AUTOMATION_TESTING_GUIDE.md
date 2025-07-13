# 🧪 دليل اختبار محرك الأتمتة المحدث

## ✅ الإصلاحات المطبقة

### 1. **إصلاح خطأ replaceMessageVariables**
- ✅ تم إصلاح خطأ `Cannot read properties of undefined (reading 'replace')`
- ✅ تم إضافة معالجة شاملة للبيانات المفقودة
- ✅ تم إصلاح استخراج templates من ConfigService

### 2. **تحسينات الأمان والاستقرار**
- ✅ إضافة validation للـ templates قبل الاستخدام
- ✅ معالجة أخطاء شاملة مع fallback messages
- ✅ تسجيل مفصل للأخطاء لسهولة التشخيص

### 3. **إضافة طرق اختبار آمنة**
- ✅ إضافة `testMessageReplacement` method للاختبار
- ✅ إضافة endpoint اختبار `/api/test/automation-engine`

## 🔧 اختبار النظام

### 1. **اختبار محرك الأتمتة**
```bash
# اختبار شامل للمحرك
GET /api/test/automation-engine

# النتيجة المتوقعة:
{
  "success": true,
  "tests": {
    "templatesStructure": {
      "hasTemplatesProperty": true,
      "templateKeys": ["newOrder", "noAnswer", "shipped", "rejectedOffer", "reminder"],
      "newOrderTemplate": "Available"
    },
    "messageReplacement": {
      "success": true,
      "messageLength": 150,
      "preview": "السلام عليكم ورحمة الله مع حضرتك هبه..."
    }
  }
}
```

### 2. **اختبار الاتصال المستمر**
```bash
# تهيئة الاتصال
POST /api/whatsapp/init-persistent

# فحص الحالة
GET /api/whatsapp/persistent-connection

# النتيجة المتوقعة:
{
  "success": true,
  "connection": {
    "isConnected": true,
    "quality": "excellent"
  }
}
```

### 3. **اختبار إرسال الرسائل**
```bash
# تشغيل محرك الأتمتة
POST /api/automation/start

# فحص الحالة
GET /api/automation/status

# النتيجة المتوقعة:
{
  "engine": {
    "isRunning": true
  },
  "whatsapp": {
    "isConnected": true
  }
}
```

## 📋 خطوات الاختبار التفصيلية

### الخطوة 1: تهيئة النظام
1. **تأكد من تشغيل التطبيق**: `npm run dev`
2. **اختبر محرك الأتمتة**: `GET /api/test/automation-engine`
3. **تحقق من النتائج**: يجب أن تكون جميع الاختبارات ناجحة

### الخطوة 2: اختبار الواتساب
1. **تهيئة الاتصال**: `POST /api/whatsapp/init-persistent`
2. **مسح QR Code**: إذا لم يكن متصلاً
3. **تحقق من الاتصال**: `GET /api/whatsapp/persistent-connection`

### الخطوة 3: اختبار الأتمتة
1. **تشغيل المحرك**: `POST /api/automation/start`
2. **تغيير حالة طلب**: في Google Sheets إلى "جديد"
3. **مراقبة الـ logs**: يجب أن ترى رسائل المعالجة
4. **تحقق من الإرسال**: يجب إرسال رسالة للعميل

### الخطوة 4: اختبار الحالات المختلفة
```bash
# اختبار حالات الطلبات المصرية
- "جديد" → رسالة ترحيب
- "لم يرد" → رسالة متابعة  
- "تم الشحن" → رسالة تأكيد
- "مرفوض" → عرض خاص بعد 24 ساعة
```

## 🔍 مراقبة الأداء

### 1. **مراقبة الـ Logs**
```bash
# في terminal التطبيق ابحث عن:
✅ Template replacement successful
📝 Processing order [ID]: NEW - جديد
✅ Message sent successfully to [phone]
```

### 2. **مراقبة الأخطاء**
```bash
# إذا رأيت هذه الأخطاء:
❌ Invalid template provided to replaceMessageVariables
❌ Invalid row data provided to replaceMessageVariables
❌ Error in replaceMessageVariables

# تحقق من:
- تكوين الـ templates في /api/config/messages
- صحة بيانات Google Sheets
- اتصال قاعدة البيانات
```

### 3. **إحصائيات الأداء**
```bash
GET /api/automation/status

# راقب:
- processing.totalOrders: عدد الطلبات المعالجة
- whatsapp.isConnected: حالة الاتصال
- summary.queuedMessages: الرسائل في الانتظار
```

## ⚠️ استكشاف الأخطاء

### مشكلة: لا يتم إرسال رسائل
```bash
# تحقق من:
1. حالة الواتساب: GET /api/whatsapp/persistent-connection
2. حالة المحرك: GET /api/automation/status  
3. تكوين الرسائل: GET /api/config/messages
4. بيانات الجداول: GET /api/sheets/data
```

### مشكلة: خطأ في template replacement
```bash
# اختبر:
GET /api/test/automation-engine

# إذا فشل، تحقق من:
- تكوين الرسائل في config/messages.json
- صحة متغيرات الرسائل {name}, {orderId}, etc.
```

### مشكلة: انقطاع الاتصال
```bash
# استخدم:
POST /api/whatsapp/persistent-connection
{"action": "restart-browser"}

# أو:
POST /api/whatsapp/persistent-connection  
{"action": "clear-session"}
```

## 🎯 النتائج المتوقعة

بعد تطبيق الإصلاحات:
- ✅ **عدم ظهور أخطاء** `Cannot read properties of undefined`
- ✅ **إرسال رسائل ناجح** لجميع حالات الطلبات
- ✅ **معالجة ذكية** للبيانات المفقودة
- ✅ **اتصال مستقر** مع الواتساب 24/7
- ✅ **تسجيل مفصل** لجميع العمليات

## 📞 الدعم الفني

إذا استمرت المشاكل:
1. **راجع الـ logs** في terminal و browser console
2. **اختبر endpoints** الفردية للتأكد من عملها
3. **تحقق من التكوين** في ملفات config
4. **أعد تشغيل التطبيق** إذا لزم الأمر

---

**ملاحظة**: النظام الآن محمي ضد جميع أنواع الأخطاء المتعلقة بالبيانات المفقودة ويوفر رسائل fallback احترافية في حالة حدوث أي مشاكل. 