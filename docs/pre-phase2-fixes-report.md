# تقرير مرحلة التصحيح والتثبيت الفني (Pre-Phase 2 Fixes Report)

**تاريخ التنفيذ:** 10 أكتوبر 2026  
**المشروع:** `E:\microTik_project`  
**الحالة:** مكتمل ومُختبر ومُوثّق بنجاح (100% Passed)

---

### 1. ملخص التعديلات المنفذة (Executive Summary)

استجابةً لنتائج المراجعة التدقيقية وتوجيهات الإعداد للمرحلة الثانية، تم تنفيذ مرحلة تصحيح وتثبيت فني دقيقة ومحكمة دون المساس ببيانات الإنتاج أو تطبيق أي Migrations على قاعدة البيانات الحية.

شملت التعديلات محورين رئيسيين:
1. **تصحيح وتثبيت معنى حد الكروت (Card Limit Resolution Policy):**
   - اعتماد سياسة صريحة وموحدة عبر الـ Backend و Flutter و React Admin:
     - القيمة `null` أو `undefined` أو `isUnlimited: true` تعني **باقة غير محدودة (Unlimited)**.
     - القيمة `0` (أو أي قيمة سالبة) تعني **صفر كروت (ممنوع توليد الكروت نهائيًا)** ورفض أي طلب توليد استباقيًا بـ `CARD_QUOTA_EXCEEDED`.
     - القيمة الموجبة تعني **سقف الحصة المسموح به**.
   - إضافة فحص استباقي لحالات تعليق اشتراك أو منظمة المستأجر (`SUBSCRIPTION_SUSPENDED` و `TENANT_SUSPENDED`).
2. **تثبيت دلالة حالات دفعات الكروت ومزامنة MikroTik:**
   - ضبط الدلالة الدقيقة لحالة الدفعة `batch.status`: تعني اكتمال إنشاء وتخزين الدفعة محليًا في قاعدة البيانات (`COMPLETED`)، أو فشل المزامنة المباشرة مع راوتر متصل (`FAILED`).
   - فصل حالة المزامنة مع الراوتر `routerSyncStatus` كحقل مستقل ومؤكد:
     - `SYNCED`: مزامنة 100% من الكروت بنجاح.
     - `PARTIAL`: مزامنة جزء وفشل جزء، مع وسم `syncedToRouter: false`.
     - `PENDING_OFFLINE`: الراوتر غير متصل، الكروت محفوظة ومتاحة للطباعة، وضبط `failedCount: 0` و `syncedToRouter: false`.
     - `FAILED`: فشل الاتصال بالراوتر أو رفض جميع الكروت، مع `syncedToRouter: false`.
   - إثراء استجابة إعادة المحاولة `POST /cards/batches/:id/sync` لترجع `routerSyncStatus` و `syncedToRouter` بدقة.

---

### 2. تفاصيل التعديلات البرمجية ومسارات الملفات

#### أ. خدمة الحصص ([quotas.service.ts](file:///E:/microTik_project/apps/api/src/modules/cards/services/quotas.service.ts))
1. **دالة `resolvePlanLimit`:**
   ```ts
   resolvePlanLimit(plan: { features: any }): { isUnlimited: boolean; cardLimit: number | null } {
     const features = (plan.features as Record<string, any>) || {};

     if (features.isUnlimited === true) {
       return { isUnlimited: true, cardLimit: null };
     }

     const rawLimit = features.cardGenerationLimit ?? features.cardLimit ?? features.maxCards;

     if (rawLimit === undefined || rawLimit === null) {
       return { isUnlimited: true, cardLimit: null };
     }

     const parsed = Number(rawLimit);

     // 0 أو قيمة سالبة تعني سقف 0 كرت (ممنوع التوليد)
     if (isNaN(parsed) || parsed <= 0) {
       return { isUnlimited: false, cardLimit: 0 };
     }

     return { isUnlimited: false, cardLimit: Math.floor(parsed) };
   }
   ```
2. **دالة `resolveTenantSubscription`:**
   - إضافة فحص حالة المستأجر: `if (tenant?.status === 'SUSPENDED') throw TENANT_SUSPENDED`.
   - إضافة فحص الاشتراكات المعلقة: `if (anySub?.status === 'SUSPENDED') throw SUBSCRIPTION_SUSPENDED`.
3. **دالة `checkAndLockQuota`:**
   - تخصيص رسالة الرفض عند السقف الصفري: `'هذه الباقة لا تتضمن حصة لتوليد الكروت (الحد المسموح: 0 كرت)'`.

#### ب. خدمة المستأجرين ([tenants.service.ts](file:///E:/microTik_project/apps/api/src/modules/tenants/tenants.service.ts))
- مطابقة استخراج حد الباقة في `getCurrentTenant` بنفس السياسة الصريحة:
  - `isUnlimited = isExplicitUnlimited || rawLimit === undefined || rawLimit === null`
  - `cardLimit = isUnlimited ? null : (isNaN(parsed) || parsed <= 0 ? 0 : Math.floor(parsed))`

#### ج. خدمة الكروت ومزامنة الراوتر ([cards.service.ts](file:///E:/microTik_project/apps/api/src/modules/cards/services/cards.service.ts))
1. **في `createBatch` / `generateCardsBatch`:**
   - ضبط `failedCount`: في وضع عدم الاتصال (`PENDING_OFFLINE`) يكون `failedCount: 0` لأن الكروت لم تفشل، بل تم تأجيل مزامنتها.
   - حماية وسم المزامنة الكاملة: `isFullySynced = syncedCount === effectiveTotalCards && routerSyncStatus === 'SYNCED'`.
   - يمنع قطعياً إرجاع `syncedToRouter: true` إلا إذا كانت حالة المزامنة `SYNCED` بنسبة 100%.
2. **في `syncBatchToRouter`:**
   - حساب `finalRouterSyncStatus`: `SYNCED` عند وصول غير المتزامن إلى 0، أو `PARTIAL`، أو `FAILED`.
   - إرجاع `routerSyncStatus` و `syncedToRouter: remainingUnsynced === 0` في الـ Payload ليتطابق مع شاشات الإدارة والموبايل.

#### د. نموذج Flutter لتطبيق الهاتف ([models.dart](file:///E:/microTik_project/apps/mobile/lib/core/models/models.dart))
- في `TenantQuotaModel.fromJson`:
  - `final unlim = json['isUnlimited'] == true || (json['isUnlimited'] == null && rawLimit == null);`
  - إذا كان الحد `0`، يصبح `isUnlimited: false` و `cardLimit: 0` و `remainingCards: 0` ويعرض التطبيق "الحصة مستنفدة / غير مصرح بالتوليد" بدلاً من تحويلها إلى غير محدودة بالخطأ.

---

### 3. الاختبارات الآلية والتحقق البرمجي

#### أ. اختبارات Jest للـ Backend (`cards-quota.spec.ts`)
تم تحديث وإضافة حالات فحص مخصصة:
1. `should correctly distinguish between unlimited, zero limit, and positive quota plans`:
   - التحقق من `isUnlimited: true` -> `cardLimit: null`.
   - التحقق من `null` / فارغ -> `cardLimit: null`.
   - التحقق من `0` و `-10` -> `cardLimit: 0` و `isUnlimited: false`.
   - التحقق من `50000` -> `cardLimit: 50000`.
2. `should reject batch creation on plans with ZERO quota (cardGenerationLimit: 0)`:
   - محاولة توليد كرت واحد في باقة حدها 0 تُرفض برمز `CARD_QUOTA_EXCEEDED` ورسالة `(الحد المسموح: 0 كرت)`.
3. `should reject requests when tenant organization or subscription is suspended`:
   - التحقق من رفض العمليات برمز `TENANT_SUSPENDED` أو `SUBSCRIPTION_SUSPENDED`.
4. `should mark batch COMPLETED and routerSyncStatus PENDING_OFFLINE with failedCount 0 when device is offline`:
   - التحقق من وسم الدفعة `COMPLETED` وحالة المزامنة `PENDING_OFFLINE` مع `syncedToRouter: false` و `failedCount: 0`.

**سجل تشغيل حزمة الاختبارات بالكامل:**
```text
> @mikrotik-saas/api@0.1.0 test E:\microTik_project\apps\api
> jest

PASS src/modules/sync/services/sync.service.spec.ts
PASS src/modules/cards/services/cards-quota.spec.ts
PASS src/modules/cards/services/cards.service.spec.ts
PASS src/core/security/hashing.service.spec.ts
PASS src/modules/hotspot/hotspot.service.spec.ts
PASS src/modules/card-templates/card-templates.service.spec.ts
PASS src/modules/sales/services/sales.service.spec.ts
PASS src/modules/analytics/analytics.service.spec.ts
PASS src/modules/devices/devices.service.spec.ts
PASS src/modules/audit-logs/audit-logs.service.spec.ts
PASS src/modules/reports/reports.service.spec.ts
PASS src/modules/auth/auth.service.spec.ts
PASS src/core/security/encryption.service.spec.ts
PASS src/core/mikrotik/protocols/routeros-socket-protocol.spec.ts
PASS src/modules/cards/services/card-code-generator.service.spec.ts

Test Suites: 15 passed, 15 total
Tests:       87 passed, 87 total (نجاح بنسبة 100%)
Time:        29.137 s
```

#### ب. فحص واختبارات تطبيق Flutter Mobile
- **تحليل الكود (`flutter analyze`):**
  ```text
  Analyzing mobile...
  No issues found! (ran in 12.3s)
  ```
- **اختبارات Flutter (`flutter test`):**
  ```text
  00:03 +23: All tests passed!
  ```

#### ج. فحص البناء (Build Verification)
- بناء الـ Backend (`pnpm --filter @mikrotik-saas/api build`): **نجاح تام (Exit Code 0)**.
- بناء لوحة التحكم (`pnpm --filter @mikrotik-saas/admin build`): **نجاح تام (Exit Code 0)**.

---

### 4. ما تم تأكيده وما لا يزال غير مؤكد

| البند | الحالة | البيان |
|---|---|---|
| **سياسة الحد الصفري `0`** | مؤكد ومُختبر | أصبحت الباقات ذات الحد 0 تمنع التوليد بشكل قاطع ولا تتحول أبدًا إلى غير محدودة. |
| **سياسة الخطط غير المحدودة `null`** | مؤكد ومُختبر | الباقات غير المحدودة تعمل بسلاسة دون فرض سقف أقصى. |
| **عزل حالات المزامنة** | مؤكد ومُختبر | تم فصل حالة تخزين الدفعة في DB عن حالة مزامنة الراوتر، ومنع إعلان نجاح كاذب. |
| **تعليق الحسابات والاشتراكات** | مؤكد ومُختبر | رفض استباقي للعمليات عند تعليق المنظمة أو الاشتراك. |
| **الاتصال براوتر فيزيائي حقيقي (Hardware)** | غير مؤكد ميدانيًا | لعدم وجود راوتر حقيقي بالبيئة المحلية؛ سيُعالج نهائيًا عبر أنفاق VPN في المرحلة الثانية. |

---

### 5. الحالة الحالية

تم الانتهاء من مرحلة التصحيح والتثبيت بالكامل. النظام في حالة استقرار تامة وجاهز للانتقال إلى **المرحلة الثانية (بناء لوحة Super Admin، وأنفاق VPN للراوترات عبر Starlink، ونظام PPPoE)** فور اعتمادكم.
