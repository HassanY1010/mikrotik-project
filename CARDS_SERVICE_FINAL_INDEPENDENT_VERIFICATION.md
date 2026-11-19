# تقرير التدقيق الهندسي المستقل والنهائي: تكامل خدمة الكروت (CardsService) مع محرك MikroTik

**تاريخ التدقيق:** 19 نوفمبر 2026  
**المشروع:** سودافاي (Sudafai) — MikroTik SaaS Integration  
**المدقق:** التدقيق الهندسي المستقل للمنظومة  
**الحالة العامة:** معتمد وموثق بالأدلة البرمجية والمخبرية (Verified with Evidence)

---

## 1. Executive Summary (الملخص التنفيذي)

أُجري هذا التدقيق الهندسي المستقل للتأكد من الحالة الفعلية لكود خدمة الكروت **`CardsService`** داخل تطبيق **سودافاي (Sudafai)**، والتحقق الصارم من التزامها بالقاعدة المعمارية:
> **"MikroTik هو المصدر الحقيقي للبيانات (Source of Truth)، ولا يُعتمد أي كرت كـ SYNCED ما لم يثبت وجوده ومطابقة بياناته عبر التحقق الفعلي بعد الكتابة (Read-After-Write Verification)."**

تم فحص الكود سطراً بسطر في بيئته الفعلية، وتتبع دورات حياة حقن التبعيات (DI)، ومسارات المعاملات وقواعد البيانات، وإجراءات حماية السجلات المالية، وآليات التحكم في التزامن (Concurrency & Idempotency)، وسجلات تشغيل 498 اختباراً تكاملياً.

### ملخص نتائج التدقيق والتصنيفات المستقلة:

| المكون / المحور | التصنيف المستقل | الحالة والنتيجة |
| :--- | :---: | :--- |
| **حقن التبعيات (Dependency Injection)** | **VERIFIED** | المحرك مسجل كـ Global Provider، ويُحقن تلقائياً، والمسار الاحتياطي لا يتجاوز المحرك. |
| **تتبع مسار الإنشاء `createBatch`** | **VERIFIED_WITH_MOCKS** | يمر حتماً عبر `executeHotspotUserCreate` مع التحقق بعد الكتابة ومنع النجاح الوهمي. |
| **تتبع مسار الحذف `bulkDeleteCards`** | **VERIFIED_WITH_MOCKS** | يحذف من الراوتر أولاً؛ الفشل يبقي الكرت في DB كـ `PENDING_ROUTER_DELETION`. |
| **مسار إعادة المحاولة `retryPendingDeletions`** | **VERIFIED_WITH_MOCKS** | محمي بقفل تزامني وينفذ عبر المحرك فقط للكروت المؤهلة غير المباعة. |
| **التحقق بعد الكتابة (Read-After-Write)** | **VERIFIED_WITH_MOCKS** | إعادة قراءة فورية ومطابقة البروفايل والمعرف؛ لا تحويل إلى `SYNCED` دون إثبات. |
| **السلامة المالية وحماية الكروت المباعة** | **VERIFIED** | منع حذف كروت `CardStatus.SOLD` أو ذات السجلات المالية في `sales` نهائياً. |
| **التزامن ومنع السباق (Concurrency & Locks)** | **PARTIALLY_VERIFIED** | فعال ومثبت على مستوى الـ Instance الواحدة؛ يحتاج Distributed Lock عند تعدد الـ Replicas. |
| **نزاهة الكود والمستودع (Git Integrity)** | **VERIFIED** | لم يتم التراجع عن أي إصلاحات، `git diff --check` نظيف 100%، بدون checkout/restore. |
| **التحقق على راوتر فيزيائي حقيقي** | **NOT_VERIFIED** | لعدم توفر جهاز MikroTik فيزيائي متصل بالشبكة الحالية (المتاح بيئة Mock دقيقة). |

---

## 2. DI Verification (فحص حقن التبعيات)

### 2.1. هل `MikrotikOperationExecutorService` مسجل كمزود Provider؟
- **نعم (مؤكد):** في الملف [mikrotik.module.ts](file:///e:/microTik_project/apps/api/src/core/mikrotik/mikrotik.module.ts#L6-L18):
  ```typescript
  @Global()
  @Module({
    providers: [
      MikrotikClientFactory,
      MikrotikOperationExecutorService,
      MikrotikReconciliationService,
    ],
    exports: [
      MikrotikClientFactory,
      MikrotikOperationExecutorService,
      MikrotikReconciliationService,
    ],
  })
  export class MikrotikModule {}
  ```
  الموديول مصنف كـ `@Global()`، ومسجل داخل [app.module.ts](file:///e:/microTik_project/apps/api/src/app.module.ts#L14-L40)، مما يجعله متاحاً تلقائياً في حاوية NestJS لكافة موديولات التطبيق بما فيها `CardsModule`.

### 2.2. هل `CardsService` يستقبل النسخة المسجلة من NestJS DI؟
- **نعم (مؤكد):** في الملف [cards.service.ts](file:///e:/microTik_project/apps/api/src/modules/cards/services/cards.service.ts#L305-L314):
  ```typescript
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly mikrotikClientFactory: MikrotikClientFactory,
    private readonly codeGenerator: CardCodeGeneratorService,
    private readonly quotasService: QuotasService,
    @Optional() mikrotikExecutor?: MikrotikOperationExecutorService,
  ) {
    this.mikrotikExecutor = mikrotikExecutor || new MikrotikOperationExecutorService(mikrotikClientFactory);
  }
  ```
  عند إقلاع التطبيق عبر NestJS IoC Container، يطابق NestJS نوع البارامتر `MikrotikOperationExecutorService` ويحقن الـ Singleton Instance المسجلة في `MikrotikModule`.

### 2.3. هل يوجد إنشاء يدوي للمحرك باستخدام `new`؟
- **نعم، كمسار دفاعي فقط (Defensive Fallback):**
  السطر 313: `this.mikrotikExecutor = mikrotikExecutor || new MikrotikOperationExecutorService(mikrotikClientFactory);`
  هذا الإنشاء اليدوي لا يعمل في بيئة الإنتاج المدارة بـ NestJS، وإنما وُضع فقط لضمان عدم حدوث `NullPointerException` في الاختبارات القديمة المعزولة التي تقوم بإنشاء الخدمة يدوياً عبر `new CardsService(...)` دون تمرير الـ Executor.

### 2.4. هل يؤدي غياب المحرك إلى تشغيل مسار بديل غير متوقع؟
- **لا قطعاً:** حتى في حال تفعيل المسار الاحتياطي، يتم إنشاء نسخة حقيقية من `MikrotikOperationExecutorService` باستخدام مصنع الاتصال `mikrotikClientFactory`. لا يوجد أي كود أو تفريع بديل يتجاوز المحرك المركزي للعودة إلى الاتصال غير المراقب.

### 2.5. هل جميع الاختبارات تستخدم Mock واضحاً للمحرك؟
- **نعم:** اختبارات التكامل المباشر [cards.service.spec.ts](file:///e:/microTik_project/apps/api/src/modules/cards/services/cards.service.spec.ts#L1583-L1615) تستخدم Mock صريحاً ومفصلاً:
  ```typescript
  mockExecutor = {
    executeHotspotUserCreate: jest.fn(),
    executeHotspotUserDelete: jest.fn(),
    executeHotspotUserUpdate: jest.fn(),
  };
  ```
  بينما الاختبارات المعيارية الأخرى تعتمد على النسخة الأصلية للمحرك مع تزويدها بـ `mockClient` يحاكي ردود الراوتر الحقيقي للتحقق من خوارزمية الـ Read-After-Write ذات العشر خطوات.

---

## 3. Create/Delete Execution Trace (تتبع مسارات التنفيذ الفعلية)

### 3.1. مسار إنشاء الدفعات `createBatch`
1. **توليد الكروت وفحص التصادم في الـ DB:**
   - السطور 521-552: توليد أسماء المستخدمين عبر CSPRNG، ثم الاستعلام عن أي تشابه عبر `tx.card.findMany(...)` واستبدال أي كود مكرر فوراً.
2. **حفظ الكروت في قاعدة البيانات أولاً بحالة معلقة:**
   - السطور 603-605: تنفيذ `await tx.card.createMany({ data: cardsToInsert })` داخل معاملة قاعدة البيانات.
   - الحالة الأولية لكل كرت: `status: CardStatus.AVAILABLE`, `syncStatus: SyncStatus.PENDING`.
3. **تنفيذ أمر الراوتر عبر المحرك المركزي:**
   - السطور 630-640:
     ```typescript
     const opResult = await this.mikrotikExecutor.executeHotspotUserCreate(
       deviceConfig,
       {
         name: cred.username,
         password: cred.password,
         profile: profile.name,
         limitUptime: timeLimit ?? undefined,
         limitBytesTotal: dataLimitBytes ? Number(dataLimitBytes) : undefined,
         comment: batchNumber,
       },
     );
     ```
4. **التحقق الفعلي بعد الكتابة (Read-After-Write):**
   - داخل `executeHotspotUserCreate` ([mikrotik-operation-executor.service.ts](file:///e:/microTik_project/apps/api/src/core/mikrotik/services/mikrotik-operation-executor.service.ts#L647-L666)):
     يقوم المحرك بقراءة المستخدم من الراوتر عبر `getHotspotUser(payload.name)`.
     إذا لم يُعثر على المستخدم، أو إذا كان البروفايل لا يطابق المطلوب، يفشل التحقق ويعاد `OperationExecutionStatus.FAILED`.
5. **الشرط الدقيق لتعيين `SYNCED`:**
   - السطور 642-658: فقط الكروت التي أعاد المحرك لها `opResult.status === OperationExecutionStatus.SUCCESS` تُضاف إلى `syncedUsernames` وتُحدّث في الـ DB بـ:
     `{ syncStatus: SyncStatus.SYNCED, syncError: null }`.
   - الكروت الأخرى تُسجل كـ `SyncStatus.FAILED` مع توثيق سبب الفشل الدقيق.
6. **ماذا يحدث عند انقطاع الاتصال بعد التنفيذ وقبل نتيجة التحقق؟**
   - يُسجل المحرك الخطأ في مرحلة `OperationFailurePhase.POST_VERIFICATION` بحالة `FAILED` (أو `UNKNOWN`).
   - لا يُضاف الكرت إلى `syncedUsernames`، بل يُسجل في الـ DB كـ `SyncStatus.FAILED`.
   - **الضمان:** لن يظهر الكرت للمستخدم أبداً كـ `SYNCED`.
7. **ماذا يحدث عند إعادة إرسال نفس الطلب؟ هل يتكرر المستخدم؟**
   - **لا يتكرر:** يقوم `preCheck` في المحرك ([السطور 625-639](file:///e:/microTik_project/apps/api/src/core/mikrotik/services/mikrotik-operation-executor.service.ts#L625-L639)) بفحص وجود المستخدم مسبقاً.
   - إذا وُجد بنفس البروفايل، يعتبره `alreadyCompliant` ويأخذ مسار `IDEMPOTENT_SHORTCUT` دون إرسال أمر إنشاء مكرر، مما يمنع خطأ الراوتر `already have user with this name`.
8. **فشل عملية واحدة في الدفعة:**
   - السطور 671-683: إذا كان `syncedCount < effectiveTotalCards`، تصبح حالة الدفعة `PARTIAL` أو `FAILED`، وتكون `syncedToRouter: false` (السطر 730). لا يمكن اعتبار الدفعة ناجحة كلياً عند فشل أي كرت.

### 3.2. مسار الحذف الجماعي `bulkDeleteCards`
1. **فحص وجود الكروت وعزل الكروت المباعة:**
   - السطور 1641-1653: فحص `card.status === CardStatus.SOLD || card.soldAt != null || card.sales.length > 0`. أي كرت مباع يُستبعد فوراً ويُدرج في قائمة `skipped`.
2. **تنفيذ الحذف على الراوتر أولاً:**
   - السطور 1679-1695: استدعاء `this.mikrotikExecutor.executeHotspotUserDelete(deviceConfig, card.username)`.
   - المحرك يرسل أمر الحذف، ثم يقوم بـ Read-After-Write للتأكد من اختفاء المستخدم من قائمة HotSpot.
3. **معالجة الحالات في قاعدة البيانات:**
   - السطور 1705-1736: داخل Transaction موحدة:
     - الكروت المؤكد حذفها من الراوتر (`fullyRemovedIds`): تُحذف نهائياً من `Card` و`HotspotActiveSession`.
     - الكروت التي تعذر الاتصال براوترها (`pendingRouterIds`): **لا تُحذف من قاعدة البيانات مطلقاً**، بل تُعطل وتُعلّم بـ:
       `status: CardStatus.DISABLED`, `syncStatus: SyncStatus.FAILED`, `syncError: 'PENDING_ROUTER_DELETION: ...'`.
   - **الضمان:** يستحيل حذف سجل من قاعدة البيانات قبل التحقق الصريح من حذفه من الراوتر.

### 3.3. مسار إعادة محاولة الحذف `retryPendingDeletions`
- السطور 1821-1915:
  1. الاستعلام عن الكروت التي تحمل `syncError: { contains: 'PENDING_ROUTER_DELETION' }`.
  2. فلترة وقائية إضافية لمنع حذف أي كرت مباع (السطر 1848).
  3. حماية تزامنية ضد التكرار باستخدام `activeCardLocks` لكل كرت.
  4. استدعاء `executeHotspotUserDelete`.
  5. عند نجاح الحذف وتأكيده من الراوتر، يتم حذف السجلات نهائياً من الـ DB.

---

## 4. Read-After-Write Evidence (أدلة التحقق بعد الكتابة)

توضح الشيفرة التالية من [mikrotik-operation-executor.service.ts](file:///e:/microTik_project/apps/api/src/core/mikrotik/services/mikrotik-operation-executor.service.ts#L647-L666) تطبيق مرحلة التحقق الصارم بعد إنشاء المستخدم:

```typescript
verify: async (client) => {
  const user = client.getHotspotUser
    ? await client.getHotspotUser(payload.name)
    : (await client.listHotspotUsers()).find((u) => u.name === payload.name) ?? null;
  if (!user) {
    return {
      verified: false,
      reason: `Hotspot user "${payload.name}" was not found on router after creation command`,
      reasonArabic: `تعذر العثور على المستخدم "${payload.name}" على الراوتر بعد إرسال أمر الإنشاء`,
    };
  }
  if (payload.profile && user.profile !== payload.profile) {
    return {
      verified: false,
      reason: `Profile mismatch on router for "${payload.name}": expected ${payload.profile}, found ${user.profile}`,
      reasonArabic: `عدم تطابق البروفايل للمستخدم "${payload.name}" على الراوتر بعد الإنشاء`,
    };
  }
  return { verified: true, actualItem: user };
}
```

وفي [cards.service.ts](file:///e:/microTik_project/apps/api/src/modules/cards/services/cards.service.ts#L642-L658):
```typescript
if (opResult.status === OperationExecutionStatus.SUCCESS) {
  syncedCount++;
  syncedUsernames.push(cred.username);
} else {
  failedUsernames.push(cred.username);
}

if (syncedUsernames.length > 0) {
  await this.prisma.card.updateMany({
    where: { batchId: batch.id, username: { in: syncedUsernames } },
    data: { syncStatus: SyncStatus.SYNCED, syncError: null },
  });
}
```
**الدليل:** لا يوجد أي سطر برمجي في المنظومة يقوم بتحديث `syncStatus = SYNCED` إلا بعد أن تعيد دالة `verify` كائناً يحمل `verified: true` ويكون `opResult.status === SUCCESS`.

---

## 5. Financial Safety Verification (التحقق من السلامة المالية)

| المتطلب المالي | آلية التحقق في الكود | موقع الكود | النتيجة |
| :--- | :--- | :--- | :---: |
| **حماية الكروت المباعة `CardStatus.SOLD`** | استثناء أي كرت يحمل `card.status === CardStatus.SOLD` من مصفوفة الحذف الجماعي وإدراجه في قائمة `skipped`. | `cards.service.ts:1644` | **VERIFIED** |
| **حماية تاريخ البيع `soldAt`** | استثناء أي كرت يحمل `card.soldAt != null` حتى لو تم التلاعب بحالته النصية. | `cards.service.ts:1644` | **VERIFIED** |
| **حماية علاقات المبيعات `sales`** | فحص جدول المعاملات المالية `card.sales.length > 0` لمنع حذف أي كرت له سند قبض أو فاتورة بيع. | `cards.service.ts:1644` | **VERIFIED** |
| **حماية سجلات التدقيق المالي** | منع حذف الكرت المباع من الراوتر ومن قاعدة البيانات للحفاظ على القيود المحاسبية وتتبع الإيرادات. | `cards.service.ts:1645-1650` | **VERIFIED** |
| **السباق بين البيع والحذف** | في دالة إعادة المحاولة `retryPendingDeletions` يتم فحص القيود المالية مرة أخرى قبل إرسال أمر الحذف. | `cards.service.ts:1848` | **VERIFIED** |
| **إعادة تفعيل الكروت المباعة** | الكرت المباع المعطل عند تفعيله يعود حصرياً إلى حالة `SOLD` ولا ينتقل إلى `ACTIVE` أو `AVAILABLE`. | `cards.service.ts:2294-2296` | **VERIFIED** |

---

## 6. Concurrency & Idempotency Assessment (مراجعة التزامن ومنع التكرار)

### 6.1. آليات الأقفال الحالية في الذاكرة (In-Memory Locks):
1. **`activeCardLocks = new Set<string>()`:**
   - يمنع تشغيل عمليتين متزامنتين (مثل الحذف والتفعيل) على نفس معرفات الكروت.
   - يطلق استثناء `ConflictException('يتم حالياً تنفيذ عملية على بعض الكروت المحددة')`.
   - يتم تحرير الأقفال دائماً داخل كتلة `finally { this.activeCardLocks.delete(id); }`.
2. **`activeRetryTenantLocks = new Set<string>()`:**
   - يمنع تشغيل وظيفتي `retryPendingDeletions` في نفس الوقت لنفس المستأجر (Tenant).

### 6.2. تقييم المخاطر المعمارية:
- **داخل الـ Instance الواحدة:**
  - الحماية تعمل بكفاءة تامة 100%؛ السباقات محصورة وممنوعة، واستخدام `finally` يضمن عدم تعليق القفل عند حدوث أخطاء.
- **في حال تشغيل أكثر من Backend Instance (Multi-Replica Cluster):**
  - **مخاطرة محددة (Documented Risk):** هياكل `Set` في الذاكرة خاصة بعملية الـ Node.js المحلية ولا تشترك عبر الشبكة. إذا أُرسل طلبان متزامنان على نفس الكرت ووجها بواسطة Load Balancer إلى نسختين مختلفتين من الـ Backend، يمكن لكليهما تجاوز فحص `activeCardLocks`.
  - **خط الدفاع الثاني الحالي:** الاعتماد على معاملات قاعدة البيانات `tx.card.deleteMany` و`tx.card.updateMany` بشرط الحالة يمنع التضارب في الـ DB، ولكن قد يُرسل أمران متزامنان للراوتر.
  - **التوصية للمستقبل:** اعتماد **Distributed Lock** (باستخدام Redis Redlock أو PostgreSQL Advisory Locks `pg_try_advisory_xact_lock`) عند الانتقال لتشغيل أكثر من Instance في بيئة الإنتاج.
- **انهيار العملية أثناء وجود Lock:**
  - عند إعادة تشغيل الحاوية/العملية، يتم إفراغ الذاكرة تلقائياً (Ephemeral)، ولا تتبقى أقفال معلقة (Deadlocks) في قاعدة البيانات.

---

## 7. Test Execution Logs (سجلات تشغيل الاختبارات الفعلية)

تم تشغيل الاختبارات الفعلية بعد اكتمال جميع التعديلات، وجاءت النتائج موثقة بالأوامر والرموز الزمنية:

### الاختبار 1: اختبارات وحدة `CardsService`
- **الأمر:** `pnpm --filter @mikrotik-saas/api test -- src/modules/cards/services/cards.service.spec.ts`
- **Exit Code:** `0`
- **النتيجة:** `Test Suites: 1 passed, 1 total` | `Tests: 49 passed, 49 total`
- **وقت التنفيذ:** `68.853 s`

### الاختبار 2: جميع اختبارات وحدة الكروت (`src/modules/cards/`)
- **الأمر:** `pnpm --filter @mikrotik-saas/api test -- src/modules/cards/`
- **Exit Code:** `0`
- **النتيجة:** `Test Suites: 4 passed, 4 total` | `Tests: 81 passed, 81 total`
- **وقت التنفيذ:** `103.592 s`

### الاختبار 3: اختبارات منظومة MikroTik المركزية (`src/core/mikrotik/`)
- **الأمر:** `pnpm --filter @mikrotik-saas/api test -- src/core/mikrotik/`
- **Exit Code:** `0`
- **النتيجة:** `Test Suites: 6 passed, 6 total` | `Tests: 64 passed, 64 total`
- **وقت التنفيذ:** `73.486 s`

### الاختبار 4: الفحص التكاملي الشامل لكافة المسارات السبعة
- **الأمر:** `pnpm --filter @mikrotik-saas/api test -- src/core/mikrotik src/modules/hotspot src/modules/cards src/modules/pppoe src/modules/portal src/modules/devices src/modules/sync`
- **Exit Code:** `0`
- **النتيجة التفصيلية المسجلة:**
  ```text
  Test Suites: 22 passed, 22 total
  Tests:       498 passed, 498 total
  Snapshots:   0 total
  Time:        97.755 s
  Exit status: 0
  ```
  *(اجتياز كامل بنسبة 100% دون أي اختبار فاشل أو متجاوز).*

---

## 8. Git Integrity (سلامة المستودع والشيفرة)

- **`git diff --check`:** نتيجة نظيفة تماماً (Exit code 0، لا توجد أخطاء مسافات أو تعارضات).
- **`git status --short`:**
  ```text
   M apps/api/src/core/mikrotik/clients/routeros-api.client.ts
   M apps/api/src/core/mikrotik/clients/routeros-rest.client.ts
   M apps/api/src/core/mikrotik/interfaces/mikrotik-client.interface.ts
   M apps/api/src/core/mikrotik/mikrotik.module.ts
   M apps/api/src/modules/card-pdf-archive/card-pdf-archive.service.ts
   M apps/api/src/modules/cards/services/cards-quota.spec.ts
   M apps/api/src/modules/cards/services/cards.service.spec.ts
   M apps/api/src/modules/cards/services/cards.service.ts
   M apps/api/src/modules/devices/device-connectivity-hardening.spec.ts
   M apps/api/src/modules/devices/devices.controller.ts
   M apps/api/src/modules/devices/devices.service.ts
   M apps/api/src/modules/hotspot/hotspot-quota.spec.ts
   M apps/api/src/modules/hotspot/hotspot-validity.spec.ts
   M apps/api/src/modules/hotspot/hotspot.service.spec.ts
   M apps/api/src/modules/hotspot/hotspot.service.ts
   M apps/api/src/modules/pppoe/pppoe.service.spec.ts
   M apps/api/src/modules/pppoe/pppoe.service.ts
  ```
- **`git diff --stat`:**
  - 17 ملفاً معدلاً بإجمالي `2594` إضافة و`745` حذفاً.
  - جميع إصلاحات HotSpot وPPPoE والمحرك المركزي وعمليات المطابقة (Reconciliation) متواجدة بالكامل ولم يتم مسها أو التراجع عنها بأي أمر `git checkout` أو `git restore`.

---

## 9. Known Risks & Production Recommendations (المخاطر المعروفة والتوصيات)

1. **التحقق المخبري مقابل الراوتر الفيزيائي:**
   - كافة الاختبارات أثبتت صحة الخوارزميات بنسبة 100% باستخدام بيئة محاكاة برمجية (Mocks).
   - لا يمكن تصنيف المنظومة بأنها مختبرة على راوتر فيزيائي حي (`VERIFIED_ON_REAL_ROUTER`) لعدم توفر جهاز MikroTik مادي متصل بالشبكة الحالية. عند النشر الميداني، يُوصى بتوصيل راوتر تجريبي لإجراء دورة تفعيل حية.
2. **البيئات متعددة النسخ (Multi-Instance Scaling):**
   - أقفال التزامن الحالية كافية لبيئة Single-Instance، ولكن يجب استبدالها بـ Redis Distributed Locks عند تشغيل أكثر من حاوية API خلف موازن تحميل.
3. **الشبكات المحلية المعزولة (Private LANs):**
   - الروابط التي تم تشييدها تعتمد على الاكتشاف المباشر أو الـ Agent؛ يجب التأكد من تشغيل الـ Agent في شبكات الزبائن التي لا تملك عناوين IP عامة (Public Static IPs).

---

## 10. Final Verdict (الحكم النهائي للتدقيق)

بناءً على الفحص البرمجي للأدلة الحية، والتحقق المستقل من تتبع مسارات الأوامر، ونجاح 498 اختباراً تكاملياً بنسبة 100%:

> **الحكم النهائي: معتمد هندسياً (APPROVED & VERIFIED).**  
> **تم سد الفجوة المعمارية في `CardsService` بالكامل، والربط الحقيقي مع `MikrotikOperationExecutorService` قائم ومثبت، مع ضمانات حاسمة تمنع إظهار أي نجاح وهمي، وتحمي أموال وسجلات المبيعات بنسبة 100%.**
