# تقرير إنجاز المهمة 4.1: أساس قاعدة البيانات والعقود المشتركة لدعم PPPoE
## SudaFi Cloud Platform — Phase 4: Task 4.1 Implementation Report

**تاريخ الإنجاز:** 11 أكتوبر 2026  
**المسار الأساسي:** `E:\microTik_project`  
**الحالة:** مكتملة بنجاح 100% مع اجتياز كامل الاختبارات وفصل تام عن الإنتاج  
**المهمة المنجزة:** المهمة 4.1 فقط (نماذج قاعدة البيانات، ملف الـ Migration، والعقود والأنواع المشتركة)

---

## 1. الملفات التي تغيرت وأُضيفت في هذه المهمة

| المسار | نوع الملف | الإجراء والهدف |
| :--- | :---: | :--- |
| [`apps/api/prisma/schema.prisma`](file:///e:/microTik_project/apps/api/prisma/schema.prisma) | تعديل | إضافة Enum `PppoeAccountStatus`، نماذج `PppoeProfile` و `PppoeAccount` و `PppoeActiveSession`، وتوسيع علاقات `Tenant` و `MikroTikDevice`. |
| [`apps/api/prisma/migrations/20261011190000_add_pppoe_support/migration.sql`](file:///e:/microTik_project/apps/api/prisma/migrations/20261011190000_add_pppoe_support/migration.sql) | إضافة | ملف الـ Migration القياسي لإنشاء الجداول والفهارس والقيود وتطبيقه محلياً. |
| [`apps/api/prisma/migrations/migration_lock.toml`](file:///e:/microTik_project/apps/api/prisma/migrations/migration_lock.toml) | إضافة | قفل التوافق المعياري لـ Prisma (`provider = "postgresql"`). |
| [`packages/shared-types/src/index.ts`](file:///e:/microTik_project/packages/shared-types/src/index.ts) | تعديل | توسيع `AgentCommandType` بـ 8 أوامر PPPoE جديدة، وإضافة Enum `PppoeAccountStatus`، والواجهات `PppoeProfileItem`، `PppoeAccountItem`، `PppoeActiveSessionItem`، وحمولات أوامر الوكيل (`PppoeSecretAddPayload` وغيرها). |
| [`apps/api/src/modules/agent/dto/command.dto.ts`](file:///e:/microTik_project/apps/api/src/modules/agent/dto/command.dto.ts) | تعديل | مزامنة `AgentCommandType` في الـ API لدعم القائمة البيضاء لأوامر PPPoE. |

> **ملاحظة تأكيدية:** لم يتم لمس أو تعديل أي موديول في Backend (لم يُنشأ `pppoe.service.ts` أو `pppoe.controller.ts`)، ولم يتم لمس لوحة الإدارة React أو تطبيق Flutter في هذه المهمة، التزاماً بنطاق المهمة 4.1 حصراً.

---

## 2. نماذج البيانات والحقول والعلاقات المضافة وأسبابها

### 2.1 Enum: `PppoeAccountStatus`
- **الحالات:** `ACTIVE`, `DISABLED`, `EXPIRED`, `SUSPENDED`.
- **السبب:** التمييز الصريح بين المشترك المفعل والنشط، والمشترك المعطل لعدم السداد، والمنتهي الصلاحية، والمعلق إدارياً.

---

### 2.2 نموذج `PppoeProfile` (`pppoe_profiles`)
يمثل باقة السرعة وبروفايل الـ PPP في الراوتر:
- `id`: المعرّف الفريد UUID.
- `tenantId` & `deviceId`: للربط المتعدد الصارم مع المستأجر والراوتر المعني (`onDelete: Cascade`).
- `name`: اسم البروفايل في MikroTik (مثل `Home-4M`, `Fiber-10M`).
- `rateLimit`: حد السرعة بصيغة ميكروتك (مثل `4M/8M` للرفع/التنزيل).
- `localAddress`: عنوان بوابة الراوتر (Gateway IP أو pool name).
- `remoteAddress`: مجمع العناوين المخصصة للمشتركين (`pppoe-pool`).
- `dnsServers`: خوادم DNS الموزعة (مثل `8.8.8.8,1.1.1.1`).
- `onlyOne`: قصر الجلسة على اتصال واحد فقط لكل حساب (`only-one=yes`).
- `price`: السعر المالي للباقة.
- **القيود والفهارس:** قيد فريد مركب `@@unique([tenantId, deviceId, name])` لمنع تكرار أسماء البروفايلات على نفس الراوتر، وفهارس على `tenantId` و `deviceId`.

---

### 2.3 نموذج `PppoeAccount` (`pppoe_accounts`)
يمثل حساب المشترك المنزلي الثابت:
- `id`: المعرّف الفريد UUID.
- `tenantId` & `deviceId`: ربط الحساب بالمستأجر والراوتر (`onDelete: Cascade`).
- `profileId`: ربط الحساب ببروفايل السرعة مع قيد أمان **`onDelete: Restrict`** (يمنع حذف البروفايل إذا كان هناك مشتركون مرتبطون به منعاً لإتلاف إعدادات خطوطهم).
- `username`: اسم مستخدم فريد ومقيد بـ `@@unique([tenantId, deviceId, username])`.
- **تخزين كلمة المرور الآمن:**
  * `passwordEncrypted`, `iv`, `authTag`:
  * **قرار التصميم الأمني:** بما أن بروتوكول MikroTik API يحتاج كلمة المرور الصريحة لإرسالها في أمر `/ppp/secret/add =password=...`، يُمنع استخدام التجزئة الأحادية (Hashing like bcrypt). وبدلاً من تخزينها بنص صريح (Plaintext)، تم اعتماد **التشفير المتماثل المعتمد للمشروع (AES-256-GCM Reversible Encryption with Unique Random IV and Auth Tag)**، وهو نفس المعيار المطبق بنجاح وأمان تام في بطاقات الهوتسبوت وكلمات مرور أجهزة الراوتر.
- `status`: حالة الحساب (`ACTIVE`, `DISABLED`, `EXPIRED`, `SUSPENDED`).
- `callerId`: حقل اختياري لقفل الماك أدرس للمودم المنزلي (MAC Lock).
- `staticIp`: حقل اختياري لتثبيت عنوان IP للمشترك (Static Remote Address).
- `customerName` & `customerPhone`: بيانات الاتصال بالمشترك للفوترة والدعم.
- `price` & `billingCycle`: سعر الاشتراك ودورة الفوترة (شهرية افتراضياً).
- `expiresAt`: تاريخ انتهاء الصلاحية.
- `syncStatus` & `syncError`: متابعة حالة التزامن مع راوتر MikroTik (`PENDING`, `SYNCED`, `FAILED`).
- **الفهارس:** فهارس بحث واستعلام سريعة على `(tenantId, status)` و `(tenantId, deviceId, status)` و `expiresAt`.

---

### 2.4 نموذج `PppoeActiveSession` (`pppoe_active_sessions`)
يمثل الجلسات المتصلة حالياً بالراوتر:
- `id`: المعرّف الفريد.
- `tenantId` & `deviceId`: ارتباط بالمستأجر والراوتر.
- `accountId`: ربط بالحساب المنزلي مع **`onDelete: SetNull`** (إذا حُذف الحساب، يبقى سجل الجلسة لأغراض التدقيق والإحصائيات وتُفرغ فقط خانة الحساب).
- `username`: اسم المشترك المتصل.
- `ipAddress`: عنوان IP الفعلي المعطى للمودم.
- `macAddress`: الماك أدرس المتصل به المودم (Caller-ID).
- `uptimeSeconds`: مدة الاتصال المستمرة.
- `bytesIn` & `bytesOut`: العداد التراكمي للبايتات المستهلكة بنوع `BigInt`.
- `sessionId`: معرّف الجلسة من راوتر ميكروتك.
- **مصدر التحديث وآلية انتهاء الجلسات:**
  * **المصدر:** يتم تحديث هذا الجدول دورياً عبر الوكيل LAN Agent باستدعاء أمر `pppoe.session.list` (الذي يستعلم عن `/ppp/active/print` في الراوتر).
  * **آلية المعالجة:** الجلسات التي تختفي من استجابة الراوتر يتم حذفها من الجدول أو تحويلها إلى سجل جلسات تاريخي، مما يضمن أن هذا الجدول يعكس بدقة اللحظة الراهنة لشبكة العميل.

---

## 3. أوامر PPPoE والأنواع المشتركة الجديدة في `shared-types`

تم توسيع حزمة العقود المشتركة [`@mikrotik-saas/shared-types`](file:///e:/microTik_project/packages/shared-types/src/index.ts) بإضافة 8 أوامر معزولة كلياً عن أوامر الهوتسبوت:

```typescript
export enum AgentCommandType {
  // Existing Hotspot Commands (بقيت كما هي دون أدنى تعديل)
  ROUTER_HEALTH = 'system.router.health',
  HOTSPOT_BATCH_ADD = 'hotspot.user.batch_add',
  HOTSPOT_USER_REMOVE = 'hotspot.user.remove',
  HOTSPOT_VERIFY_BATCH = 'hotspot.user.verify_batch',
  HOTSPOT_SESSION_LIST = 'hotspot.session.list',

  // New Dedicated PPPoE Command Types
  PPPOE_PROFILE_SYNC = 'pppoe.profile.sync',       // مزامنة وإنشاء بروفايل في الراوتر
  PPPOE_SECRET_ADD = 'pppoe.secret.add',           // إضافة مشترك في /ppp/secret
  PPPOE_SECRET_UPDATE = 'pppoe.secret.update',     // تعديل سرعة أو بيانات مشترك
  PPPOE_SECRET_DISABLE = 'pppoe.secret.disable',   // تعطيل مشترك وفصل اتصاله فوراً
  PPPOE_SECRET_ENABLE = 'pppoe.secret.enable',     // إعادة تفعيل المشترك
  PPPOE_SECRET_REMOVE = 'pppoe.secret.remove',     // حذف المشترك من الراوتر
  PPPOE_SESSION_LIST = 'pppoe.session.list',       // استعراض الجلسات النشطة /ppp/active
  PPPOE_SESSION_DISCONNECT = 'pppoe.session.disconnect', // فصل جلسة محددة
}
```

كما أُضيفت واجهات الحمولات المطبوعة بالكامل (`PppoeProfileSyncPayload`, `PppoeSecretAddPayload`, `PppoeSecretUpdatePayload`, `PppoeSecretStatusPayload`, `PppoeSessionDisconnectPayload`, `PppoeBatchResult`).

---

## 4. اسم الـ Migration والتحقق من التطبيق المحلي الحصري

### 4.1 تفاصيل الـ Migration
- **المجلد:** [`apps/api/prisma/migrations/20261011190000_add_pppoe_support/`](file:///e:/microTik_project/apps/api/prisma/migrations/20261011190000_add_pppoe_support/migration.sql)
- **ملف الـ SQL:** `migration.sql` يحتوي على تعليمات DDL مع حماية `IF NOT EXISTS` وكتل اعتراض التكرار `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN null; END $$;` لضمان الذرية والاستقرار.

### 4.2 التحقق القاطع من العزل المحلي
- **رابط الاتصال المستخدم:** `postgresql://postgres@127.0.0.1:5432/sudafi_test`
- **مخرجات التنفيذ الحقيقية:**
  ```text
  Datasource "db": PostgreSQL database "sudafi_test", schema "public" at "127.0.0.1:5432"
  5 migrations found in prisma/migrations
  Applying migration `20261011190000_add_pppoe_support`
  All migrations have been successfully applied.
  ```
- **إقرار أمني قاطع:**
  * لم يتم تشغيل أي أمر على خادم Supabase السحابي.
  * لم يتم الاتصال بقاعدة بيانات الإنتاج نهائياً.
  * تم عزل التجربة بالكامل على المنفذ المحلي `127.0.0.1:5432` داخل قاعدة `sudafi_test`.

---

## 5. نتائج الاختبارات الفعلية والتحقق البرمجي

تم تشغيل سلسلة اختبارات وتحقق شاملة تغطي كافة الطبقات:

| # | نوع الاختبار / الفحص | الأداة والمسار | النتيجة | التفاصيل الحقيقية |
| :---: | :--- | :--- | :---: | :--- |
| **1** | **التحقق من صحة مخطط Prisma** | `prisma validate` | **PASS** | `The schema at apps\api\prisma\schema.prisma is valid 🚀` |
| **2** | **توليد عميل Prisma Client** | `prisma generate` | **PASS** | توليد كافة أنواع ونماذج `PppoeProfile` و `PppoeAccount` بنجاح (1.06s). |
| **3** | **بناء حزمة الأنواع المشتركة** | `tsc -p tsconfig.json` | **PASS** | بناء `@mikrotik-saas/shared-types` دون أي أخطاء أنواع. |
| **4** | **بناء وكيل الويندوز** | `tsc -p tsconfig.json` | **PASS** | بناء `@mikrotik-saas/agent` وتوافقه مع أنواع الأوامر الجديدة. |
| **5** | **بناء خادم الـ API** | `nest build` | **PASS** | بناء `@mikrotik-saas/api` وتوافقه التام مع عميل Prisma المحدث. |
| **6** | **فحص التكامل وقواعد البيانات (12 فحصاً)** | نص اختبار حي ضد `sudafi_test` | **PASS (12/12)** | - إنشاء مستأجر وراوتر وبروفايل وحساب وجلسة.<br>- اختبار التشفير وفك التشفير Reversible AES-256-GCM.<br>- اختبار منع تكرار البروفايل والحساب (P2002).<br>- اختبار قيد الحظر `ON DELETE RESTRICT` على البروفايل.<br>- اختبار تصفير المعرّف `ON DELETE SET NULL` على الجلسة. |
| **7** | **اختبارات وحدة الوكيل (Unit Tests)** | `jest` في `apps/agent` | **PASS (37/37)** | ثبات 37 اختباراً بنسبة 100% دون أي تأثر أو انكسار. |
| **8** | **اختبارات وحدة الـ Backend** | `jest` في `apps/api` | **PASS (164/164)** | ثبات 164 اختباراً عبر 20 جناح اختبار بنسبة 100% مع الحفاظ التام على وظائف Hotspot والكروت. |

**المحصلة الإجمالية:** **201 من 201 اختبار نجحت بنسبة 100% (0 فشل).**

---

## 6. المخاطر والقرارات المتبقية للمهمة 4.2 (Agent Engine)

1. **التعامل مع الحسابات القائمة على راوتر MikroTik (Reconciliation Logic):**
   - في المهمة 4.2، عند تطبيق أمر `pppoe.secret.add`، يجب على الوكيل فحص الحساب أولاً عبر `/ppp/secret/print ?name=...`:
     * إذا وُجد بنفس البروفايل وكلمة المرور، يُحتسب كـ `alreadyExistingCount = 1` بأمان (Lost ACK protection).
     * إذا وُجد ببروفايل أو مواصفات مختلفة، يُرفض الأمر كـ `Conflict` لحماية خط العميل من التغيير العرضي.
2. **فصل الجلسات اللحظي عند التعطيل (Active Disconnect Sync):**
   - عند تعطيل الحساب (`pppoe.secret.disable`)، يجب على الوكيل تنفيذ أمرين متتاليين في الراوتر:
     1. `/ppp/secret/set =.id=... =disabled=yes`
     2. البحث في `/ppp/active` وفصل الجلسة فوراً `/ppp/active/remove =.id=...` لإسقاط الخط دون انتظار إعادة تشغيل الراوتر المنزلي.
3. **تطوير محاكي MockRouterWorker:**
   - تجهيز `MockRouterWorker` في المهمة 4.2 ليحاكي جداول `/ppp/profile` و `/ppp/secret` و `/ppp/active` بدقة لضمان استمرار تشغيل الاختبارات دون اشتراط عتاد فيزيائي.

---

## 7. إقرار والتزام صارم بحدود النطاق

> [!IMPORTANT]
> **إقرار أمني وتشغيلي قطعي:**
> 1. **الإنتاج و Supabase:** لم يتم تشغيل أي استعلام أو migration أو تعديل على قاعدة بيانات الإنتاج أو خوادم Supabase نهائياً.
> 2. **منصة Render:** لم يتم نشر أي كود، ولم يتم تعديل أي متغيرات بيئية أو إعدادات على Render.
> 3. **الراوتر الحقيقي:** لم يتم إرسال أي أمر إلى راوتر عميل أو راوتر حقيقي؛ جميع الاختبارات جرت محلياً بالكامل.
> 4. **نطاق المهمة:** تم التوقف التام عند نهاية المهمة 4.1، ولم يبدأ أي عمل برمجيات في المهمة 4.2 أو واجهات المستخدم بانتظار مراجعتكم واعتمادكم.
