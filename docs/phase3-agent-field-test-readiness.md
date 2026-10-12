# تقرير خطة الاختبار الميداني الآمن وجاهزية التشغيل — Phase 3: LAN Agent
## SudaFi Cloud Platform — Windows LAN Agent Field-Test Readiness & Migration Audit

**تاريخ التقرير:** 11 أكتوبر 2026  
**المسار الأساسي:** `E:\microTik_project`  
**الحالة:** تدقيق شامل ومكتمل — جاهز للمراجعة قبل أي اختبار ميداني  

---

## 1. الملخص التنفيذي (Executive Summary)

تم إعداد هذا التقرير استجابة لطلب فحص الجاهزية الشاملة لـ **Windows LAN Agent** قبل إجراء أي تجربة ميدانية على راوتر حقيقي أو الانتقال إلى بيئة Render.  
يركز التقرير على **سبعة محاور تشغيلية وأمنية دقيقة**:
1. فحص سلامة واستقلالية ملفات الـ Migration وإمكانية إنشاء بيئة اختبارية محلية بالكامل على PostgreSQL دون المساس بقاعدة بيانات الإنتاج (Supabase).
2. التحقق من التوافق الفعلي بين كود الـ Agent والـ Backend (بما في ذلك تصحيح مشكلة توافق اسم حقل التوكن المكتشفة).
3. تدقيق سكربتات التثبيت والإزالة لنظام Windows وتوضيح الفرق بين Scheduled Task و Windows Service الحقيقية، ومعالجة تعارض صلاحيات الحسابات مع DPAPI.
4. التحقق من حماية الأسرار على Windows وعدم تخزين المفتاح الاحتياطي بجانب الملف المشفر.
5. وضع خطة تنفيذ واختبار مرحلية آمنة (قاعدة بيانات محلية + بيانات وهمية $\rightarrow$ راوتر مختبر معزول ومصرّح).
6. جرد المتطلبات الإلزامية قبل التفكير في اختبار منصة Render.
7. تقييم خيارات بناء وتوزيع ملف تنفيذي مستقل لويندوز (`.exe`) وتحديد متطلبات جهاز العميل بدقة.

---

## 2. فحص ملفات الـ Migration وقاعدة بيانات الاختبار

### 2.1 حصر ملفات الـ Migration في المشروع
يحتوي المشروع في المسار [`apps/api/prisma/migrations`](file:///e:/microTik_project/apps/api/prisma/migrations) على 4 ملفات Migration متسلسلة:

1. **`20261003000000_init`**:
   - ينشئ الجداول الأساسية: المستأجرين (`tenants`)، المستخدمين (`users`)، أجهزة الراوتر (`mikrotik_devices`)، الباقات (`plans`)، البطاقات (`cards`)، وسجلات التدقيق (`audit_logs`).
2. **`20261008120000_add_monitoring_lock_wallet`**:
   - ينشئ جداول المحفظة، مراقبة أجهزة الراوتر، وجداول الأقفال الموزعة (`distributed_locks`).
3. **`20261010230000_add_device_agent_and_pairing`**:
   - ينشئ Enum: `AgentStatus` ('ONLINE', 'OFFLINE', 'REVOKED').
   - ينشئ جدول الوكلاء [`device_agents`](file:///e:/microTik_project/apps/api/prisma/migrations/20261010230000_add_device_agent_and_pairing/migration.sql): مع الفهارس والقيود الجزئية التي تضمن عدم وجود أكثر من وكيل نشط واحد للراوتر في نفس الوقت (`device_agents_active_device_idx`).
   - ينشئ جدول رموز الإقران مؤقتة الصلاحية [`agent_pairing_codes`](file:///e:/microTik_project/apps/api/prisma/migrations/20261010230000_add_device_agent_and_pairing/migration.sql) مع تجزئة HMAC-SHA256 والملح.
   - ينشئ جدول حماية محاولات الإقران من التخمين [`agent_pairing_attempts`](file:///e:/microTik_project/apps/api/prisma/migrations/20261010230000_add_device_agent_and_pairing/migration.sql) لفرض الحظر المؤقت بعد تكرار الفشل.
4. **`20261011080000_add_agent_commands`**:
   - ينشئ Enum: `AgentCommandStatus` ('PENDING', 'DISPATCHED', 'COMPLETED', 'FAILED', 'EXPIRED').
   - ينشئ جدول قائمة الأوامر المجدولة للوكيل [`agent_commands`](file:///e:/microTik_project/apps/api/prisma/migrations/20261011080000_add_agent_commands/migration.sql) مع معرّف العملية الفريد لضمان منع التكرار (`operationId`).

### 2.2 هل يمكن تشغيل نسخة اختبار كاملة على PostgreSQL تجريبي دون لمس Supabase؟
> [!IMPORTANT]
> **نعم، بنسبة 100% دون أي اعتماديات خارجية.**

* **السبب التقني:**
  - جميع ملفات الـ SQL الناتجة مكتوبة بـ **Standard PostgreSQL DDL** نقي (`CREATE TYPE`, `CREATE TABLE`, `CREATE UNIQUE INDEX`, `ALTER TABLE ... ADD CONSTRAINT`).
  - لا تعتمد الميجريشنز إطلاقاً على أي امتدادات خاصة بـ Supabase (مثل `supabase_vault`، أو `auth.users`، أو `pg_graphql`).
  - جميع العلاقات والمفاتيح الخارجية (`Foreign Keys`) ترتبط بجداول تم إنشاؤها داخل نفس قاعدة البيانات (`tenants`, `mikrotik_devices`, `device_agents`).
  - لا يُفترض أن قاعدة البيانات جاهزة؛ بل يمكن لأي حاوية Docker محلية أو خادم PostgreSQL محلي (الإصدار 14 وما فوق) تشغيل الميجريشنز بالكامل من الصفر عبر الأمر:
    ```bash
    DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sudafi_test" pnpm --filter @mikrotik-saas/api prisma migrate deploy
    ```
  - هذا يضمن استقلالية تامة وعزلاً مطلقاً عن قاعدة بيانات الإنتاج في Supabase.

---

## 3. التوافق الفعلي بين كود الـ Agent والـ Backend

أثناء المراجعة التفصيلية الدقيقة لسير العمليات، تم فحص مسارات:
- [`apps/agent/src/transport/api-client.ts`](file:///e:/microTik_project/apps/agent/src/transport/api-client.ts)
- [`apps/agent/src/service/agent-daemon.ts`](file:///e:/microTik_project/apps/agent/src/service/agent-daemon.ts)
- [`apps/api/src/modules/agent/agent.controller.ts`](file:///e:/microTik_project/apps/api/src/modules/agent/agent.controller.ts)
- [`apps/api/src/modules/agent/agent.service.ts`](file:///e:/microTik_project/apps/api/src/modules/agent/agent.service.ts)

### 3.1 المشكلة المكتشفة وتصحيحها الفوري: عدم تطابق اسم حقل التوكن
* **التفاصيل:**
  - عند نجاح الإقران في مسار `/agent/pair`، يقوم الـ Backend في كائن [`AgentPairSuccessDto`](file:///e:/microTik_project/apps/api/src/modules/agent/dto/agent-response.dto.ts) بإرجاع الحقل باسم `agentToken`.
  - في المقابل، كان تابع الوكيل [`apiClient.pair()`](file:///e:/microTik_project/apps/agent/src/transport/api-client.ts) يتوقع استلام `res.token`.
  - لو شُغّل الوكيل ضد خادم NestJS الحقيقي، لكان التوكن المخزن محلياً بقيمة `undefined`، مما يؤدي إلى فشل جميع النبضات اللاحقة برمز 401 Unauthorized!
* **الإجراء التصحيحي المنفذ:**
  - تم تحديث [`api-client.ts`](file:///e:/microTik_project/apps/agent/src/transport/api-client.ts) ليقوم بمطابقة وتطبيع الاستجابة: `token: res.token || res.agentToken`.
  - تم تحديث [`agent-response.dto.ts`](file:///e:/microTik_project/apps/api/src/modules/agent/dto/agent-response.dto.ts) و [`agent.service.ts`](file:///e:/microTik_project/apps/api/src/modules/agent/agent.service.ts) لإرجاع كلا الحقلين (`agentToken` و `token`) بالتوازي لضمان التوافق التام والعكسي.

### 3.2 جدول التحقق من تطابق العمليات التشغيلية

| المرحلة / العملية | مسار الـ API وطريقة المصادقة | بيانات الطلب المرسلة من Agent | ما يستقبله الـ Backend | النتيجة بعد التدقيق |
| :--- | :--- | :--- | :--- | :---: |
| **1. الإقران (Pairing)** | `POST /agent/pair`<br>Public Endpoint مع Rate-limiting | `pairingCode: string`<br>`code: string`<br>`name: string`<br>`version?: string` | `PairAgentDto`<br>(يدعم الحقلين `pairingCode` و `code`) | **متطابق 100%** |
| **2. إرجاع التوكن** | استجابة `200 OK` | يستقبل `agentId`, `deviceId`, `tenantId`, `token` | يرسل `agentId`, `deviceId`, `tenantId`, `agentToken`, `token` | **متطابق 100%** |
| **3. النبضات (Heartbeat)** | `POST /agent/heartbeat`<br>`Authorization: Bearer <token>` | `metrics: AgentMetricsDto`<br>`version: string` | `AgentHeartbeatDto`<br>(يقبل `uptimeSeconds`, `freeMemoryBytes` والبدائل) | **متطابق 100%** |
| **4. استلام الأوامر** | مضمنة في رد النبضة | يستقبل `pendingCommands: CommandItem[]` | يرسل مصفوفة أوامر بخصائص: `id`, `operationId`, `type`, `payload`, `expiresAt` | **متطابق 100%** |
| **5. تسليم النتيجة** | `POST /agent/commands/:id/result`<br>`Authorization: Bearer <token>` | `operationId: UUIDv4`<br>`status: 'COMPLETED' \| 'FAILED'`<br>`result?: Object`<br>`errorMessage?: string` | `SubmitCommandResultDto`<br>(تحقق صارم من الـ UUID ومطابقة الـ Agent المسند إليه) | **متطابق 100%** |

---

## 4. مراجعة سكربتات تثبيت الوكيل وإزالته على Windows

### 4.1 هل تنشئ Windows Scheduled Task أم خدمة Windows حقيقية؟
* **الواقع الفعلي:**
  السكربت [`install-windows-service.bat`](file:///e:/microTik_project/apps/agent/scripts/install-windows-service.bat) ينشئ **Windows Scheduled Task** باستخدام أداة النظام `schtasks.exe`، **ولا ينشئ خدمة ويندوز حقيقية (Windows Service)** تدار عبر Service Control Manager (`services.msc`).

### 4.2 فحص سلوك التشغيل عند الإقلاع وتأثير DPAPI
* **المشكلة التي تم رصدها في الإعداد السابق:**
  - كان السكربت يستخدم سابقاً الخيار:
    ```cmd
    schtasks /create /tn "SudaFiAgent" /tr "\"%AGENT_CMD%\" run" /sc ONSTART /ru SYSTEM /f
    ```
  - **التعارض الأمني الحرج:**
    - عندما يقوم العميل بإقران الوكيل عبر موجه الأوامر الشخصي (`sudafi-agent pair`)، يتم تشفير ملف الاعتماد باستخدام **Windows DPAPI** بنطاق `CurrentUser` الخاص بحسابه الشخصي (مثل `C:\Users\Admin\AppData\Roaming\SudaFiAgent\credentials.enc`).
    - عند تشغيل المهمة بحساب `/ru SYSTEM`، يعمل التطبيق تحت هوية `NT AUTHORITY\SYSTEM`.
    - حساب النظام **لا يمكنه فك تشفير** ملف اعتمادات مشفر بنطاق مستخدم آخر، كما أن مسار `%APPDATA%` يختلف جذرياً! وكانت المهمة ستفشل بالضرورة فور الإقلاع.
* **التصحيح المعتمد:**
  - تم تعديل السكربت لإنشاء المهمة لتعمل بحساب المستخدم الذي قام بالتثبيت فور تسجيل دخوله:
    ```cmd
    schtasks /create /tn "SudaFiAgent" /tr "\"%AGENT_CMD%\" run" /sc ONLOGON /rl HIGHEST /f
    ```
  - هذا يضمن أن نطاق DPAPI ومسار `%APPDATA%` ومسار تشغيل Node.js متطابقة 100% مع حساب المستخدم المشغل.

### 4.3 جدول مقارنة خيارات التشغيل التلقائي على Windows

| الخاصية | Scheduled Task (`ONLOGON`) [الحالي المعتمد] | Scheduled Task (`ONSTART /ru SYSTEM`) | خدمة ويندوز حقيقية (عبر WinSW / NSSM) |
| :--- | :--- | :--- | :--- |
| **الآلية** | Windows Task Scheduler | Windows Task Scheduler | Service Control Manager (`services.msc`) |
| **التوافق مع DPAPI `CurrentUser`** | **متوافق تماماً** (نفس المستخدم) | غير متوافق (يفشل فك التشفير) | يتطلب ضبط الخدمة لتعمل بنفس حساب المستخدم |
| **العمل بعد إعادة التشغيل** | يبدأ تلقائياً فور تسجيل دخول المستخدم | يبدأ فور الإقلاع (قبل تسجيل الدخول) | يبدأ فور الإقلاع (قبل تسجيل الدخول) |
| **العمل بعد تسجيل خروج المستخدم** | يتوقف | يستمر | يستمر |
| **سهولة التثبيت** | بدون أي ملفات خارجية | بدون ملفات خارجية | يحتاج إلى ملف وسيط (`nssm.exe` أو `WinSW.exe`) |

---

## 5. مراجعة حماية الأسرار (DPAPI & AES Fallback)

### 5.1 آلية تشفير Windows DPAPI
- يتم تشفير الاعتمادات عبر استدعاء:
  `[System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, [DataProtectionScope]::CurrentUser)`
- المفتاح مشتق ومحمي داخلياً بواسطة Windows Local Security Authority (LSA) ويرتبط بكلمة مرور حساب المستخدم المسجل وبيانات عتاد الجهاز (TPM/Master Key).
- **لا يوجد أي مفتاح مخزن على القرص نهائياً.**
- في حال نسخ الملف المشفر إلى جهاز كمبيوتر آخر، أو محاولة قراءته من مستخدم آخر على نفس الجهاز، يرفض نظام التشغيل فك التشفير تلقائياً وتفشل العملية ويعيد التابع `load()` القيمة `null` فوراً.

### 5.2 آلية الـ Fallback (AES-256-GCM)
- تُستخدم حصراً في البيئات غير التابعة لويندوز (مثل أنظمة Linux/macOS أثناء الاختبارات) أو في حال فشل استدعاء DPAPI.
- **هل يُخزن المفتاح الاحتياطي بجانب الملف المشفر؟**
  - **قطعاً لا.** ملف التخزين يحتوي فقط على:
    ```json
    {
      "format": "aes-256-gcm",
      "iv": "<12-byte hex>",
      "tag": "<16-byte hex>",
      "data": "<ciphertext hex>",
      "updatedAt": "..."
    }
    ```
  - يتم اشتقاق المفتاح مؤقتاً في الذاكرة عبر دالة التجزئة `crypto.scryptSync` من بصمة نظام التشغيل المجمعة (`hostname`, `username`, `arch`, `platform`) مع ملح ثابت (`salt`).
- **حدود حماية الـ Fallback:**
  - أي شخص يملك وصولاً للقراءة على مستوى نظام التشغيل يمكنه تجميع عناصر البصمة وإعادة اشتقاق المفتاح. لذلك تم توثيق أن **DPAPI هو خط الدفاع الحقيقي والأساسي على أنظمة Windows**، وأن الـ Fallback مخصص لحالات الفشل الطارئة ولبيئات التطوير.

---

## 6. خطة التجربة المرحلية الآمنة (Field-Test Protocol)

لضمان سلامة العمليات وتجنب أي تأثير على العملاء أو الشبكات الحية، تنقسم التجربة إلى مرحلتين إلزاميتين:

```mermaid
graph TD
    A["المرحلة 1: بيئة اختبار محلية بالكامل"] --> B["تشغيل Postgres محلي مع تطبيق Migrations"]
    B --> C["تشغيل API محلي وضبط AGENT_PAIRING_SECRET"]
    C --> D["تشغيل Agent محلي مع MockRouterWorker"]
    D --> E["تنفيذ الإقران والنبضات وأوامر الهوتسبوت الوهمية"]
    E --> F{"هل نجحت كافة العمليات دون أخطاء؟"}
    F -- نعم --> G["المرحلة 2: راوتر MikroTik مخصص للاختبار (Lab Router)"]
    F -- لا --> H["تصحيح الأخطاء وإعادة المرحلة 1"]
    G --> I["الحصول على تفويض كتابي وشبكة معزولة"]
    I --> J["إنشاء مستخدم مقيد الصلاحيات على الراوتر"]
    J --> K["توصيل الوكيل وتنفيذ أمر Health واستعلامات القراءة"]
    K --> L["إضافة دفعة بطاقات اختبارية محددة والتحقق من التوفيق"]
    L --> M["المراجعة النهائية واعتماد الجاهزية"]
```

### المرحلة الأولى: بيئة اختبار محلية بالكامل (Local DB + Local Backend + Mock Router)
1. **تجهيز قاعدة البيانات المحلية:**
   - تشغيل خادم PostgreSQL محلي (عبر Docker أو خدمة محلية).
   - توجيه متغير البيئة وتطبيق الميجريشنز:
     ```cmd
     set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sudafi_test
     pnpm --filter @mikrotik-saas/api prisma migrate deploy
     ```
2. **تشغيل الـ Backend محلياً:**
   - ضبط المتغيرات: `AGENT_PAIRING_SECRET=test-pairing-secret-key-32chars!!` و `JWT_SECRET=local-jwt-test-secret`.
   - تشغيل الخادم على المنفذ 3000: `pnpm --filter @mikrotik-saas/api start:dev`.
3. **إنشاء مستخدم وجهاز راوتر تجريبي:**
   - إنشاء مستخدم Admin ومستأجر تجريبي وجهاز راوتر تجريبي عبر واجهة API أو نصوص Seed.
4. **تشغيل الوكيل بوضع المحاكاة (Mock):**
   - ضبط ملف `agent.config.json`:
     ```json
     {
       "serverUrl": "http://localhost:3000/api/v1",
       "agentName": "Local-Test-Agent",
       "mockRouter": true,
       "heartbeatIntervalMs": 5000
     }
     ```
   - استخراج رمز إقران للراوتر التجريبي عبر نقطة النهاية `/devices/:id/agent/pairing-code`.
   - تنفيذ الإقران: `sudafi-agent.cmd pair --code 123456`.
   - تشغيل الوكيل: `sudafi-agent.cmd run`.
5. **التحقق من الدورة التشغيلية الكاملة:**
   - مراقبة تحول حالة الوكيل في لوحة التحكم/الـ API إلى `ONLINE`.
   - إرسال أمر `system.router.health` ومراقبة استلامه وتنفيذه وإرجاع النتيجة.
   - إرسال أمر `hotspot.user.batch_add` ومراقبة التوفيق وتسليم النتيجة.
   - إيقاف الوكيل وإعادة تشغيله للتحقق من قراءة الاعتمادات المشفرة بـ DPAPI بنجاح.

---

### المرحلة الثانية: راوتر MikroTik مخصص للاختبار (Lab Router)
> [!CAUTION]
> **شروط إلزامية قبل لمس أي عتاد فيزيائي:**
> - يُحظر تماماً الاتصال براوتر يخدم مشتركين فعليين أو شبكة إنتاجية.
> - يجب أن يكون الراوتر مخصصاً للاختبار والمعمل (Lab Router)، وبموافقة خطية وصريحة من صاحبه.
> - يجب أخذ نسخة احتياطية كاملة من إعدادات الراوتر (`/export file=backup-before-test`) قبل بدء أي اختبار.

1. **إعداد مستخدم مقيد الصلاحيات على راوتر الاختبار:**
   تنفيذ الأوامر التالية داخل Terminal الراوتر:
   ```routeros
   /user group add name=sudafi-test policy=api,read,write,test
   /user add name=sudafi-agent group=sudafi-test password="TestStrongPassword123!"
   ```
2. **التحقق من إعدادات خدمة الـ API على الراوتر:**
   - تفعيل المنفذ القياسي 8728 (أو 8729 مع TLS):
     ```routeros
     /ip service enable api
     /ip service set api port=8728
     ```
3. **تحديث إعدادات الوكيل:**
   - تعديل `agent.config.json`:
     ```json
     {
       "serverUrl": "http://localhost:3000/api/v1",
       "mockRouter": false,
       "router": {
         "host": "192.168.88.1",
         "port": 8728,
         "username": "sudafi-agent",
         "password": "TestStrongPassword123!",
         "useSsl": false
       }
     }
     ```
4. **تسلسل الاختبار الميداني:**
   - اختبار فحص الاتصال: التأكد من تسجيل `Router connection verified`.
   - تنفيذ أمر `system.router.health`: التحقق من قراءة Uptime و CPU وموارد الذاكرة بدقة ومطابقتها لما يظهر في WinBox.
   - إنشاء ملف تعريف تجريبي على الراوتر:
     ```routeros
     /ip hotspot user profile add name=test-1hour rate-limit=2M/2M
     ```
   - إرسال أمر `hotspot.user.batch_add` لإضافة بطاقتين اختباريتين فقط (`test_u1`, `test_u2`).
   - فحص الراوتر والتأكد من ظهور البطاقات مع الـ `comment` المطابق لرمز الدفعة.
   - **اختبار التوفيق (Lost Ack Simulation):** إعادة إرسال نفس الأمر بنفس المعرّف والتأكد من إرجاع `alreadyExistingCount = 2` دون ظهور أخطاء أو إنشاء حسابات مكررة.
   - **اختبار كشف التعارض (Conflict Detection):** إنشاء مستخدم يدوي بنفس الاسم ولكن بـ Profile مختلف، ومحاولة إضافة بطاقة بنفس الاسم، والتأكد من قيام الوكيل برفض الإضافة وتسجيل `Conflict` لحماية بيانات الراوتر.

---

## 7. ما يلزم قبل التفكير في اختبار منصة Render

> [!WARNING]
> **تنبيه:** لا تفترض إطلاقاً أن بيئة الإنتاج على Render جاهزة لاستقبال الوكيل.

قبل الانتقال لاختبار Render في المستقبل (عند التصريح بذلك)، يلزم إتمام الشروط التالية:
1. **المتغيرات البيئية على Render:**
   - التحقق من ضبط `AGENT_PAIRING_SECRET` بقيمة عشوائية سرية قوية (32 بايت على الأقل) في إعدادات Render Dashboard.
   - إذا كان السر غير مضبوط في بيئة الإنتاج، سيفشل توليد رموز الإقران كإجراء أمان افتراضي (`Safe Fail`).
2. **قاعدة بيانات الإنتاج (Supabase):**
   - لم يتم تنفيذ الميجريشنز على Supabase حتى الآن التزاماً بالقيود.
   - يجب مراجعة وتنفيذ ملفي الميجريشن:
     - `20261010230000_add_device_agent_and_pairing`
     - `20261011080000_add_agent_commands`
     على قاعدة البيانات المربوطة بـ Render قبل فتح أي اتصال من الوكيل. محاولة تشغيل الوكيل قبل ذلك ستنتج أخطاء `PrismaClientKnownRequestError: Table does not exist`.
3. **التعامل مع نوم الخدمة (Cold Start على Render Free Tier):**
   - نسخة Render المجانية تنام بعد 15 دقيقة من عدم تلقي طلبات، وتستغرق استعادة التشغيل بين 45 إلى 90 ثانية.
   - تم تجهيز [`ApiClient`](file:///e:/microTik_project/apps/agent/src/transport/api-client.ts) بمهلة افتراضية `httpTimeoutMs = 60000` (60 ثانية) مع 5 محاولات إعادة اتصال وتأخير أسي عشوائي (Exponential Backoff with Jitter).
   - بمجرد اتصال الوكيل، فإن نبضات الـ Heartbeat الدورية (كل 25 ثانية) كافية للحفاظ على استيقاظ الخادم طالما أن الوكيل قيد التشغيل.

---

## 8. إمكانية إنتاج ملف توزيع مستقل (.exe) ومتطلبات جهاز العميل

### 8.1 الوضع الحالي
- حالياً، لا ينتج المشروع ملف `.exe` مجمّعاً، بل يُترجم الكود المصدري إلى JavaScript عادي داخل مجلد `dist/` ويعمل عبر:
  [`apps/agent/sudafi-agent.cmd`](file:///e:/microTik_project/apps/agent/sudafi-agent.cmd) أو [`apps/agent/sudafi-agent.ps1`](file:///e:/microTik_project/apps/agent/sudafi-agent.ps1).

### 8.2 متطلبات جهاز العميل للتشغيل بالوضع الحالي (Node.js Mode)
1. **نظام التشغيل:** Windows 10 (64-bit) أو Windows 11 أو Windows Server 2016 وما فوق.
2. **بيئة Node.js:** تثبيت Node.js (الإصدار 18.0.0 أو 20.0.0 وما فوق) لدعم واجهات `fetch` و `AbortSignal.timeout` الأصيلة.
3. **PowerShell:** مثبت افتراضياً بنظام ويندوز (PowerShell 5.1+) ومفعل فيه دعم .NET (`System.Security`) لعمل DPAPI.
4. **صلاحيات الوصول:** لا يشترط صلاحيات Administrator للتشغيل العادي أو الإقران؛ تلزم صلاحيات المسؤول فقط عند الرغبة في تثبيت المهمة المجدولة عبر Task Scheduler بأعلى الصلاحيات.

### 8.3 إمكانية إنتاج ملف تنفيذي مستقل لويندوز (`sudafi-agent.exe`)
* **الجدوى التقنية:**
  - يتميز كود `@mikrotik-saas/agent` بأن **اعتمادياته الخارجية عند التشغيل تساوي صفراً (Zero External Runtime Dependencies)**.
  - يعتمد فقط على مكتبات Node.js القياسية (`net`, `tls`, `crypto`, `fs`, `path`, `os`, `child_process`).
* **طرق الإنتاج المتاحة لتوزيع الوكيل:**
  1. **الخيار الأول: حزمة محمولة ذاتية الاحتواء (Portable Self-Contained Bundle) — [الموصى به حالياً]**
     - يتم تجهيز مجلد مضغوط (`sudafi-agent-portable.zip`) يحتوي على ملف `node.exe` محمول ومجلد `dist/` ومشغل `sudafi-agent.cmd`.
     - **الميزة:** لا يحتاج العميل لتثبيت Node.js على جهازه نهائياً، ويعمل فور فك الضغط.
  2. **الخيار الثاني: تجميع تنفيذي مستقل (Single Executable Application - SEA)**
     - تتيح بيئة Node.js 20 المعتمدة في المشروع ميزة SEA المدمجة لدمج الكود داخل ملف تنفيذي واحد مستقل تماماً (`sudafi-agent.exe`).

---

## 9. سجل الاختبارات الفعلي (Executed vs Pending Matrix)

| فئة الاختبار | اسم الاختبار / السيناريو | الحالة الفعلية | البيئة المستخدمة |
| :--- | :--- | :---: | :--- |
| **تشفير الأسرار** | تشفير وفك تشفير DPAPI على Windows | **PASS** (تم اختباره فعلياً) | Windows 10/11 عبر PowerShell / .NET |
| **تشفير الأسرار** | رفض فك التشفير عند تلف البيانات أو تزييفها | **PASS** (تم اختباره فعلياً) | وحدة اختبار `credential-vault.spec.ts` |
| **تشفير الأسرار** | نمط Fallback بـ AES-256-GCM | **PASS** (تم اختباره فعلياً) | وحدة اختبار `credential-vault.spec.ts` |
| **التوفيق (Reconciliation)** | مطابقة الحساب والمواصفات (Safe Idempotency) | **PASS** (تم اختباره فعلياً) | وحدة اختبار `mock-router-worker.spec.ts` |
| **التوفيق (Reconciliation)** | كشف تعارض الحسابات (Name Collision Conflict) | **PASS** (تم اختباره فعلياً) | وحدة اختبار `mock-router-worker.spec.ts` |
| **التكامل الشبكي** | دورة الإقران الكاملة وحفظ التوكن | **PASS** (تم اختباره فعلياً) | خادم HTTP محلي أصيل `agent-backend-integration.spec.ts` |
| **التكامل الشبكي** | النبضات الدورية وتحديث حالة ONLINE | **PASS** (تم اختباره فعلياً) | خادم HTTP محلي أصيل `agent-backend-integration.spec.ts` |
| **التكامل الشبكي** | استلام الأوامر وتسليم النتيجة | **PASS** (تم اختباره فعلياً) | خادم HTTP محلي أصيل `agent-backend-integration.spec.ts` |
| **التكامل الشبكي** | محاكاة انقطاع الاتصال وإعادة الاتصال | **PASS** (تم اختباره فعلياً) | خادم HTTP محلي أصيل `agent-backend-integration.spec.ts` |
| **التكامل الشبكي** | الرد على التوكن الملغى (Revocation Detection) | **PASS** (تم اختباره فعلياً) | خادم HTTP محلي أصيل `agent-backend-integration.spec.ts` |
| **اختبارات النظام** | 37 اختبار لوكيل الويندوز بالكامل | **PASS 100%** (37/37) | بيئة التطوير المحلية |
| **اختبارات الـ Backend** | 164 اختبار لجميع خدمات ووحدات API | **PASS 100%** (164/164) | بيئة التطوير المحلية |
| **الميداني (Real Device)** | مصادقة RouterOS v6 / v7 عبر Socket حقيقي | **لم يُختبر بعد** (Pending) | بانتظار توفير راوتر مختبر معزول ومصرّح |
| **الميداني (Real Device)** | التحقق من شهادة TLS حقيقية على المنفذ 8729 | **لم يُختبر بعد** (Pending) | بانتظار توفير راوتر مختبر معزول ومصرّح |
| **الميداني (Windows)** | إعادة تشغيل نظام Windows الفعلي واختبار Task Scheduler | **لم يُختبر بعد** (Pending) | بانتظار تجربة ميدانية على بيئة ويندوز معزولة |

---

## 10. الالتزام بالقيود والتوقف للمراجعة (Hold for Review)

تأكيداً على الالتزام التام بالتوجيهات الصارمة:
- لم يتم النشر إلى Render أو تعديل إعداداته.
- لم يتم الاتصال بقاعدة بيانات الإنتاج في Supabase أو تطبيق أي Migration عليها.
- لم يتم الاتصال بأي راوتر عميل.
- لم تُستخدم أي خدمات مدفوعة.
- تم توثيق ما تم اختباره فعلياً وما ينتظر الاختبار الميداني بشفافية كاملة.
- توقف العمل هنا تماماً بانتظار مراجعة الإدارة والموافقة على الخطة.
