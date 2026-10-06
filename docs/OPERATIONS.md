# دليل التشغيل والعمليات وإدارة الكوارث (Operations Manual & Runbooks)

## MikroTik HotSpot Cards Management SaaS Platform

---

### 1. المتطلبات البيئية للتشغيل في بيئة الإنتاج (Production Prerequisites)

- **نظام التشغيل المدعوم:** Windows Server 2022 / Windows 10/11 Pro (64-bit) أو
  Ubuntu 22.04+ LTS.
- **Node.js:** الإصدار v20.x LTS (مفحوص ومثبت محلياً v20.19.6).
- **pnpm:** الإصدار v10.x.
- **قاعدة البيانات:** PostgreSQL 18 (مثبتة كخدمة ويندوز أصلية
  `postgresql-x64-18` على المنفذ 5432).
- **مدير العمليات:** PM2 Process Manager أو نصوص PowerShell الأصلية المضمنة في
  مجلد `scripts/`.
- **شبكة الميكروتك:** أجهزة MikroTik RouterOS بإصدار v6.40+ أو v7.1+.

---

### 2. دليل بدء التشغيل الإنتاجي (Startup Runbook)

#### أ) التشغيل التلقائي عبر PowerShell (Native Script)

افتح موجه أوامر PowerShell بصلاحية المدير (Administrator) ونفذ:

```powershell
# الانتقال لمجلد المشروع
cd E:\microTik_project

# تشغيل فحص الخدمات والتهجير وبدء التشغيل
.\scripts\start-production.ps1
```

يقوم هذا النص البرمجي آلياً بما يلي:

1. التحقق من حالة خدمة PostgreSQL وتشغيلها إن كانت متوقفة.
2. تطبيق أي هجرات جديدة لقاعدة البيانات عبر
   `pnpm --filter @mikrotik-saas/api db:migrate:deploy`.
3. التحقق من سلامة وجود حزم البناء للإنتاج في `apps/api/dist` و
   `apps/admin/dist`.
4. إطلاق العمليات في الخلفية وتوجيه السجلات إلى مجلد `logs/`.

#### ب) التشغيل عبر مدير العمليات PM2

```bash
# تثبيت PM2 عاماً إن لم يكن مثبت
npm install -g pm2

# تشغيل المنظومة عبر ملف التكوين
pm2 start ecosystem.config.js

# حفظ التكوين لإعادة التشغيل مع إقلاع النظام
pm2 save
```

#### ج) إيقاف المنظومة بأمان (Graceful Shutdown)

```powershell
.\scripts\stop-production.ps1
```

---

### 3. إعداد وربط أجهزة MikroTik RouterOS (Router Onboarding Guide)

لربط موجه ميكروتك جديد بالمنظومة السحابية بأمان:

#### الخطوة 1: إنشاء مستخدم مخصص بواجهة برمجة التطبيقات (API User)

افتح Terminal في برنامج WinBox الخاص بالراوتر ونفذ الأمر التالي:

```routeros
# إنشاء مجموعة صلاحيات مخصصة مقيدة
/user group add name=saas-api-group policy=read,write,api,test,reboot

# إنشاء مستخدم النظام وتحديد كلمة مرور قوية
/user add name=saas_admin group=saas-api-group password="SUPER_SECURE_PASSWORD_HERE"
```

#### الخطوة 2: تفعيل خدمة API وتأمينها

```routeros
# للإصدارات التي تعتمد Socket API (v6 / v7)
/ip service set api port=8728 disabled=no
/ip service set api-ssl port=8729 disabled=no

# للإصدارات التي تدعم REST API (RouterOS v7+)
/ip service set www-ssl port=443 disabled=no

# تقييد الوصول لعنوان IP خادم المنظومة فقط (اختياري للأمان الأقصى)
/ip service set api address=192.168.1.0/24
```

#### الخطوة 3: إضافة الجهاز في لوحة الإدارة

1. توجه إلى لوحة الإدارة: `https://mikrotik-admin.onrender.com/devices` (أو محلياً `http://localhost:5173/devices`).
2. انقر على **إضافة راوتر جديد**.
3. أدخل البيانات: عنوان الـ IP، المنفذ (8728)، اسم المستخدم (`saas_admin`)،
   وكلمة المرور.
4. اضغط على زر **فحص الاتصال (Ping)** للتأكد من استجابة الراوتر، ثم **فحص
   الموارد** لعرض حمولة المعالج والذاكرة والمستخدمين.

---

### 4. استراتيجية النسخ الاحتياطي واستعادة البيانات (Backup & Disaster Recovery)

#### أ) إنشاء نسخة احتياطية فورية (Automated Backup)

```powershell
.\scripts\backup-db.ps1 -Database "mikrotik_saas" -RetentionDays 14
```

- يقوم النص البرمجي بإنشاء ملف تفريغ مضغوط عالي الكفاءة في مجلد
  `backups/mikrotik_saas_YYYYMMDD_HHMMSS.sql`.
- يتم تلقائياً حذف النسخ الأقدم من 14 يوماً لتوفير المساحة التخزينية.

#### ب) جدولة النسخ الاحتياطي اليومي عبر Windows Task Scheduler

يمكن إضافة مهمة مجدولة يومية عند الساعة 02:00 صباحاً عبر الأمر:

```powershell
$action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File E:\microTik_project\scripts\backup-db.ps1"
$trigger = New-ScheduledTaskTrigger -Daily -At 2:00AM
Register-ScheduledTask -Action $action -Trigger $trigger -TaskName "MikroTik_SaaS_Daily_DB_Backup" -Description "Daily automated PostgreSQL backup for MikroTik SaaS"
```

#### ج) استعادة قاعدة البيانات عند الطوارئ (Database Restoration)

```powershell
.\scripts\restore-db.ps1 -BackupFile "backups\mikrotik_saas_20261005_010000.sql"
```

---

### 5. مراقبة الصحة وفحص المؤشرات الحيوية (Health Probes & Telemetry)

المنظومة مزودة بنقاط فحص حيوية قياسية متوافقة مع Kubernetes و Load Balancers:

| المسار              | النوع           | الاستخدام                                                              |
| :------------------ | :-------------- | :--------------------------------------------------------------------- |
| `GET /health`       | Comprehensive   | فحص اتصال قاعدة البيانات، استهلاك الذاكرة، والمساحة التخزينية.         |
| `GET /health/live`  | Liveness Probe  | التأكد من أن عملية الخادم تعمل وتستجيب للطلبات.                        |
| `GET /health/ready` | Readiness Probe | التأكد من جاهزية الخادم لاستقبال حركة المرور والاتصال بقاعدة البيانات. |

---

### 6. خطة الاستجابة للحوادث والأعطال (Incident Response Playbook)

| نوع العطل / التنبيه                   | السبب المحتمل                                                                         | إجراءات الحل السريعة                                                                                                                        |
| :------------------------------------ | :------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------ |
| **انقطاع الاتصال براوتر ميكروتك**     | تغير عنوان IP العام، انقطاع خدمة الإنترنت في الموقع، أو تعطل خدمة الـ API في الراوتر. | 1. اختبار وصول الشبكة عبر Ping.<br/>2. مراجعة WinBox والتأكد من تفعيل خدمة `/ip service api`.<br/>3. مراجعة سجلات الاتصال في لوحة المراقبة. |
| **فشل مزامنة مبيعات تطبيق الجوال**    | تعارض في أرقام البطاقات أو استنفاد حزمة الحجز المسبق.                                 | 1. فحص اتصال تطبيق الجوال بالخادم.<br/>2. تنفيذ جلب تفاضلي يدوي `/sync/pull`.<br/>3. تخصيص حزمة حجز كروت جديدة عبر شاشة المزامنة.           |
| **ارتفاع استهلاك المعالج أو الذاكرة** | تراكم مهام توليد بطاقات ضخمة في وقت واحد.                                             | 1. ضبط معلمات BullMQ concurrency في ملف `.env`.<br/>2. مراجعة سجلات الخادم في `logs/api-out.log`.                                           |
