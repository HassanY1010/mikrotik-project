# تقرير تنفيذ المرحلة الأولى: نظام حصص الكروت ومزامنة راوتر MikroTik
## SaaS Quotas Engine & Router Sync Integrity Report

**تاريخ التنفيذ:** 10 أكتوبر 2026  
**المشروع:** `E:\microTik_project`  
**الحالة:** مكتمل ومُختبر بنجاح (100% Passed)

---

### 1. ملخص تنفيذي (Executive Summary)

تم إنجاز المرحلة الأولى المحددة في وثيقة الفجوة المعمارية (`docs/client-vision-gap-analysis.md`) بنجاح كامل، دون كسر العقود الحالية أو إجراء عمليات تدميرية على قاعدة البيانات الحية (Supabase PostgreSQL).

ركزت المرحلة على أصلين جوهريين لتحويل المشروع إلى منصة SaaS موثوقة:
1. **نظام حصص الكروت والاشتراكات (Subscription Quotas System):**
   - استبدال الأرقام الثابتة (`50,000`, `100,000`) بمحرك ديناميكي يستمد الحد من خطة واشتراك المستأجر (`SubscriptionPlan.features.cardGenerationLimit`).
   - حماية استباقية من تضارب الطلبات المتزامنة (Race Conditions) عبر القفل السري للسطر (Row-level Locking) باستخدام `SELECT ... FOR UPDATE` داخل معاملة قاعدة البيانات (`prisma.$transaction`).
   - حساب دقيق لدورة الفوترة مرتكز على يوم بدء الاشتراك الفعلي (`startsAt`) مع سياسة عدم ترحيل الرصيد (Non-rollover).
   - دعم كامل للخطط غير المحدودة (Unlimited Plans) ومعالجة حالات انتهاء الاشتراك أو تعليقه.
2. **سلامة مزامنة الكروت مع راوتر MikroTik (Router Sync & Batch Integrity):**
   - الفصل التام بين إنشاء سجلات الكروت في قاعدة البيانات وبين تأكيد إضافتها على الراوتر.
   - منع وسم الدفعة بأنها `COMPLETED` في حال فشل الاتصال بالراوتر أو فشل إضافة الكروت.
   - تصنيف حالات الدفعة بدقة: `COMPLETED` (مع حالة مزامنة `SYNCED` أو `PARTIAL` أو `PENDING_OFFLINE`) و `FAILED` (في حال فشل المزامنة بالكامل في وضع الاتصال المباشر).
   - آلية إعادة محاولة قابلة للتكرار (Idempotent Retry) عبر `POST /cards/batches/:id/sync` دون تكرار الكروت أو مضاعفة خصم الحصة، والتعرف التلقائي على خطأ `already have user with this name` بوصفه نجاحًا سابقًا.

---

### 2. التغييرات المعمارية في الـ Backend

#### أ. إنشاء خدمة الحصص المستقلة (`QuotasService`)
- **الملف:** `apps/api/src/modules/cards/services/quotas.service.ts`
- **المسؤوليات:**
  1. `getTenantActiveSubscription(tenantId)`: فحص وجود اشتراك نشط للمستأجر، التحقق من عدم انتهائه (`expiresAt`) أو تعليقه (`SUSPENDED`).
  2. `resolvePlanCardLimit(features)`: استخراج حد التوليد من حقول `cardGenerationLimit` أو `cardLimit` أو `maxCards` أو كشف الخطة غير المحدودة إذا كانت القيمة `null` أو `<= 0` أو `isUnlimited: true`.
  3. `calculateBillingCycle(subscription)`: تحديد بداية ونهاية الدورة الشهرية الحالية بالارتكاز على يوم التفعيل الأساسي (`startsAt`).
  4. `countConsumedCardsInCycle(tenantId, cycleStart, cycleEnd)`: احتساب الكروت المكتملة أو قيد الانتظار أو المعلقة؛ واستبعاد الدفعات الملغاة (`CANCELLED`) أو الفاشلة تمامًا (`FAILED`).
  5. `checkAndLockQuota(tx, tenantId, requestedQuantity)`: تنفيذ فحص ذري مع قفل تنافسي يمنع أي تجاوز للحصة عند إرسال طلبات متزامنة في نفس اللحظة.

#### ب. تحديث خدمة الكروت (`CardsService`)
- **الملف:** `apps/api/src/modules/cards/services/cards.service.ts`
- إزالة أي ثغرة عزل مستأجرين أو استخدام لـ `firstTenant.id`.
- تغليف إنشاء الدفعة وإدراج الكروت في المعاملة بعد التأكد من الحصة وتثبيتها.
- تحديث منطق مزامنة الراوتر:
  - عند نجاح جميع الكروت: تصبح حالة المزامنة `SYNCED`.
  - عند نجاح جزء وفشل جزء: تصبح حالة المزامنة `PARTIAL` وحالة الدفعة `COMPLETED` مع تسجيل تفاصيل الكروت المتبقية الفاشلة.
  - عند فشل جميع الكروت مع توفر جهاز: تصبح الدفعة `FAILED` وحالة المزامنة `FAILED`.
  - عند عدم وجود جهاز متصل: تصبح الدفعة `COMPLETED` وحالة المزامنة `PENDING_OFFLINE` لتمكين التوليد المكتبي والطباعة.
- دعم استجابة API الغنية والمحافظة على التوافق الخلفي (Backwards Compatible):
  ```json
  {
    "batch": { ... },
    "cards": [ ... ],
    "syncedToRouter": true,
    "routerSyncStatus": "SYNCED",
    "syncedCount": 50,
    "failedCount": 0,
    "quota": {
      "planName": "PRO",
      "limit": 50000,
      "used": 150,
      "remaining": 49850,
      "isUnlimited": false
    }
  }
  ```
- تحديث `syncBatchToRouter` لإعادة المحاولة بأمان:
  - فحص الكروت التي ما تزال بحاجة للمزامنة فقط.
  - احتساب الكرت ناجحًا إذا كان موجودًا مسبقًا على الراوتر (`already have user with this name`).
  - تحديث الدفعة إلى `COMPLETED` و `SYNCED` عند اكتمال كافة الكروت.
  - منع إعادة احتساب الكروت ضد الحصة.

#### ج. إضافة نقطة وصول استعلام الحصة (`CardsController`)
- **المسار:** `GET /cards/quota`
- يُرجع بيانات الحصة اللحظية للمستأجر الحالي لاستخدامها في واجهات الموبايل ولوحة التحكم.

#### د. تحديث `TenantsService`
- **الملف:** `apps/api/src/modules/tenants/tenants.service.ts`
- إزالة الثابت `maxCardsPerMonth: 100000` و `5000`.
- حساب الاستهلاك الفعلي للمستأجر ضمن دورة اشتراكه وإرجاع `cardLimit`, `usedCards`, `remainingCards`, `billingCycleStart`, `billingCycleEnd`.

---

### 3. تحديثات واجهات المستخدم

#### أ. لوحة تحكم الويب (`apps/admin`)
- **الملف:** `apps/admin/src/modules/settings/TenantSettingsView.tsx`
- إزالة النصوص والأرقام الوهمية الثابتة (`ENTERPRISE PRO`, `50,000`, `31/12/2027`).
- عرض اسم الخطة الفعلي (`BASIC`, `PRO`, `BUSINESS`, `ENTERPRISE`).
- شريط تقدم بصري يوضح نسبة استهلاك الكروت خلال الدورة الشهرية الحالية، والعدد المستهلك، والرصيد المتبقي بدقة، وتاريخ التجديد القادم.

#### ب. تطبيق Flutter للهواتف (`apps/mobile`)
1. **النماذج ونقاط النهاية:**
   - تحديث `ApiEndpoints.dart` لإضافة `cardsQuota` و `currentTenant`.
   - إضافة `TenantQuotaModel` في `models.dart` مع بارسر يدعم القيم الرقمية والتواريخ والخطط غير المحدودة.
   - إضافة `tenantQuotaProvider` في `providers.dart`.
2. **استوديو الكروت (`card_studio_screen.dart`):**
   - إضافة شريط علوي (`_buildQuotaBanner`) يوضح للمستخدم الباقة النشطة، رصيد الكروت المتبقي، وحالة الاستهلاك الحالية قبل بدء التوليد.
   - تحديث نافذة نتيجة التوليد لعرض حالة مزامنة الراوتر الحقيقية (`SYNCED`, `PARTIAL`, `PENDING_OFFLINE`, `FAILED`)، مع إظهار عدد الكروت المتزامنة والفاشلة وسبب الخطأ.
   - إبطال كاش الحصة فور اكتمال الدفعة لتحديث العداد تلقائيًا.
3. **الملف الشخصي للمستأجر (`user_profile_screen.dart`):**
   - إضافة بطاقة اشتراك وحصص تفاعلية (`_buildSubscriptionQuotaCard`) تعرض تفاصيل الخطة، استهلاك الكروت، الرصيد المتبقي، نسبة الاستهلاك، وتاريخ انتهاء وتجديد الاشتراك.

---

### 4. سجل الاختبارات والتحقق البرمجي

#### أ. اختبارات الـ Backend (Jest)
تم إنشاء حزمة اختبارات شاملة في:
- `apps/api/src/modules/cards/services/cards-quota.spec.ts` (12 اختبارًا مخصصًا)
- `apps/api/src/modules/cards/services/cards.service.spec.ts` (5 اختبارات)

**النتائج:**
```text
PASS src/modules/sync/services/sync.service.spec.ts
PASS src/modules/cards/services/cards.service.spec.ts
PASS src/modules/cards/services/cards-quota.spec.ts
PASS src/core/security/hashing.service.spec.ts
PASS src/modules/hotspot/hotspot.service.spec.ts
PASS src/modules/card-templates/card-templates.service.spec.ts
PASS src/modules/sales/services/sales.service.spec.ts
PASS src/modules/devices/devices.service.spec.ts
PASS src/modules/auth/auth.service.spec.ts
PASS src/modules/analytics/analytics.service.spec.ts
PASS src/modules/audit-logs/audit-logs.service.spec.ts
PASS src/modules/reports/reports.service.spec.ts
PASS src/core/security/encryption.service.spec.ts
PASS src/core/mikrotik/protocols/routeros-socket-protocol.spec.ts
PASS src/modules/cards/services/card-code-generator.service.spec.ts

Test Suites: 15 passed, 15 total
Tests:       82 passed, 82 total
Time:        27.992 s
```

**سيناريوهات الحصص والمزامنة المختبرة والمؤكدة:**
1. توليد كروت بنجاح ضمن حد الحصة المسموح.
2. رفض التوليد فوريًا عند طلب كمية تتجاوز الرصيد المتبقي (`QUOTA_EXCEEDED`).
3. منع التوليد تمامًا عند انتهاء صلاحية الاشتراك (`SUBSCRIPTION_EXPIRED`).
4. دعم كامل للخطط غير المحدودة (`isUnlimited: true` أو `cardGenerationLimit: null`).
5. عزل المستأجرين: التأكد من أن استهلاك مستأجر معين لا يؤثر إطلاقًا على حصة مستأجر آخر.
6. التعامل مع فشل راوتر MikroTik ووسم الدفعة كـ `FAILED` دون ادعاء نجاح كاذب.
7. معالجة المزامنة الجزئية ووسم الدفعة بـ `PARTIAL` مع توثيق الكروت الفاشلة.
8. دعم التوليد المكتبي عند عدم وجود راوتر متصل ووسم المزامنة بـ `PENDING_OFFLINE`.
9. إعادة المحاولة القابلة للتكرار (`syncBatchToRouter`) دون تكرار الكروت المتزامنة مسبقًا.
10. اعتبار خطأ `already have user with this name` بمثابة كرت موجود مسبقًا وتحديث حالته إلى `SYNCED`.
11. عدم احتساب أو خصم الكروت التي فشلت مزامنتها في الدفعات الفاشلة من الحصة.
12. الاستعلام عن الحصة عبر `getTenantQuota` وإرجاع الأرقام الفعلية للدورة الحالية.

#### ب. فحص واختبارات تطبيق Flutter
- تشغيل `flutter analyze`: **0 issues found** (خالٍ تمامًا من الأخطاء والتحذيرات).
- تشغيل `flutter test`: **23 passed, 23 total** (نجاح بنسبة 100%).

#### ج. بناء الحزم (Build Verification)
- بناء الـ Backend: `pnpm --filter @mikrotik-saas/api build` -> **Exit Code 0**.
- بناء لوحة التحكم: `pnpm --filter @mikrotik-saas/admin build` -> **Exit Code 0**.

---

### 5. القيود والخطوات القادمة للمراحل التالية

1. **الراوتر الحقيقي مقابل البيئة الوهمية (Mock vs Real RouterOS):**
   - الاختبارات الآلية تعمل باستخدام Mocking للبروتوكول للتأكد من المعالجة المنطقية الصحيحة للحالات والأخطاء.
   - في بيئة الإنتاج الفعلية، يعتمد نجاح المزامنة الحية على إمكانية الوصول للراوتر (عبر IP عام أو شبكة محلية أو نفق VPN).
2. **الاستعداد للمرحلة الثانية:**
   - بعد استقرار نظام الحصص وسلامة المزامنة، أصبح النظام جاهزًا للانتقال إلى المرحلة التالية: بناء لوحة Super Admin لإدارة الاشتراكات والخطط، وربط شبكات MikroTik عبر أنفاق VPN (ZeroTier / WireGuard) لمعالجة مشكلة عناوين IP الخاصة وخوادم Starlink.
