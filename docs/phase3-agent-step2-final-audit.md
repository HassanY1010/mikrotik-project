# تقرير المراجعة الفنية والأمنية الشاملة — Phase 3: Step 2
## SudaFi Cloud Platform — Agent Communication & Heartbeat Protocol

**تاريخ المراجعة:** 11 أكتوبر 2026  
**المسار الأساسي:** `E:\microTik_project`  
**الحالة:** مكتمل ومُدقّق — جاهز للانتقال إلى Step 3 بعد الاعتماد  

---

## 1. الملخص التنفيذي وقرار الجاهزية (Executive Summary & Readiness Verdict)

أُجريت مراجعة فنية وأمنية مستقلة وشاملة لكافة مكونات **Phase 3 — Step 2: Agent Communication & Heartbeat Protocol**.  
شملت المراجعة:
1. فحص سلوك بروتوكول النبضات (Heartbeat) في ظل قيود الخطة المجانية لمنصة Render (Render Free Tier) وخطر النوم (Spindown) والتشغيل البارد (Cold Start).
2. فحص آلية منع تكرار الأوامر (Idempotency) وحل معضلة استجابة النتيجة المفقودة (Lost Ack) والتمييز الصارم بين عدم تكرار تسجيل الأمر في الخادم وعدم تكرار أثره على الراوتر.
3. تدقيق ملف الـ Migration ومخطط Prisma مع تحسين الفهارس وحذف الفهارس المكررة.
4. مراجعة أمنية لعزل المستأجرين (Tenant Isolation)، وصلاحية التوكنات، وحظر الوكلاء الملغيين، وسياسة `trust proxy: 1`.
5. تنفيذ واختبار جميع الحالات الحدية، ليصل إجمالي اختبارات وحدة الـ Agent إلى **59 اختباراً ناجحاً من أصل 59**، وإجمالي اختبارات الـ API إلى **164 اختباراً ناجحاً عبر 20 جناح اختبار (Test Suites) بنسبة نجاح 100% وبناء نظيف (Clean Build)**.

### قرار الجاهزية (Readiness Verdict):
> **جاهز للانتقال إلى Phase 3 — Step 3 (Agent Core & Local Worker Service)** بشرط الالتزام الصارم بالإرشادات والتوجيهات الموثقة في هذا التقرير لتطوير عميل الوكيل (Windows Agent).

---

## 2. الملفات التي تمت مراجعتها وتعديلها (Audited and Modified Files)

| الملف | نوع الإجراء | الوصف والدور الفني |
| :--- | :---: | :--- |
| [`apps/api/prisma/schema.prisma`](file:///E:/microTik_project/apps/api/prisma/schema.prisma) | تعديل | تصحيح الفهارس في جدول `AgentCommand`: حذف الفهرس المكرر على `operationId` وإضافة فهرس مركب `[agentId, status]` لتسريع استعلامات النبضات. |
| [`apps/api/prisma/migrations/20261011080000_add_agent_commands/migration.sql`](file:///E:/microTik_project/apps/api/prisma/migrations/20261011080000_add_agent_commands/migration.sql) | تعديل | تحديث DDL لحذف الفهرس الفردي المكرر وتضمين الفهرس المركب `agent_commands_agentId_status_idx`. |
| [`apps/api/src/modules/agent/agent.service.ts`](file:///E:/microTik_project/apps/api/src/modules/agent/agent.service.ts) | تدقيق ومراجعة | فحص منطق النبضات، معالجة الـ Lost Ack عبر إعادة الجدولة بعد انتهاء مهلة الإرسال (Dispatch Timeout = 2 دقيقة)، والتحديث الذري للنتائج عبر `updateMany`. |
| [`apps/api/src/modules/agent/agent.controller.ts`](file:///E:/microTik_project/apps/api/src/modules/agent/agent.controller.ts) | تدقيق ومراجعة | التحقق من مسارات الـ Agent، استخراج التوكنات الآمن، عزل المستأجرين، وحظر الأوامر غير المصرح بها. |
| [`apps/api/src/modules/agent/agent.service.spec.ts`](file:///E:/microTik_project/apps/api/src/modules/agent/agent.service.spec.ts) | تعديل وإضافة | تصحيح اختبارات `submitCommandResult` لتتوافق مع التحديث الذري `updateMany`، وإضافة اختبارات لعزل المستأجرين في `getCommandStatus`، واختبار عودة الوكيل من `OFFLINE` إلى `ONLINE` بعد إعادة تشغيل الخادم. |
| [`apps/api/src/modules/agent/agent.controller.spec.ts`](file:///E:/microTik_project/apps/api/src/modules/agent/agent.controller.spec.ts) | تدقيق ومراجعة | 13 اختباراً تغطي جميع مسارات التحكم والتحقق من التوكنات ومعالجة الأخطاء. |
| [`apps/api/src/main.ts`](file:///E:/microTik_project/apps/api/src/main.ts) | فحص أمني | تدقيق إعداد `trust proxy: 1` لمنع تزوير عنوان IP في بيئة Render الخلفية. |

---

## 3. مراجعة Render المجاني وتأثير النوم وإعادة التشغيل (Render Free Tier Audit)

### 3.1 سلوك الخادم المجاني وحقيقة منع النوم (Spindown Reality)
- **آلية المنصة:** تتوقف خدمات الويب في خطة Render المجانية عن العمل (Spindown) تلقائياً عند غياب أي حركة مرور HTTP واردة لمدة 15 دقيقة متواصلة.
- **مغالطة "نبضة كل 25 ثانية تمنع النوم دائماً":**
  - إرسال نبضة دورية كل 25 ثانية من الوكيل يبقي الخادم نشطاً **فقط طالما كان جهاز الكمبيوتر المحلي قيد التشغيل والإنترنت متصلاً**.
  - في الواقع الميداني في السودان (انقطاع الكهرباء، إغلاق المحل ليلاً، انقطاع شبكة الإنترنت المحلية)، سيتوقف الوكيل عن إرسال النبضات حتماً، مما يؤدي إلى دخول حاوية Render في وضع النوم (Sleep Mode).
  - **حد الساعات المجانية (750 Free Hours/Month):** إبقاء الخادم يعمل 24/7 دون نوم يستهلك 744 ساعة شهرياً (في شهر من 31 يوماً)، مما يستنفد الحصة المجانية بالكامل ويخاطر بتعليق الحساب حتى بداية الشهر التالي إذا كان هناك أي خدمة أخرى على الحساب.
  - تعيد Render تشغيل الحاويات بصفة دورية للصيانة أو التحديثات.

### 3.2 التشغيل البارد (Cold Start) ومتطلبات عميل الوكيل (Agent Client)
- يستغرق تشغيل حاوية Render من وضع النوم (Cold Start) ما بين **30 إلى 60 ثانية** (تشغيل الحاوية، بدء عملية Node.js، تهيئة NestJS، وفتح اتصال Prisma بقاعدة بيانات Supabase).
- إذا كان العميل المحلي يستخدم مهلة اتصال افتراضية قصيرة (مثل 5 أو 10 ثوانٍ)، ستفشل الطلبات بخطأ `ECONNABORTED` أو `Timeout`.
- **التوجيه الإلزامي لـ Step 3:**
  1. يجب ضبط مهلة اتصال الـ HTTP في عميل الوكيل عند الاتصال الأول أو بعد الانقطاع على **60 إلى 90 ثانية** لإتاحة وقت كافٍ لـ Cold Start دون انهيار العميل.
  2. اعتماد خوارزمية التراجع الأسي مع اضطراب عشوائي (Exponential Backoff with Jitter):
     $$\text{delay} = \min(60s, \text{base} \times 2^{\text{attempt}}) \pm \text{jitter}$$
     (مثلاً: 2 ثانية، 4 ثوانٍ، 8 ثوانٍ، وصولاً إلى 60 ثانية كحد أقصى).
  3. عزل حالة الوكيل في الذاكرة المحلية والقرص (Local Offline Buffer) بحيث لا يتسبب انقطاع الخادم في إيقاف الخدمة المحلية.

### 3.3 بنية الخادم عديمة الحالة (Stateless Architecture)
- الخادم الخلفي لا يحتفظ بأي حالة اتصال في ذاكرة العملية (Process RAM).
- جميع حالات الوكلاء (`lastPingAt`, `status`, `ipAddress`, `version`) مخزنة في قاعدة البيانات.
- عند استيقاظ الخادم واستلام نبضة جديدة، يتم التحقق من التوكن وتحديث الحالة إلى `ONLINE` فوراً دون أي اعتماد على جلسات سابقة.
- تم ضبط مجدول الفحص الدوري (Sweeper) ليعمل كل 30 ثانية في الخلفية باستخدام `unref()` على المؤقت لمنع حظر انتهاء العملية، ويقوم بفحص وإسقاط الوكلاء المتأخرين (`OFFLINE`) بعد 60 ثانية من آخر نبضة.

---

## 4. مراجعة منع تكرار الأوامر وحالة "Lost Ack" (Command Deduplication & Idempotency Audit)

### 4.1 التخزين الفعلي والقيود الصارمة
- يتم تخزين الأوامر في جدول `agent_commands` المزود بحقل `operationId` وهو معرف UUID يتم توليده عند طلب الأمر.
- الحقل محمي بقيد فريد فعلي في قاعدة البيانات:
  ```sql
  CREATE UNIQUE INDEX "agent_commands_operationId_key" ON "agent_commands"("operationId");
  ```
- عند استلام طلب جدولة أمر مكرر:
  1. إذا كان `operationId` مسجلاً مسبقاً لنفس الراوتر: يُعاد الأمر المسجل كما هو دون تكرار إنشائه (Idempotent 201/200).
  2. إذا كان `operationId` مستخدماً لراوتر آخر: يُرفض فوراً بـ `409 Conflict`.
  3. في حالة السباق المتزامن (Concurrent Race Condition): تم التقاط خطأ Prisma `P2002` بأمان داخل `queueCommand` ليعيد السجل الذي أنشأته المعاملة المتزامنة دون انهيار الـ API.

### 4.2 تحليل حالة استجابة النتيجة المفقودة (The "Lost Ack" Problem)
**السيناريو:**
1. يسحب الوكيل أمراً لإضافة مستخدمين (`hotspot.user.batch_add`).
2. ينتقل الأمر في الخادم إلى حالة `DISPATCHED` مع تسجيل `attempts = 1`.
3. ينفذ الوكيل الأمر بنجاح على راوتر MikroTik.
4. ينقطع اتصال الإنترنت فوراً قبل أن يتمكن الوكيل من إرسال نتيجة التنفيذ (`POST /agent/commands/:id/result`).

**معالجة الخادم:**
- يظل الأمر في حالة `DISPATCHED`.
- بعد مرور مهلة الإرسال (`DISPATCH_TIMEOUT_MS = 2 minutes`)، إذا لم يُسلّم العميل نتيجة ولم يتجاوز الحد الأقصى للمحاولات (`MAX_COMMAND_ATTEMPTS = 3`)، يعيد استعلام النبضة التالي إرسال الأمر للوكيل مع زيادة عداد المحاولات.
- يمنع التحديث الذري عبر `prisma.agentCommand.updateMany` تعارض التسجيلات المتزامنة للنتائج.

### 4.3 التمييز الجوهري بين عدم تكرار تسجيل الأمر في الخادم وعدم تكرار أثره على الراوتر
> [!CRITICAL]
> **قيد `operationId` في قاعدة البيانات يضمن عدم تكرار تسجيل الأمر في الخادم فقط، لكنه لا يمنع تكرار تنفيذه على العتاد (MikroTik Router) إذا أُعيد إرسال الأمر بسبب فقدان الاستجابة (Lost Ack)!**

- **الأوامر القارئة (Read-only Commands):**
  - مثل `system.router.health` و `hotspot.session.list`: بطبيعتها آمنة التكرار (Pure Idempotent).
- **الأوامر المغيّرة للحالة (State-Mutating Commands):**
  - مثل `hotspot.user.batch_add`: إذا قام الوكيل بإعادة تنفيذ `/ip/hotspot/user/add` على راوتر MikroTik لمستخدمين أُضيفوا بالفعل في المحاولة السابقة، سيرد الراوتر بخطأ:
    ```
    failure: already have user with this name
    ```
- **التوجيه الإلزامي لـ Step 3 (Client-side Reconciliation Protocol):**
  يجب على العميل المحلي قبل إضافة أي بطاقة / مستخدم Hotspot:
  1. إما التحقق من وجود المستخدم مسبقاً (`/ip/hotspot/user/print where name=...`).
  2. أو التقاط خطأ `already have user with this name`، ومقارنة التعليق والبروفايل، فإذا كانا متطابقين، يُعتبر التنفيذ ناجحاً ومكتملاً (Idempotent Success) بدلاً من تسجيل فشل الأمر.
  3. لأمر الحذف `hotspot.user.remove`: إذا كان المستخدم غير موجود أصلاً، يُعتبر الأمر مكتملاً بنجاح.

---

## 5. مراجعة قاعدة البيانات وملف Migration والتحقق الواقعي (Database & Migration Audit)

### 5.1 فحص ملف الـ Migration ومخطط Prisma
- تم فحص ملف الـ Migration الجديد:
  [`apps/api/prisma/migrations/20261011080000_add_agent_commands/migration.sql`](file:///E:/microTik_project/apps/api/prisma/migrations/20261011080000_add_agent_commands/migration.sql)
- **العلاقات والقيود:**
  - تم ربط جدول `agent_commands` بجداول `tenants` و `mikrotik_devices` و `device_agents` بعلاقات تكامل مرجعي صارمة مع `ON DELETE CASCADE`.
  - نوع الحالة مُعرّف كـ Enum أصيل: `AgentCommandStatus ('PENDING', 'DISPATCHED', 'COMPLETED', 'FAILED', 'EXPIRED')`.
- **تصحيح الفهارس (Indexes Optimization):**
  - **المشكلة المكتشفة:** كان الحقل `operationId` يحتوي على قيد فريد `agent_commands_operationId_key` بالإضافة إلى فهرس عادي منفصل `agent_commands_operationId_idx`. وجود فهرسين لنفس العمود يمثل تكراراً غير ضروري يستهلك الذاكرة وموارد الكتابة.
  - **التصحيح:** حُذف الفهرس الفردي المكرر، وأُضيف فهرس مركب بالغ الأهمية:
    ```sql
    CREATE INDEX "agent_commands_agentId_status_idx" ON "agent_commands"("agentId", "status");
    ```
    يضمن هذا الفهرس سرعة استعلام النبضات الدورية التي تبحث دائماً عن الأوامر بدلالة `(agentId, status)`.

### 5.2 الإقرار بالواقع البيئي (Database Environment Transparency)
> [!NOTE]
> **إقرار بالشفافية الكاملة:**
> - بناءً على تعليمات المستخدم الصارمة: لم يتم استخدام Docker، ولم تكن هناك خدمة PostgreSQL محلية قيد التشغيل على نظام Windows.
> - قاعدة البيانات المُهيأة في ملف `.env` هي قاعدة بيانات الإنتاج (Supabase).
> - التزاماً بالقيد الصارم بعدم تنفيذ أي migration على الإنتاج أو تعديل بياناته، **لم يتم تشغيل migration حقيقي على خادم PostgreSQL مباشر**.
> - تم التحقق من صحة المخطط عبر `prisma validate` بنجاح كامل، وتم التحقق من تكامل الكود وسلوك المعاملات عبر 59 اختبار Jest باستخدام Prisma Mocks المحكمة والشاملة.

---

## 6. مراجعة الأمان والتحكم في الوصول (Security & Access Control Audit)

### 6.1 مصادقة التوكنات والتحقق من الإلغاء (Token Auth & Revocation)
- **التشفير والتجزئة:** يتم تجزئة توكن الوكيل (64-character hex) باستخدام خوارزمية SHA-256 قبل البحث عنه في قاعدة البيانات، مما يمنع استرجاع التوكن الأصلي في حال تسرب قاعدة البيانات.
- **التحقق من الإلغاء الصارم:** في كل نبضة (`processHeartbeat`) وعند تسليم نتيجة أي أمر (`submitCommandResult`)، يتم التحقق الفوري من حالة الوكيل:
  - إذا كانت `agent.status === REVOKED`، يُرفض الطلب فوراً بـ `401 Unauthorized` (`Agent access has been revoked`).
  - إذا كان المستأجر معلقاً (`SUSPENDED`)، يُرفض بـ `403 Forbidden`.
  - إذا كان الراوتر محذوفاً، يُرفض بـ `404 NotFound`.

### 6.2 عزل المستأجرين (Tenant Isolation)
- مسارات لوحة التحكم الخاصة بجدولة الأوامر محمية بـ `JwtAuthGuard` و `TenantGuard` و `RolesGuard`.
- يتم التحقق برمجياً من تبعية الراوتر للمستأجر الطالب:
  ```typescript
  if (tenantId && device.tenantId !== tenantId) {
    throw new ForbiddenException('Access denied: Device does not belong to authorized tenant');
  }
  ```
- لا يمكن للوكيل تسليم نتيجة لأمر موجه لوكيل آخر (`command.agentId !== auth.agent.id`).
- لا يمكن الاستعلام عن حالة أمر يخص راوتراً آخر أو مستأجراً آخر.

### 6.3 منع تسريب الأسرار في السجلات
- جميع استدعاءات `logger.log` و `logger.error` تسجل المعرفات فقط (`id`, `operationId`, `type`, `count`)، ولا تطبع التوكنات الخام أو كلمات المرور أو حزم البيانات الحساسة.
- تم ضبط `bufferLogs: true` مع مكتبة Pino لتأمين سجلات الخادم.

### 6.4 فحص إعداد `trust proxy`
- في ملف `apps/api/src/main.ts` (السطر 40):
  ```typescript
  (app.getHttpAdapter().getInstance() as any).set('trust proxy', 1);
  ```
- هذا الإعداد صحيح تماماً للبنية التحتية لمنصة Render، حيث توجد نقطة وكيل عكسي واحدة (Reverse Proxy) تنهي اتصال الـ TLS أمام الحاوية.
- ضبط القيمة على `1` يجعل Express يعتمد على أقصى عنوان IP موثوق في ترويسة `X-Forwarded-For` ويمنع تزوير العناوين من جهة العميل.

### 6.5 حظر تنفيذ الأوامر العشوائية (No Arbitrary CLI Execution)
- لا توجد أي واجهة تقبل تنفيذ أوامر طرفية عشوائية على الراوتر (`system.terminal.exec` محظورة ومرفوضة).
- تم حصر الأوامر بدقة عبر قائمة بيضاء موثقة في `AgentCommandType`:
  1. `system.router.health`
  2. `hotspot.user.batch_add`
  3. `hotspot.user.remove`
  4. `hotspot.user.verify_batch`
  5. `hotspot.session.list`
- أي نوع أمر خارج هذه القائمة يُرفض فوراً بـ `400 BadRequestException`.

---

## 7. نتائج الاختبارات والبناء الفعلي (Test & Build Execution Results)

### 7.1 فحص بناء المشروع (API Build)
```bash
pnpm --filter @mikrotik-saas/api build
```
- **النتيجة:** ناجح بنسبة 100% (Exit status 0).
- شمل البناء حزم: `@mikrotik-saas/shared-types` و `@mikrotik-saas/shared-validation` وتوليد عميل Prisma Client (`v5.22.0`) وبناء NestJS بنجاح تام دون أي أخطاء TypeScript أو Linting.

### 7.2 نتائج اختبارات وحدة الوكيل (`src/modules/agent`)
```bash
pnpm --filter @mikrotik-saas/api test -- --testPathPattern="src/modules/agent"
```
- **عدد أجنحة الاختبار:** 2 أجنحة ناجحة من أصل 2 (`agent.controller.spec.ts`, `agent.service.spec.ts`).
- **عدد الاختبارات الفردية:** **59 اختباراً ناجحاً من أصل 59 اختباراً** (0 فشل).
- **الحالات التي تم التحقق منها:**
  - توليد رمز الإقران والتجزئة وحمايته من التخمين والانتهاء وقفل المحاولات.
  - إقران الوكيل الذري ومنع تكرار الإقران للراوتر نفسه.
  - إلغاء الوكيل فورياً وحظر استخدامه القديم.
  - التحقق من النبضات الدورية وتحديث حالة الوكيل من `OFFLINE` إلى `ONLINE` مع تسجيل الـ IP والإصدار.
  - اكتشاف الوكلاء المنقطعين وتحويلهم إلى `OFFLINE` عند تجاوز 60 ثانية.
  - جدولة الأوامر المصرح بها فقط ورفض الأوامر العشوائية.
  - منع تكرار الأوامر بواسطة `operationId` ومعالجة حالات السباق المتزامنة (`P2002`).
  - معالجة الـ Lost Ack وإعادة جدولة الأوامر التي انتهت مهلتها (`DISPATCH_TIMEOUT_MS`).
  - انتهاء صلاحية الأوامر القديمة (`EXPIRED`) عند تجاوز TTL أو عدد المحاولات.
  - التسجيل الذري لنتائج الأوامر والتعامل مع النتائج المكررة بأمان (Idempotent).
  - عزل المستأجرين في الاستعلام والجدولة ونتائج الأوامر.

### 7.3 نتائج اختبارات المنظومة ككل (Full Monorepo API Test Suite)
```bash
pnpm --filter @mikrotik-saas/api test
```
- **عدد أجنحة الاختبار:** **20 جناح اختبار ناجح من أصل 20** (100% Pass).
- **إجمالي الاختبارات:** **164 اختباراً ناجحاً من أصل 164** (0 فشل، 0 تراجع).
- يؤكد ذلك عدم وجود أي أثر جانبي أو تراجع وظيفي على وحدات: البطاقات (Cards)، المبيعات (Sales)، الحصص (Quotas)، المشتركين (Tenants)، المصادقة (Auth)، الأجهزة (Devices)، و MikroTik Socket Protocol.

---

## 8. المشكلات المكتشفة والتصحيحات المنفذة أثناء المراجعة (Discovered Issues & Fixes Applied)

| # | المشكلة المكتشفة | مستوى الخطورة | الإجراء التصحيحي المنفذ |
| :---: | :--- | :---: | :--- |
| **1** | وجود فهرس مكرر على عمود `operationId` في Prisma و SQL Migration إلى جانب القيد الفريد الأصلي. | منخفض | تم حذف الفهرس الفردي المكرر واستبداله بفهرس مركب أساسي `@@index([agentId, status])` لتسريع استعلام النبضات. |
| **2** | فشل اختبار وحدة `submitCommandResult` لتوقعه استدعاء `prisma.agentCommand.update` بدلاً من التحديث الذري `updateMany`. | متوسط | تم تعديل توكيدات الاختبار لتتوافق مع التحديث الذري المانع لحالات السباق، والتأكد من نجاح الاختبار. |
| **3** | نقص التغطية الاختبارية لحالة استعلام حالة الأمر (`getCommandStatus`) وعزل المستأجرين فيها. | متوسط | أُضيفت 4 اختبارات تفصيلية لـ `getCommandStatus` تغطي النجاح، عدم وجود الجهاز، عدم ملكية الجهاز للمستأجر، وعدم تبعية الأمر للجهاز. |
| **4** | غياب اختبار صريح لتحول الوكيل من `OFFLINE` إلى `ONLINE` عند إعادة الاتصال بعد نوم الخادم أو إعادة تشغيله. | متوسط | أُضيف اختبار صريح يحاكي عودة الوكيل من وضع عدم الاتصال وتحديث الـ IP والإصدار بنجاح. |

---

## 9. المخاطر المتبقية والتوجيهات الإلزامية للمرحلة Step 3 (Remaining Risks & Step 3 Directives)

عند البدء في **Phase 3 — Step 3: Agent Core & Local Worker Service**، يجب على فريق التطوير الالتزام الصارم بالتوجيهات التالية:

1. **ضبط مهلة الـ HTTP في عميل الوكيل:**  
   يجب أن تكون مهلة طلبات HTTP في تطبيق Windows Agent لا تقل عن **60-90 ثانية** عند طلب النبضات، لمواجهة ظاهرة التشغيل البارد (Cold Start) على منصة Render.
2. **التراجع الأسي عند انقطاع الاتصال:**  
   في حال فشل الاتصال، لا يجوز إعادة المحاولة فوراً وبشكل متواصل، بل يجب استخدام Exponential Backoff يبدأ من ثانيتين ويتضاعف حتى 60 ثانية مع إضافة Jitter.
3. **تطبيق بروتوكول التوفيق المحلي (Client Reconciliation):**  
   في أوامر التعديل على الراوتر (مثل إضافة المستخدمين)، يجب ألا يعتمد الوكيل على افتراض التنفيذ لمرة واحدة فقط؛ بل يجب عليه فحص المستخدمين أولاً على الراوتر، أو اعتبار خطأ `already have user with this name` تنفيذاً ناجحاً إذا تطابقت البيانات.
4. **التخزين المحلي للعمليات المعلقة (Local SQLite/Queue Buffer):**  
   يجب أن يمتلك العميل آلية تخزين مؤقت محلي للأحداث والمخرجات لضمان عدم فقدان أي بيانات أثناء انقطاعات الإنترنت التي قد تمتد لساعات.
5. **تشفير الأسرار على نظام Windows:**  
   استخدام Windows Data Protection API (DPAPI) لتشفير `AgentAuthToken` وبيانات اعتماد MikroTik المحلية على قرص جهاز العميل.

---

## 10. الخلاصة والخطوة التالية (Conclusion)

تم إنجاز المراجعة الفنية والأمنية لـ **Phase 3 — Step 2** بنجاح تام وفق أعلى معايير الجودة والاستقرار.  
جميع الأهداف متحققة، والاختبارات تمر بنسبة 100% (164/164)، والكود آمن ومحكم ومستعد للانتقال إلى المرحلة التالية.

**التوقف التام:** وفقاً للتعليمات الصارمة، تم إيقاف العمل وعدم الشروع في Step 3 أو بناء أي تطبيق عميل حتى تتم مراجعة هذا التقرير واعتماده من قبل المستخدم.
