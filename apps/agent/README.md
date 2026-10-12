# SudaFi Windows LAN Agent (وكيل سودافي لشبكات MikroTik المحلية)

وكيل محلي خفيف الوزن ومستقل (Standalone Worker Service) يعمل على نظام Windows (أو Linux/macOS) داخل الشبكة المحلية للعميل (LAN).

---

## المميزات الفنية

- **اتصال صادر فقط (Outbound HTTPS Polling):** لا يتطلب عنوان IP عام (Public IP)، ولا يتطلب فتح أي منافذ واردة (No Port Forwarding) في راوتر العميل أو جدار الحماية.
- **التوافق مع خطة Render المجانية:** يتحمل التشغيل البارد (Cold Start) بمهلات تصل إلى 60-90 ثانية، ويعتمد التراجع الأسي (Exponential Backoff with Jitter) لمنع انهيار الخدمة.
- **تشفير محلي للأسرار:** حفظ التوكن وبيانات الاعتماد محلياً باستخدام تشفير AES-256-GCM المقيد ببيئة الجهاز (Machine-bound)، مع الامتناع التام عن طباعة الأسرار في السجلات.
- **تنفيذ الأوامر المصرح بها فقط (Strict RPC Whitelist):**
  1. `system.router.health` (فحص الموارد والذاكرة والمعالج)
  2. `hotspot.user.batch_add` (إضافة بطاقات هوتسبوت مع بروتوكول التوفيق Reconciliation)
  3. `hotspot.user.remove` (حذف بطاقات ومستخدمين بأمان)
  4. `hotspot.user.verify_batch` (التحقق من البطاقات النشطة)
  5. `hotspot.session.list` (عرض الجلسات المتصلة)
- **منع تكرار الأثر على الراوتر (Idempotent Reconciliation):** قبل إضافة أي بطاقة، يفحص الوكيل وجودها الفعلي على الراوتر لمنع الأخطاء في حال تكرار الأمر أو انقطاع الاتصال (Lost Ack).
- **وضع اختبار وهمي (Mock Mode):** يدعم التشغيل بدون راوتر حقيقي لاختبار دورة الحياة كاملة بأمان تام.

---

## متطلبات التشغيل

1. **نظام التشغيل:** Windows 10 / 11 أو Windows Server (أو أي نظام يدعم Node.js 20+).
2. **اتصال بالشبكة المحلية (LAN):** كابل شبكة أو Wi-Fi متصل بنفس شبكة راوتر MikroTik (عادة منفذ API 8728 أو 8729).
3. **اتصال إنترنت صادر:** منفذ HTTPS (443) للاتصال بخادم SudaFi Backend.

---

## خطوات التثبيت والإعداد

### 1. إعداد ملف الإعدادات
انسخ ملف الإعدادات النموذجي:
```bash
copy agent.config.json.example agent.config.json
```

عدّل القيم في `agent.config.json`:
```json
{
  "serverUrl": "https://mikrotik-api.onrender.com/api/v1",
  "agentName": "Cashier-POS-PC",
  "heartbeatIntervalMs": 25000,
  "httpTimeoutMs": 60000,
  "mockRouter": false,
  "router": {
    "host": "192.168.88.1",
    "port": 8728,
    "username": "admin",
    "password": "YOUR_ROUTER_PASSWORD",
    "useSsl": false,
    "timeoutMs": 10000,
    "rosVersion": "v7"
  }
}
```

### 2. إقران الوكيل (Pairing)
من لوحة التحكم (SudaFi Web Admin)، اضغط على "ربط الوكيل" لتوليد رمز إقران مكون من 6 أرقام (صالح لمدة 5 دقائق ولـ 3 محاولات فقط).

في سطر الأوامر بجهاز العميل، نفّذ:
```bash
pnpm agent pair --code 123456
```
أو عند تشغيل الملف المبني:
```bash
node dist/main.js pair --code 123456
```

سيقوم الوكيل بتبادل الرمز واستلام `AgentAuthToken`، وتشفيره محلياً في خزانة المفاتيح (Credential Vault).

### 3. فحص الاتصال بالراوتر (اختياري)
```bash
pnpm agent test-router
```
يتحقق من صحة بيانات اعتماد الراوتر ويجلب استهلاك المعالج والذاكرة وإصدار RouterOS.

### 4. تشغيل الوكيل
```bash
pnpm agent run
```
أو بالوضع الوهمي (Mock Mode) دون راوتر حقيقي:
```bash
pnpm agent run --mock
```

---

## استكشاف الأخطاء الشائعة (Troubleshooting)

1. **الوكيل يظهر بحالة `UNPAIRED`:**
   - لم يتم تنفيذ أمر الإقران بنجاح. شغّل `pnpm agent pair --code <رمز>` أولاً.
2. **الوكيل يظهر بحالة `RECONNECTING`:**
   - تأكد من اتصال الإنترنت المحلي. إذا كان الخادم على Render Free في وضع النوم، انتظر 30-60 ثانية حتى يكتمل التشغيل البارد (Cold Start).
3. **الراوتر غير متاح (`Router unreachable`):**
   - تأكد من تمكين خدمة API في MikroTik: `/ip service enable api` أو `/ip service print`.
   - تأكد من صحة عنوان IP الراوتر في `agent.config.json`.
4. **الوكيل توقف مع رسالة `REVOKED`:**
   - قام المشرف بإلغاء اعتماد هذا الوكيل من لوحة التحكم. لإعادة تفعيله، يجب إنشاء رمز إقران جديد وإعادة تشغيل أمر الإقران.
