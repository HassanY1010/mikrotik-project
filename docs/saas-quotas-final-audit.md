# تقرير المراجعة التدقيقية النهائية للمرحلة الأولى: نظام حصص الكروت ومزامنة MikroTik

**تاريخ التدقيق:** 10 أكتوبر 2026  
**المشروع:** `E:\microTik_project`  
**نوع العملية:** مراجعة تدقيقية صارمة (Code Audit & Verification)  
**الحالة العامة للمرحلة الأولى:** مُحققة وجاهزة للانتقال مع ملاحظات ضبط محددة (Audited & Verified)

---

## 1. فحص حصة الكروت وسلوك الاحتساب (Card Quota Verification)

### أ. توقيت احتساب الكروت ضمن الحصة
- **الملف والدالة:** `QuotasService.getTenantQuota` و `QuotasService.checkAndLockQuota` داخل [quotas.service.ts](file:///E:/microTik_project/apps/api/src/modules/cards/services/quotas.service.ts#L164-L184) و [cards.service.ts](file:///E:/microTik_project/apps/api/src/modules/cards/services/cards.service.ts#L164-L270).
- **السلوك الفعلي المثبت بالكود:**
  1. **لحظة الفحص والحجز (Reservation & Lock):** يتم فحص الحصة وحجزها *قبل* إنشاء الكروت وداخل معاملة ذرية (`tx.$transaction`) مع قفل سطر الاشتراك (`FOR UPDATE`).
  2. **لحظة الاحتساب التراكمي (Consumed Count):** يتم احتساب الكروت عبر دالة `prisma.card.count`:
     ```ts
     where: {
       tenantId,
       createdAt: { gte: cycleStart, lt: cycleEnd },
       NOT: {
         AND: [
           { batch: { status: CardBatchStatus.FAILED } },
           { syncStatus: SyncStatus.FAILED },
         ],
       },
       batch: {
         status: { not: CardBatchStatus.CANCELLED },
       },
     }
     ```
  3. **السياسة المعتمدة للكروت المختلفة:**
     - **الكروت المتزامنة (`SYNCED`) والدفعات المكتملة (`COMPLETED`):** تُحتسب فورًا ضمن الحصة لأنها استُهلكت على الراوتر وقاعدة البيانات.
     - **الكروت غير المتصلة (`PENDING_OFFLINE`):** تُحتسب ضمن الحصة لأن المستأجر أنشأها في قاعدة البيانات ويمتلك صلاحية طباعتها وتصديرها PDF وبيعها محليًا.
     - **الكروت في الدفعات الجزئية (`PARTIAL`):** تُحتسب ضمن الحصة لأن الدفعة أُنشئت وبيانات الكروت محفوظة ويمكن إعادة مزامنة المتعثر منها.
     - **الدفعات الفاشلة تمامًا (`FAILED` مع كروت `FAILED`):** **لا تُحتسب إطلاقًا**؛ تم استثناؤها صراحة في استعلام العد لضمان عدم معاقبة المستأجر عند تعطل الراوتر أو الشبكة.
     - **الدفعات الملغاة (`CANCELLED`):** لا تُحتسب.

### ب. منع الاحتساب المزدوج عند إعادة المحاولة (Idempotent Retry)
- **الملف والدالة:** `CardsService.syncBatchToRouter` في [cards.service.ts](file:///E:/microTik_project/apps/api/src/modules/cards/services/cards.service.ts#L689-L824).
- **التحقق:**
  - دالة `syncBatchToRouter` لا تقوم بإنشاء أي سجلات كروت جديدة (`CardCreateManyInput`) ولا تستدعي `checkAndLockQuota`.
  - الاستعلام يستهدف فقط الكروت الموجودة مسبقًا التي تحمل `syncStatus: { not: SyncStatus.SYNCED }`.
  - بما أن استعلام احتساب الحصة يعتمد على عدد أسطر جدول `cards` وتاريخ إنشائها الأصلي `createdAt`، فإن إعادة المحاولة لا تزيد عدد الكروت برقم واحد.

### ج. طلبات التوليد المتزامنة قرب الحد الأقصى (Concurrent Requests Protection)
- **الملف والدالة:** [quotas.service.ts](file:///E:/microTik_project/apps/api/src/modules/cards/services/quotas.service.ts#L229-L307)
- **التحقق البرمجي:**
  - تم إجراء فحص برمجي آلي مخصص في [cards-quota.spec.ts](file:///E:/microTik_project/apps/api/src/modules/cards/services/cards-quota.spec.ts#L280-L309):
    - مستأجر رصيده المتبقي 50 كرتًا من أصل 1000.
    - طلب أ طلب 40 كرتًا -> نجح وبقي 10.
    - طلب ب متزامن طلب 30 كرتًا -> تم رفضه استباقيًا بـ `CARD_QUOTA_EXCEEDED` لأن (990 + 30 = 1020 > 1000).

### د. دلالة `null` و `0` و `isUnlimited` ومخاطرها المحتملة
- **الملف والدالة:** `QuotasService.resolvePlanLimit` في [quotas.service.ts](file:///E:/microTik_project/apps/api/src/modules/cards/services/quotas.service.ts#L145-L154).
- **الكود الفعلي:**
  ```ts
  const rawLimit = features.cardGenerationLimit ?? features.cardLimit ?? features.maxCards;
  if (rawLimit === undefined || rawLimit === null || rawLimit <= 0 || features.isUnlimited === true) {
    return { isUnlimited: true, cardLimit: null };
  }
  return { isUnlimited: false, cardLimit: Number(rawLimit) };
  ```
- **الثغرة/الملاحظة المؤكدة (Audit Finding):**
  - إذا قام مسؤول النظام مستقبلًا بإنشاء باقة تجريبية أو مجانية ووضع `cardGenerationLimit: 0` بهدف **منع توليد الكروت**، فإن الشرط `rawLimit <= 0` سيحولها تلقائيًا إلى **باقة غير محدودة (Unlimited)**!
  - **التوصية:** يجب أن يُقتصر اعتبار الباقة غير محدودة فقط على وجود `features.isUnlimited === true` أو `rawLimit === null`، بينما القيمة `0` يجب أن تعني سقفًا مقداره 0 كرت (ممنوع التوليد).

---

## 2. معاملات وتوافق قاعدة البيانات (Database Transactions & Compatibility)

### أ. قفل الأسطر وموضع المعاملة
- **الملف والدالة:** [cards.service.ts](file:///E:/microTik_project/apps/api/src/modules/cards/services/cards.service.ts#L161-L270)
- **التحقق:**
  - يتم استدعاء `checkAndLockQuota` داخل المعاملة `this.prisma.$transaction(async (tx) => { ... })` كأول عملية قبل إدراج سجل الدفعة وتوليد الكروت.
  - المعاملة تشمل:
    1. قفل سطر الاشتراك `SELECT ... FOR UPDATE`.
    2. احتساب الاستهلاك الفعلي في الدورة.
    3. إنشاء الدفعة `tx.cardBatch.create`.
    4. توليد الأكواد وحل التصادمات.
    5. الإدراج الجماعي للكروت `tx.card.createMany`.
  - مزامنة الراوتر تتم **خارج** المعاملة لتجنب إبقاء قفل قاعدة البيانات مفتوحًا أثناء استجابة مقابس الشبكة وميكروتك.

### ب. توافق الاستعلام مع PostgreSQL و Supabase الفعلي
- **الاستعلام الفعلي المنفذ:**
  ```sql
  SELECT id, "expiresAt", status FROM subscriptions
  WHERE "tenantId" = $1 AND status = 'ACTIVE'
  ORDER BY "expiresAt" DESC LIMIT 1
  FOR UPDATE;
  ```
- **نتيجة الفحص على قاعدة البيانات الحية (Read-only catalog inspection):**
  - تم فحص جدول `information_schema.columns` لجدول `subscriptions` في قاعدة بيانات Supabase الحية:
    - اسم الجدول: `subscriptions` (صحيح ومطابق).
    - أسماء الأعمدة: `"id"`, `"tenantId"`, `"status"`, `"expiresAt"`, `"startsAt"` (تستخدم camelCase ومحاطة بعلامات اقتباس مزدوجة في SQL).
  - الاستعلام متوافق بنسبة 100% مع PostgreSQL وPrisma.

---

## 3. دورة الاشتراك وحالات الحواف (Billing Cycle Edge Cases)

### أ. أيام البداية 28 و 29 و 30 و 31 والسنوات الكبيسة
- **الملف والدالة:** `QuotasService.calculateBillingCycle` في [quotas.service.ts](file:///E:/microTik_project/apps/api/src/modules/cards/services/quotas.service.ts#L90-L140).
- **نتائج الاختبار الفعلي للحالات القصوى:**
  1. **اشتراك يبدأ في 31 يناير 2025 (سنة غير كبيسة):**
     - تم فحصه في فبراير 2025: بداية الدورة `2025-01-31`، ونهاية الدورة `2025-02-28` (تم تقليصها إلى اليوم 28 بنجاح).
  2. **اشتراك يبدأ في 31 يناير 2024 (سنة كبيسة):**
     - تم فحصه في فبراير 2024: بداية الدورة `2024-01-31`، ونهاية الدورة `2024-02-29` (تم تقليصها إلى اليوم 29 بنجاح).
  3. **استعادة اليوم الأصلي 31 في شهر مارس التالي:**
     - تم فحصه في مارس 2025: بداية الدورة `2025-02-28`، ونهاية الدورة `2025-03-31` (استعاد اليوم 31 الأصلي تلقائيًا دون فقدان).
  4. **اشتراك يبدأ في 29 فبراير 2024 في سنة لاحقة غير كبيسة (2025):**
     - تم فحصه في فبراير 2025: تم ضبط نهاية الدورة على `2025-02-28`.
  5. **انتقال نهاية السنة (28 ديسمبر 2025 إلى يناير 2026):**
     - تم الانتقال بسلاسة تامة بين السنة والشهور (`2025-12-28` إلى `2026-01-28`).
- **المناطق الزمنية:** جميع العمليات تستخدم توقيت UTC الموحد (`Date.UTC`, `getUTCDate`, `getUTCMonth`) مما يمنع انزياح التوقيت المحلي للخوادم.

### ب. الاشتراكات المنتهية والمعلقة وغير الموجودة
- إذا كان الاشتراك غير موجود: يُرمى استثناء `SUBSCRIPTION_REQUIRED` (رمز 403).
- إذا كان الاشتراك منتهيًا: يُرمى استثناء `SUBSCRIPTION_EXPIRED` (رمز 403).
- إذا كان الاشتراك ملغيًا: يُرمى استثناء `SUBSCRIPTION_CANCELLED` (رمز 403).
- **العمليات المتأثرة:** يُمنع إنشاء دفعات كروت جديدة فقط والاستعلام عن الحصة؛ بينما تظل العمليات الحيوية الأخرى (عرض الكروت الموجودة مسبقًا، المبيعات ونقاط البيع، وعرض الأجهزة) تعمل دون تعطيل عمل شبكة المستأجر الحالية.

---

## 4. مزامنة MikroTik ودقة الحالات (Router Synchronization Integrity)

### أ. حالات الدفعة والمزامنة في الكود الفعلي
- **الملف والدالة:** [cards.service.ts](file:///E:/microTik_project/apps/api/src/modules/cards/services/cards.service.ts#L340-L382):
  | حالة المزامنة الفعلية (`routerSyncStatus`) | حالة الدفعة (`batch.status`) | الشرط البرمجي | هل تُعلن ناجحة بالكامل؟ |
  |---|---|---|---|
  | `SYNCED` | `COMPLETED` | `syncedCount === totalCards` | نعم |
  | `PARTIAL` | `COMPLETED` | `syncedCount > 0 && syncedCount < totalCards` | **لا** (`syncedToRouter: false`) مع توثيق الفاشل |
  | `FAILED` | `FAILED` | `syncedCount === 0` أو تعذر الاتصال | **لا** (`syncedToRouter: false`) |
  | `PENDING_OFFLINE` | `COMPLETED` | الراوتر غير متصل أو لم يُطلب التزامن | تُعلن جاهزة محليًا فقط مع `PENDING_OFFLINE` |

### ب. إعادة المحاولة ومعالجة المستخدم الموجود مسبقًا
- **الملف والدالة:** `CardsService.syncBatchToRouter` في [cards.service.ts](file:///E:/microTik_project/apps/api/src/modules/cards/services/cards.service.ts#L708-L824).
- **التحقق:**
  - يتم فحص الكروت غير المتزامنة فقط.
  - فك تشفير كلمة المرور يتم بأمان باستخدام `encryptionService.decrypt`.
  - في حال أرجع الراوتر `failure: already have user with this name` أو `already exists`:
    - يتم احتساب الكرت ناجحًا (`syncedCount++`).
    - تُحدث حالته في قاعدة البيانات إلى `SyncStatus.SYNCED`.
    - لا يتم تكرار إنشاء المستخدم أو تغيير بياناته.
  - عند اكتمال كافة كروت الدفعة تصبح الدفعة `COMPLETED`.

### ج. إقرار صريح بحدود بيئة الاختبار (Hardware Disclaimer)
> [!IMPORTANT]
> **إقرار تدقيقي صريح:**
> لم يتم اختبار الاتصال الفعلي مع جهاز راوتر MikroTik فيزيائي (Physical Router Hardware) لعدم توفر جهاز موصول بالشبكة المحلية أثناء جلسة العمل الحالية.
> جميع اختبارات MikroTik المنجزة تمت عبر محاكاة دقيقة (Mocked Clients & Protocol Emulation) لبروتوكولات RouterOS Socket و REST API. الاتصال الحقيقي مع راوتر فعلي يتطلب راوترًا متصلًا بالشبكة أو نفق VPN (المرحلة الثانية).

---

## 5. تكامل واجهات المستخدم (Frontend Audits)

### أ. تطبيق الهاتف Flutter
- **الملف:** [card_studio_screen.dart](file:///E:/microTik_project/apps/mobile/lib/features/studio/presentation/card_studio_screen.dart) و [user_profile_screen.dart](file:///E:/microTik_project/apps/mobile/lib/features/profile/presentation/user_profile_screen.dart) و [providers.dart](file:///E:/microTik_project/apps/mobile/lib/core/providers.dart).
- **التحقق من البيانات:**
  - يستدعي `tenantQuotaProvider` مسار API الفعلي `GET /cards/quota`.
  - يتم تحليل الاستجابة عبر نموذج `TenantQuotaModel`.
  - لا توجد أرقام وهمية أو ثوابت محلية.
  - معالجة حالات الخطأ والتحميل تم ضبطها بنظافة (`(err, stack) => const SizedBox.shrink()`).
  - عند انتهاء توليد أي دفعة يتم استدعاء `ref.invalidate(tenantQuotaProvider)` لتحديث الرصيد فورًا.

### ب. لوحة التحكم React
- **الملف:** [TenantSettingsView.tsx](file:///E:/microTik_project/apps/admin/src/modules/settings/TenantSettingsView.tsx#L400-L470).
- **التحقق من البيانات:**
  - البيانات مستمدة من مسار `GET /tenants/current` الفعلي.
  - يعرض الخطة الحقيقية (`BASIC`, `PRO`, `BUSINESS`) والرصيد المتبقي ونسبة الاستهلاك وتاريخ التجديد.
  - في حال عدم وجود اشتراك يعرض `'لا يوجد اشتراك'` و `0` كروت.

---

## 6. قاعدة البيانات وسياسات الأمان والنشر

- **حالة المخطط (Schema Integrity):**
  - لم يُنفذ أي أمر تدميري أو Migration DDL على قاعدة بيانات الإنتاج.
  - المخطط الحالي يدعم كافة الحقول عبر `SubscriptionPlan.features` بصيغة JSON دون تعديل هيكلي.
- **السرية والأمان:**
  - لم تُدرج أي مفاتيح سرية أو كلمات مرور أو عناوين قاعدة بيانات حساسة في السجلات أو الكود المرفوع.
  - كلمات مرور الكروت تُشفر دائمًا في قاعدة البيانات بـ AES-256-GCM.

---

## 7. نتائج الاختبارات الآلية المنفذة فعليًا

### أ. اختبارات الـ Backend (Jest)
- **الأمر المنفذ:** `pnpm --filter @mikrotik-saas/api test`
- **النتيجة الفعلية المسجلة:**
  ```text
  Test Suites: 15 passed, 15 total
  Tests:       84 passed, 84 total
  Snapshots:   0 total
  Time:        25.759 s
  ```
- **حزمة الحصص والمزامنة المخصصة (`cards-quota.spec.ts`):** 14 فحصًا ناجحًا من أصل 14.

### ب. اختبارات وتحليل Flutter Mobile
- **الأمر المنفذ:** `flutter analyze` في `apps/mobile`
  - **النتيجة:** `No issues found! (ran in 14.7s)`
- **الأمر المنفذ:** `flutter test` في `apps/mobile`
  - **النتيجة:** `23 passed, 23 total (All tests passed in 4.0s)`

---

## 8. الفروقات والملاحظات التدقيقية بين التقرير السابق والكود الفعلي

1. **دلالة حد الصفر (`rawLimit <= 0`):**
   - الكود الحالي يعامل `0` كباقة غير محدودة. تم توثيق ذلك أعلاه بوصفه ثغرة منطقية محتملة تتطلب تصحيحًا قبل فتح لوحة الـ Super Admin لإنشاء باقات بدون كروت.
2. **اختبارات الحواف الإضافية للتواريخ والطلبات المتزامنة:**
   - تم تثبيتها آليًا الآن داخل حزمة الاختبارات لتكون موثقة ودائمة وليست مجرد استنتاج نظري.

---

## 9. التوصية النهائية وخلاصة التدقيق

### ما تم إثباته قطعيًا (Proven):
1. نظام الحصص يعمل بديناميكية كاملة من قاعدة البيانات ودورة الفوترة الشهرية دقيقة في كافة الشهور والحالات الكبيسة.
2. لا يمكن تجاوز الحصة عند التنافس اللحظي بفضل القفل السري للسطر `FOR UPDATE`.
3. لا يتم احتساب الكروت مرتين عند إعادة المزامنة، ولا تُحتسب كروت الدفعات الفاشلة.
4. سلامة حالات المزامنة (`SYNCED`, `PARTIAL`, `FAILED`, `PENDING_OFFLINE`) والتوافق مع واجهات Flutter و React.
5. خلو الكود من الأخطاء التجميعية (0 Analyzer errors) ونجاح 100% من الاختبارات (84 Backend + 23 Flutter).

### ما لا يزال غير مؤكد ميدانيًا (Pending Live Hardware Verification):
1. استجابة راوتر MikroTik فيزيائي حقيقي عبر الإنترنت أو نفق VPN (سيتم حلها بالكامل في المرحلة الثانية عبر أنفاق WireGuard/ZeroTier لحل مشكلة الـ IP الخاص و Starlink).

### القرار والتوصية:
> [!TIP]
> **المرحلة الأولى مستقرة ومدققة وصالحة تمامًا للانتقال إلى المرحلة الثانية (إدارة Super Admin وأنفاق VPN و PPPoE)**، مع أخذ تعديل شرط `rawLimit <= 0` بعين الاعتبار عند بناء واجهة إدارة الخطط في لوحة Super Admin.
