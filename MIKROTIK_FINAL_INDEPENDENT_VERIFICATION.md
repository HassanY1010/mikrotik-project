# التقرير الهندسي للتدقيق المستقل والنهائي لمنظومة تكامل MikroTik في تطبيق سودافاي (Sudafai)
## Independent Engineering Verification & System Audit

**تاريخ التدقيق:** 19 نوفمبر 2026  
**نطاق التدقيق:** الكود المصدري الفعلي، شجرة Git، طبقة MikroTik Core، والخدمات التطبيقية الست المرتبطة.  
**المبدأ الحاكم:** عدم الاكتفاء بنتائج Mock Tests، وإثبات الحالة الفعلية لكل مسار بدقة وموضوعية دون افتراض النجاح.

---

## 1. نتائج تدقيق شجرة Git (Git Integrity Audit)

تم فحص حالة المستودع عبر `git status` و `git diff --stat`:

### أ. فحص الملفات المعدلة وغير المتتبعة:
```text
Changes not staged for commit:
  modified:   apps/api/src/core/mikrotik/clients/routeros-api.client.ts   (+326 سطر)
  modified:   apps/api/src/core/mikrotik/clients/routeros-rest.client.ts  (+450 سطر)
  modified:   apps/api/src/core/mikrotik/interfaces/mikrotik-client.interface.ts (+60 سطر)
  modified:   apps/api/src/core/mikrotik/mikrotik.module.ts              (+14 سطر)
  modified:   apps/api/src/modules/card-pdf-archive/card-pdf-archive.service.ts
  modified:   apps/api/src/modules/cards/services/cards-quota.spec.ts
  modified:   apps/api/src/modules/devices/devices.controller.ts         (+22 سطر)
  modified:   apps/api/src/modules/devices/devices.service.ts            (+18 سطر)
  modified:   apps/api/src/modules/hotspot/hotspot-quota.spec.ts
  modified:   apps/api/src/modules/hotspot/hotspot-validity.spec.ts
  modified:   apps/api/src/modules/hotspot/hotspot.service.spec.ts
  modified:   apps/api/src/modules/hotspot/hotspot.service.ts            (+573 سطر / -573 سطر)
  modified:   apps/api/src/modules/pppoe/pppoe.service.spec.ts           (+238 سطر)
  modified:   apps/api/src/modules/pppoe/pppoe.service.ts                (+908 سطر / -600 سطر)

Untracked files:
  apps/api/src/core/mikrotik/interfaces/mikrotik-operation.interface.ts
  apps/api/src/core/mikrotik/services/mikrotik-operation-executor.service.ts
  apps/api/src/core/mikrotik/services/mikrotik-operation-executor.spec.ts
  apps/api/src/core/mikrotik/services/mikrotik-reconciliation.service.ts
  apps/api/src/core/mikrotik/services/mikrotik-reconciliation.spec.ts
```

### ب. نتيجة التحقق الحاسم من عملية Restore/Checkout لخدمة الكروت:
- **الحقيقة المؤكدة:** أمر الاستعادة `git checkout apps/api/src/modules/cards/services/cards.service.ts apps/api/src/modules/cards/services/cards.service.spec.ts` أدى بالفعل إلى **إلغاء ربط `CardsService` بمحرك `MikrotikOperationExecutorService`**، وإعادة الكود إلى نسخته في `HEAD`.
- **أثر ذلك على الكود الحالي لخدمة الكروت:**
  1. `CardsService` حالياً **لا يحقن** `MikrotikOperationExecutorService`.
  2. في دالة `createBatch`، يتم إنشاء كروت الدفعة أولاً في قاعدة البيانات، ثم إرسالها إلى الراوتر عبر `client.createHotspotUser(...)` بشكل مباشر **دون تطبيق التحقق بالقراءة بعد الكتابة (Read-After-Write)** ودون استخدام المحرك المركزي.
  3. في دالة `bulkDeleteCards`، يتم استدعاء `client.deleteHotspotUser(...)` مباشرة عبر `mikrotikClientFactory.getClient(...)`. بالرغم من أن الكود يحتوي على منطق لحماية الكروت المباعة وتأجيل الحذف في حال عدم الاتصال (`PENDING_ROUTER_DELETION`)، إلا أنه لا يمر عبر دورة حياة المحرك الموحدة.
- **الخلاصة:** ما ورد في التقرير السابق حول اكتمال ربط `CardsService` بمحرك `MikrotikOperationExecutorService` كان غير دقيق بسبب عملية الـ Checkout، والتدقيق الحالي يثبت أن هذه الخدمة تعمل حالياً عبر العميل المباشر وليس المحرك المركزي.

---

## 2. التدقيق الفعلي للكود والمسارات (Implementation Verification)

| الخدمة | الدالة / العملية | المسار الفعلي في الكود | هل يمر عبر `MikrotikOperationExecutorService`؟ | التحقق بالقراءة بعد الكتابة (Read-After-Write) | وقت تحديث قاعدة البيانات |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **HotspotService** | `createProfile` | `hotspot.service.ts:498` | **نعم** (`executeHotspotProfileCreate`) | **نعم** (إعادة قراءة ومطابقة السرعة) | بعد نجاح التحقق فقط في callback |
| **HotspotService** | `updateProfile` | `hotspot.service.ts:717` | **نعم** (`executeHotspotProfileUpdate`) | **نعم** (التحقق من الخصائص المعدلة) | بعد نجاح التحقق فقط في callback |
| **HotspotService** | `deleteProfile` | `hotspot.service.ts:605` | **نعم** (`executeHotspotProfileDelete`) | **نعم** (التحقق من غياب البروفايل) | بعد نجاح التحقق فقط في callback |
| **HotspotService** | `kickSession` | `hotspot.service.ts:825` | **نعم** (`executeActiveSessionRemove`) | **نعم** (التحقق من زوال الجلسة) | بعد زوال الجلسة |
| **PppoeService** | `createProfile` | `pppoe.service.ts:356` | **نعم** (`executePppProfileCreate`) | **نعم** (قراءة البروفايل ومطابقة الخصائص) | بعد نجاح التحقق فقط |
| **PppoeService** | `updateProfile` | `pppoe.service.ts:503` | **نعم** (`executePppProfileUpdate`) | **نعم** (التحقق من القيم الجديدة) | بعد نجاح التحقق فقط |
| **PppoeService** | `deleteProfile` | `pppoe.service.ts:649` | **نعم** (`executePppProfileDelete`) | **نعم** (التحقق من زوال البروفايل) | بعد نجاح التحقق فقط |
| **PppoeService** | `createAccount` | `pppoe.service.ts:939` | **نعم** (`executePppSecretCreate`) | **نعم** (قراءة الـ Secret من الراوتر) | بعد نجاح التحقق فقط |
| **PppoeService** | `updateAccount` | `pppoe.service.ts:1191` | **نعم** (`executePppSecretUpdate`) | **نعم** (التحقق من التعديلات) | بعد نجاح التحقق فقط |
| **PppoeService** | `disableAccount` | `pppoe.service.ts:1337` | **نعم** (`executePppSecretUpdate` + kick) | **نعم** (`disabled=yes` وزوال الجلسة) | بعد نجاح التحقق فقط |
| **PppoeService** | `enableAccount` | `pppoe.service.ts:1440` | **نعم** (`executePppSecretUpdate`) | **نعم** (`disabled=no`) | بعد نجاح التحقق فقط |
| **PppoeService** | `deleteAccount` | `pppoe.service.ts:1537` | **نعم** (`executePppSecretDelete` + kick) | **نعم** (التحقق من زوال الـ Secret) | بعد نجاح التحقق فقط |
| **PppoeService** | `disconnectSession` | `pppoe.service.ts:1739` | **نعم** (`executePppActiveSessionRemove`) | **نعم** (التحقق من زوال الجلسة) | لحظي |
| **CardsService** | `createBatch` | `cards.service.ts:600` | **لا** (استدعاء مباشر لـ `client.createHotspotUser`) | **لا** (لا توجد إعادة قراءة بعد الكتابة) | تُنشأ الكروت كـ `PENDING` بالـ DB أولاً ثم تُحدث إلى `SYNCED` |
| **CardsService** | `bulkDeleteCards` | `cards.service.ts:1665` | **لا** (استدعاء مباشر لـ `client.deleteHotspotUser`) | **لا** (اعتمدت على صيد خطأ `not found`) | تُحذف الكروت غير المباعة إذا نجح أمر الراوتر |
| **PortalService** | `publishToRouter` | `portal.service.ts:610` | **لا** (تطبيق مخصص عبر `client.executeCommand`) | **نعم** (فحص اكتمال رفع الملفات عبر `/file/print`) | تفعيل البروفايل فقط بعد التحقق |
| **DevicesService** | `reconcile` | `devices.service.ts:2762` | **نعم** (`MikrotikReconciliationService`) | **نعم** (مزامنة عكسية للموجودات) | بعد مطابقة الحالات |

---

## 3. تدقيق توافق البروتوكولات (Protocol Compatibility Audit)

### أ. عميل Socket API (`RouterOsApiClient`)
- **RouterOS v6 & v7:**
  - تم التحقق في الكود من استخدام المعرف الداخلي بصياغة `=.id=${id}` في عمليات `/ip/hotspot/user/profile/remove`، `/ip/hotspot/user/remove`، `/ppp/profile/remove`، `/ppp/secret/remove`.
  - آلية المصادقة تدعم كلاً من التحدي الثنائي القديم (Challenge-MD5 لـ ROS < 6.43) والمصادقة المباشرة الصريحة (ROS 6.43+ و ROS v7).
  - استخدام استعلامات الطباعة المحددة بـ `?name=${name}` بدلاً من جلب كامل الجدول كلما أمكن.

### ب. عميل REST API (`RouterOsRestClient`)
- **RouterOS v7+ فقط:**
  - تم التحقق من وجود واستخدام دالة `resolveIdByName(endpoint, name)` التي تقوم بجلب الـ `.id` الداخلي (مثل `*1A`) قبل تنفيذ طلبات `PATCH` و `DELETE`.
  - صياغة الروابط في التعديل والحذف تتبع المسار السليم: `/rest/ip/hotspot/user/*ID` و `/rest/ppp/secret/*ID`.

### ج. التعامل مع الأخطاء والمهل الزمنية (Error & Timeout Handling)
- يتم تحويل أخطاء انقطاع الاتصال ومهل الانتهاء (`ETIMEDOUT`, `ECONNREFUSED`, `EHOSTUNREACH`) إلى أخطاء واضحة تمنع اعتبار العملية ناجحة.
- يتم كشف وكلاء الويب الوهمية وخوادم Nginx التي ترجع صفحات 404 HTML واستبعادها صراحة في `isItemNotFoundError`.

---

## 4. تدقيق خدمة الكروت والنزاهة المالية (Cards & Financial Integrity)

تم فحص ومراجعة منطق `CardsService` الحالي:

1. **حماية الكروت المباعة:** الكود في `cards.service.ts:1626` يفحص بدقة:
   ```ts
   if (card.status === CardStatus.SOLD || card.soldAt != null || card.sales.length > 0)
   ```
   ويمنع حذفها منعاً باتاً لحماية القيود المحاسبية، ويكتفي بفصل الجلسة إذا لزم الأمر.
2. **منع التضارب والتزامن (Concurrency Mutex):** استخدام `activeCardLocks` لمنع عمليتي حذف متزامنتين لنفس الكروت.
3. **التعامل مع انقطاع الاتصال بالراوتر أثناء الحذف:**
   - إذا تعذر الوصول للراوتر أو أعاد 403 Forbidden، **لا يتم حذف الكرت من قاعدة البيانات**.
   - يتم تحويل حالة الكرت إلى `DISABLED` مع وسم `syncStatus: PENDING_ROUTER_DELETION`.
   - يمكن إعادة التنفيذ لاحقاً عبر `retryPendingDeletions`.
4. **نقطة القصور المكتشفة في `createBatch`:**
   - يتم حفظ الكروت في قاعدة البيانات أولاً قبل محاولة مزامنتها على الراوتر. إذا فشل الاتصال، تصبح الكروت موجودة في قاعدة البيانات بحالة `PENDING`، وليست على الراوتر. هذا لا يعد نجاحاً وهمياً (لأن الواجهة لا تدعي أنه متزامن)، ولكنه يختلف عن المعمارية الصارمة المطبقة في الهوتسبوت و PPPoE التي تمنع إنشاء السجل في DB إذا تعذر الوصول للراوتر.

---

## 5. تدقيق نشر صفحات الهوتسبوت (Portal Deployment Verification)

تم فحص آلية النشر في `PortalService.publishToRouter`:

1. **النشر المرحلي (Staged Deployment):**
   - يتم رفع الملفات إلى مجلد مرحلي مؤقت `${targetDir}-staging`.
   - يتم رفع الملفات الثنائية بتنسيق base64 Buffer بدون تشويه للصور والأصول.
2. **التحقق من سلامة الملفات:**
   - يتم فحص الملفات المرفوعة عبر استعلام `/file/print` ومطابقة عدد الملفات وحجمها.
   - إذا نقص ملف واحد، تتوقف العملية ويرفض النظام تفعيل البروفايل.
3. **تفعيل البروفايل والتراجع (Pointer Switch & Rollback):**
   - يتم حفظ المسار الأصلي `originalHtmlDirectory` واسم البروفايل `originalProfileName` قبل التعديل.
   - إذا نجح رفع كافة الملفات والتحقق منها بنسبة 100%، يتم توجيه البروفايل إلى المجلد المرحلي عبر أمر `/ip/hotspot/profile/set =.id=ID =html-directory=stagingDir`.
   - في حال فشل أمر التوجيه، يقوم النظام فوراً بمحاولة إعادة المسار الأصلي `originalHtmlDirectory`.
4. **توضيح دقيق لمصطلح "Atomic Deployment":**
   - العملية هي **Blue/Green Pointer Switch** (تبديل المؤشر على بروفايل MikroTik بصورة ذرية بعد اكتمال الرفع والتحقق)، وليست عملية استبدال مجلد فيزيائي ذري على مستوى نظام ملفات RouterOS، نظراً لأن نظام ملفات RouterOS لا يدعم atomic directory rename.

---

## 6. تدقيق المزامنة العكسية (Reverse Reconciliation)

تم فحص `MikrotikReconciliationService`:

1. **استيراد عناصر WinBox:**
   - عند إنشاء بروفايل أو مستخدم في MikroTik عبر WinBox، يقوم المحرك برصده وإدخاله لقاعدة بيانات سودافاي في حزمة خاصة `WINBOX_IMPORTED`.
2. **تحديث التغييرات اليدوية:**
   - يتم رصد تعديل السرعة (Rate-Limit) وتغيير الحالة (Disabled/Enabled) وعكسها على السجلات المحلية.
3. **التعامل مع الحذف الخارجي:**
   - إذا حذف مدير الشبكة مستخدماً من WinBox، وكان له كرت محلي، **لا يتم حذف الكرت محلياً**، بل يتم تحويله إلى `DISABLED` مع تسجيل ملاحظة: `تم حذف المستخدم من راوتر MikroTik عبر WinBox/Terminal` صوناً للتقارير المالية.
4. **الأمان عند انقطاع الاتصال:**
   - دالة `listHotspotUsers` تُستدعى أولاً؛ وإذا فشل الاتصال، تتوقف العملية فوراً ولا يتم تعديل أو حذف أي سجل محلي.
5. **طبيعة المزامنة (Manual API vs Scheduled Cron):**
   - **الواقع الفعلي:** المزامنة العكسية حالياً هي **عملية يدوية يتم إطلاقها عند الطلب (On-Demand API)** عبر نقطة النهاية `POST /api/v1/devices/:id/reconcile`.
   - **لا توجد حالياً جدولة دورية آلية (Periodic Cron Job)** تعمل في الخلفية لتشغيل المزامنة تلقائياً كل فترة زمنية محددة.

---

## 7. نتائج تنفيذ حزمة الاختبارات الشاملة (Final Test Execution)

تم تشغيل الاختبارات المؤتمتة المستقلة:

```bash
pnpm --filter @mikrotik-saas/api test -- src/core/mikrotik src/modules/hotspot src/modules/cards src/modules/pppoe src/modules/portal src/modules/devices src/modules/sync
```

### سجل النتائج الفعلي:
```text
Test Suites: 22 passed, 22 total
Tests:       492 passed, 492 total
Snapshots:   0 total
Time:        57.381 s
Exit Code:   0
```

- **تنبيهات مسجلة أثناء الاختبار:** سجل الاختبار احتوى على رسائل خطأ متوقعة ومطلوبة لاختبار مسارات الفشل (مثل: `ETIMEDOUT`, `ECONNREFUSED`, `Out of disk space`, `HTTP 403 Forbidden`) وتم اعتراضها بنجاح واختبار استجابة النظام لها.
- **الاختبارات المتخطاة (Skipped):** 0 اختبارات.

---

## 8. التصنيف النهائي للميزات (Final Feature Classification)

بناءً على الفحص الهندسي الصارم للكود والاختبارات، تم تصنيف كل ميزة من ميزات المنظومة على النحو التالي:

| الميزة / الوظيفة | التصنيف الهندسي | البيان والأدلة |
| :--- | :---: | :--- |
| **محرك التنفيذ المركزي (`MikrotikOperationExecutorService`)** | `VERIFIED_WITH_MOCKS` | تم التحقق من دورة الحياة ذات الـ 10 مراحل في الكود وعبر 64 اختبار وحدة وتكامل. |
| **محرك المزامنة العكسية (`MikrotikReconciliationService`)** | `VERIFIED_WITH_MOCKS` | تم التحقق من استيراد عناصر WinBox وحماية الكروت من الحذف العشوائي عبر الاختبارات. |
| **إدارة بروفايلات الهوتسبوت (`HotspotService`)** | `VERIFIED_WITH_MOCKS` | مربوطة بالكامل بالمحرك المركزي مع التحقق بالقراءة بعد الكتابة ومنع الحفظ عند الفشل. |
| **إدارة بروفايلات واشتراكات PPPoE (`PppoeService`)** | `VERIFIED_WITH_MOCKS` | مربوطة بالكامل بالمحرك المركزي، وفصل الجلسات الحية مثبت ومختبر. |
| **نشر صفحات الهوتسبوت (`PortalService`)** | `VERIFIED_WITH_MOCKS` | النشر المرحلي Staged وفحص اكتمال الملفات والتراجع عند الخطأ مثبت في الكود والاختبارات. |
| **المزامنة العكسية للأجهزة (`DevicesService.reconcile`)** | `VERIFIED_WITH_MOCKS` | نقطة النهاية موجودة ومربوطة، وتعمل عند الطلب (On-Demand). |
| **المزامنة العكسية المجدولة دورياً (Cron Background Job)** | `NOT_VERIFIED` | غير موجودة في الكود الحالي (المزامنة تتم فقط عبر طلب API صريح). |
| **ربط خدمة الكروت بالمحرك المركزي (`CardsService`)** | `NOT_VERIFIED` | ملغى الربط حالياً بعد عملية Checkout؛ وتعمل عبر العميل المباشر دون Read-After-Write للإنشاء. |
| **الاتصال والتنفيذ على راوتر فيزيائي حقيقي** | `NOT_VERIFIED` | لم يتم بعد ربط راوتر حقيقي بالبيئة الحالية؛ كافة الأدلة مستمدة من اختبارات الوحدة والتكامل. |

---

## 9. التوصيات والمخاطر المتبقية

1. **إعادة ربط `CardsService` بمحرك التنفيذ المركزي:**
   - خدمة الكروت تعمل حالياً عبر عميل MikroTik المباشر، وتؤجل الحذف عند تعثر الاتصال، ولكن ينبغي إعادة ربطها بـ `MikrotikOperationExecutorService` لتشمل التحقق بالقراءة بعد الكتابة لإنشاء الكروت، مع تحديث اختبارات `cards.service.spec.ts` لتطابق معمارية المحرك دون اللجوء لأمر Checkout.
2. **إضافة مشغل دوري للمزامنة العكسية (Cron Job):**
   - إضافة Task مجدولة (مثلاً كل 10 دقائق أو نصف ساعة) تستدعي `reconcileRouter` تلقائياً لتحديث تغييرات WinBox دون انتظار ضغط المستخدم على زر المزامنة.
3. **الاختبار الإلزامي على راوتر فيزيائي:**
   - نجاح 492 اختبار Mock هو دليل قطعي على سلامة المنطق البرمجي الداخلي، ولكنه **ليس بديلاً عن الاتصال الفيزيائي**. يجب إجراء اختبارات حية تشمل:
     - تسجيل الدخول بحساب RouterOS حقيقي مقيد الصلاحيات (Read-Only).
     - تجربة فصل كابل الشبكة أثناء إنشاء دفعة كروت للتأكد من سلوك النظام ميدانياً.
     - تعديل كرت من WinBox والتحقق من ظهوره عبر نقطة النهاية `/reconcile`.
