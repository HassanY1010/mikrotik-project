# تقرير إنجاز المهمة 4.4: بناء واجهات إدارة PPPoE في Web Admin لمشروع SudaFi MikroTik SaaS

**تاريخ الإنجاز:** 12 أكتوبر 2026  
**المشروع:** منصة SudaFi لإدارة شبكات MikroTik السحابية (SaaS)  
**المسار:** `E:\microTik_project\apps\admin`  
**الحالة:** مكتمل بنجاح (TypeScript Clean & Vite Build Passed 100%)

---

## 1. الصفحات والمكونات التي أُضيفت (Pages & Components)

تم بناء وحدة متكاملة لإدارة شبكات النطاق العريض (PPPoE) متوافقة تماماً مع نظام التصميم الحالي للمنصة، وتدعم اللغة العربية والاتجاه من اليمين لليسار (RTL)، والمظهر الداكن (Dark Mode):

1. **[PppoeManagementView.tsx](file:///E:/microTik_project/apps/admin/src/modules/pppoe/PppoeManagementView.tsx):**
   - العرض الرئيسي لوحدة PPPoE والمربوط بالتوجيه داخل [App.tsx](file:///E:/microTik_project/apps/admin/src/App.tsx) و[Sidebar.tsx](file:///E:/microTik_project/apps/admin/src/components/layout/Sidebar.tsx).
   - يتضمن محدد جهاز الراوتر (Router Device Selector) الذي يستعلم قائمة الموجهات المملوكة للمستأجر مع حالة الاتصال (Online/Offline) وIP الوكيل.
   - يعرض بطاقات المؤشرات الرئيسية (KPI Cards):
     - إجمالي المشتركين المسجلين.
     - المشتركون النشطون المتاح لهم الاتصال.
     - الجلسات النشطة المتصلة مباشرة على الراوتر.
     - باقات وبروفايلات السرعة المعرفة.
   - يدير شريط التنبيهات المباشر عند جدولة أوامر جديدة لمتابعتها بنقرة واحدة في تبويب الأوامر.
   - يدير التبديل بين التبويبات الأربعة الفرعية بسلاسة.

2. **[PppoeProfilesTab.tsx](file:///E:/microTik_project/apps/admin/src/modules/pppoe/PppoeProfilesTab.tsx):**
   - جدول بطاقات وجداول بروفايلات السرعة والباقات مع مؤشرات السعر، السرعة (Rate Limit)، العناوين المحلية والبعيدة (Local & Remote Address)، وحصانة الجلسة الأحادية (Only-One).
   - نافذة إنشاء بروفايل جديد (Create Modal) متوافقة مع متطلبات الـ Backend.
   - نافذة تعديل البروفايل (Edit Modal) مع دعم تحديث الأسعار والمحددات.
   - زر المزامنة الفورية مع الراوتر (`/sync`) عبر Windows LAN Agent.
   - حماية الحذف: منع حذف أي بروفايل مرتبط بحسابات نشطة استناداً إلى التحقق المحلي واستجابات الـ Backend.

3. **[PppoeAccountsTab.tsx](file:///E:/microTik_project/apps/admin/src/modules/pppoe/PppoeAccountsTab.tsx):**
   - جدول حسابات المشتركين مع البحث بالاسم ورقم الهاتف واسم المستخدم وعنوان IP الثابت.
   - تصفية الحسابات حسب الحالة (`ACTIVE`، `DISABLED`، `EXPIRED`، `SUSPENDED`) وحسب البروفايل.
   - نافذة إضافة مشترك جديد (Create Account Modal) مع تحديد البروفايل، دورة الفوترة، السعر، وتاريخ انتهاء الصلاحية.
   - **التعامل الآمن مع كلمات المرور:**
     - كلمة المرور تُدخل فقط في نافذة الإنشاء/التعديل كحالة عابرة (Transient React State).
     - توفير زر إظهار/إخفاء مؤقت للتحقق البصري أثناء الإدخال.
     - لا تُحفظ كلمة المرور في `localStorage` أو `sessionStorage`.
     - لا تُطبع في `console.log`.
     - لا تُعرض كلمة المرور في جداول البيانات بعد الحفظ (إذ تُشفر في Backend عبر AES-256-GCM ولا تُعاد في الـ DTO).
   - إجراءات سريعة: تعطيل/تفعيل الحساب بنقرة واحدة (مع قطع الاتصال النشط فور التعطيل)، وتعديل بيانات العميل، وحذف الحساب مع تأكيد الحذف.

4. **[PppoeSessionsTab.tsx](file:///E:/microTik_project/apps/admin/src/modules/pppoe/PppoeSessionsTab.tsx):**
   - جدول متابعة الجلسات الحية النشطة على الراوتر في الوقت الفعلي.
   - عرض اسم المشترك، عنوان IP الممنوح، عنوان MAC / المتصل (Caller ID)، مدة الاتصال (Uptime)، وحركة البيانات المجمعة (Download / Upload بالـ MB و GB).
   - زر المزامنة والاستعلام المباشر من الراوتر (`?sync=true`).
   - زر قطع الاتصال الفوري (Disconnect Session) مع نافذة تأكيد تحذيرية لحماية المستخدم من القطع غير المقصود.

5. **[PppoeCommandsTab.tsx](file:///E:/microTik_project/apps/admin/src/modules/pppoe/PppoeCommandsTab.tsx):**
   - مركز متابعة أوامر وكيل الراوتر (Windows LAN Agent Commands Monitor).
   - قائمة جانبية بالأوامر المجدولة خلال الجلسة، مع إمكانية البحث المباشر بأي معرف أمر (UUID).
   - مؤشرات بصرية واضحة تميز بين:
     - `PENDING`: بانتظار استلام الوكيل (طابور الانتظار).
     - `DISPATCHED`: تم الإرسال للوكيل وجاري التنفيذ على الراوتر.
     - `COMPLETED`: تم التنفيذ بنجاح على الراوتر.
     - `FAILED`: فشل التنفيذ على الراوتر مع إبراز رسالة الخطأ الصادرة من MikroTik.
     - `EXPIRED`: انتهت صلاحية الأمر قبل تنفيذه.
   - إمكانية التحديث التلقائي الدوري (Polling) مع إيقافه تلقائياً عند وصول الأمر إلى حالة نهائية.
   - عارض تقني قابل للطي لعرض مدخلات الـ Payload ونتائج الـ Result الواردة من الراوتر.

6. **تحديث ملفات التوجيه والواجهات المشتركة:**
   - **[view-models.ts](file:///E:/microTik_project/apps/admin/src/core/types/view-models.ts):** إضافة واجهات `PppoeProfileItem`, `PppoeAccountItem`, `PppoeActiveSessionItem`, `AgentCommandStatusItem`.
   - **[Sidebar.tsx](file:///E:/microTik_project/apps/admin/src/components/layout/Sidebar.tsx):** إضافة التبويب التشغيلي `'pppoe'` بأيقونة `Network` وعنوان "اشتراكات النطاق العريض (PPPoE)".
   - **[App.tsx](file:///E:/microTik_project/apps/admin/src/App.tsx):** استيراد المكون بنمط التحميل الكسول (Lazy Loading) وربط تبويب `'pppoe'` بشاشة `PppoeManagementView`.

---

## 2. مسارات API الفعلية المستخدمة (Actual API Routes Used)

تم الربط حصرياً مع المسارات المنفذة فعلياً في المهمة 4.3 دون افتراض مسارات غير موجودة:

| المورد | الطريقة | المسار الفعلي | الغرض |
| :--- | :---: | :--- | :--- |
| **الأجهزة** | `GET` | `/devices` | جلب قائمة أجهزة الراوتر التابعة للمستأجر |
| **البروفايلات** | `GET` | `/pppoe/devices/:deviceId/profiles` | استعراض بروفايلات PPPoE للراوتر المحدد |
| **البروفايلات** | `POST` | `/pppoe/devices/:deviceId/profiles` | إنشاء بروفايل وجدولة أمر مزامنته |
| **البروفايلات** | `GET` | `/pppoe/devices/:deviceId/profiles/:id` | جلب تفاصيل بروفايل محدد |
| **البروفايلات** | `PATCH` | `/pppoe/devices/:deviceId/profiles/:id` | تعديل إعدادات البروفايل وجدولة التحديث |
| **البروفايلات** | `DELETE` | `/pppoe/devices/:deviceId/profiles/:id` | حذف البروفايل (مرفوض إذا وجدت حسابات) |
| **البروفايلات** | `POST` | `/pppoe/devices/:deviceId/profiles/:id/sync` | فرض مزامنة البروفايل مع الراوتر |
| **الحسابات** | `GET` | `/pppoe/devices/:deviceId/accounts` | جلب حسابات المشتركين مع التصفية والبحث |
| **الحسابات** | `POST` | `/pppoe/devices/:deviceId/accounts` | إنشاء حساب وتشفير كلمته وجدولة إضافته |
| **الحسابات** | `GET` | `/pppoe/devices/:deviceId/accounts/:id` | جلب تفاصيل الحساب |
| **الحسابات** | `PATCH` | `/pppoe/devices/:deviceId/accounts/:id` | تحديث بيانات الحساب |
| **الحسابات** | `POST` | `/pppoe/devices/:deviceId/accounts/:id/disable` | تعطيل الحساب وقطع اتصاله فوراً |
| **الحسابات** | `POST` | `/pppoe/devices/:deviceId/accounts/:id/enable` | إعادة تفعيل الحساب |
| **الحسابات** | `DELETE` | `/pppoe/devices/:deviceId/accounts/:id` | حذف الحساب وجدولة حذفه من الراوتر |
| **الجلسات** | `GET` | `/pppoe/devices/:deviceId/sessions?sync=true` | استعلام الجلسات النشطة مع خيار المزامنة الحية |
| **الجلسات** | `POST` | `/pppoe/devices/:deviceId/sessions/disconnect` | قطع اتصال جلسة محددة من الراوتر |
| **الأوامر** | `GET` | `/pppoe/devices/:deviceId/commands/:commandId` | متابعة حالة الأمر ونتائج التنفيذ من الوكيل |

---

## 3. العمليات المدعومة فعلياً والعمليات التي تعذر إكمالها

### أ. العمليات المدعومة بالكامل:
- إنشاء وتعديل وحذف ومزامنة بروفايلات PPPoE.
- منع حذف البروفايلات المرتبطة بمشتركين مع إظهار رسالة واضحة للمستخدم.
- إنشاء وتعديل وتفعيل وتعطيل وحذف حسابات المشتركين.
- البحث والفلترة حسب الحالة والباقة.
- استعراض الجلسات النشطة المباشرة مع استهلاك الباندويث ومدة الاتصال.
- فصل الجلسات الحية مع نافذة تأكيد تحذيرية.
- متابعة أوامر الـ Agent لحظة بلحظة مع عارض تقني لحالات الفشل والنجاح.

### ب. العمليات التي تعذر إكمالها أو خضعت لحدود الـ Backend الحالي:
- **المخططات البيانية اللحظية للباندويث (Live Traffic Charts):** الـ Backend يعيد إجمالي البايتات (`bytesIn` / `bytesOut`) ومدة الاتصال عند طلب الاستعلام، ولا يوفر WebSocket أو Server-Sent Events لبث حركة المرور اللحظية ثانية بثانية. تم الاكتفاء بعرض الأرقام المجمعة مع زر التحديث والمزامنة لتجنب إغراق الخادم بطلبات متكررة غير مجدية.
- **تعديل اسم المستخدم (Username Renaming):** تم تعطيل تعديل اسم المستخدم في نافذة التعديل وجعله للقراءة فقط (`readOnly`) لأن اسم المستخدم هو المعرف الفريد في RouterOS secret والـ Backend يرفض تغييره بعد الإنشاء للحفاظ على سلامة التزامن.

---

## 4. نتائج الاختبارات والبناء الفعلية (Verification Results)

### أ. فحص أنواع TypeScript (`tsc --noEmit`):
```bash
> pnpm --filter @mikrotik-saas/admin run type-check
> tsc --noEmit
# Exit status: 0 (No type errors)
```

### ب. البناء الإنتاجي الشامل لـ Web Admin (`pnpm build`):
```bash
> pnpm --filter @mikrotik-saas/admin build
> pnpm --filter @mikrotik-saas/shared-types build && pnpm --filter @mikrotik-saas/shared-validation build && tsc && vite build
vite v5.4.21 building for production...
✓ 2049 modules transformed.
dist/assets/PppoeManagementView-DokfhivP.js  76.66 kB │ gzip: 15.70 kB
dist/assets/index-DiHGcy9E.js               185.74 kB │ gzip: 58.18 kB
✓ built in 42.31s (Exit code: 0)
```

### ج. سلامة شاشات HotSpot والتنقل الحالي:
- لم يتم المساس بملفات `HotspotProfilesView.tsx` أو `CardsView.tsx` أو `DevicesView.tsx`.
- التنقل في القائمة الجانبية يعمل بسلاسة دون تعارض بين وحدات HotSpot ووحدة PPPoE الجديدة.

---

## 5. الأمان والصلاحيات والتوافق المعماري

1. **التعامل مع كلمات المرور:**
   - الحقول محصورة تماماً داخل حالة النموذج المؤقتة ولا تُطبع في Console أو تُحفظ في أي تخزين محلي بالمتصفح.
2. **عزل المستأجرين (Tenant Isolation):**
   - تحديد المستأجر يتم تلقائياً عبر `apiClient` المدمج والذي يرسل `access_token` الحامل لـ `tenantId`، وجميع مسارات PPPoE تطبق `TenantGuard` و `assertDeviceOwnership` في الـ Backend.
3. **التحقق من حالة أوامر الراوتر:**
   - تم الالتزام الصارم بعدم إظهار العملية على أنها "اكتملت على الراوتر" لمجرد قبول الطلب؛ بل تُعرض الحالة الحقيقية من الوكيل (`PENDING` -> `DISPATCHED` -> `COMPLETED`/`FAILED`).

---

## 6. تأكيد الحفاظ على حدود التنفيذ

- **قاعدة البيانات والـ Backend:** لم يتم إجراء أي تعديل على كود NestJS أو مخطط Prisma أو الـ migrations.
- **البيئة الحقيقية والإنتاج:** لم يتم الاتصال بأي راوتر حقيقي، ولم يتم تعديل أي إعدادات في Render أو Supabase أو خوادم الإنتاج.
- **تطبيق Flutter:** لم يتم البدء في المهمة 4.5 الخاصة بتطبيق الهاتف.

---

## الخطوة التالية المقترحة

المهمة 4.4 منتهية بالكامل وجاهزة للمراجعة. بانتظار توجيهاتكم للانتقال إلى **المهمة 4.5: دعم PPPoE في تطبيق الهاتف (Flutter Mobile App)**.
