# تقرير التدقيق الشامل والتفصيلي لمنظومة تكامل MikroTik في مشروع سودافاي (Sudafai)
**تاريخ التقرير:** 18 نوفمبر 2026  
**المرحلة:** الأولى — التدقيق الهندسي الشامل وتحليل الأسباب الجذرية (System Audit & Root Cause Analysis)  
**ملف التقرير:** `MIKROTIK_INTEGRATION_AUDIT.md`  
**الحالة:** مُنجز للمرحلة الأولى — جاهز للاعتماد قبل بدء الإصلاح الجذري  

---

## 1. المقدمة والهدف العام

أُجري هذا الفحص الهندسي الشامل استجابة للمشكلة الحرجة المكتشفة في منصة **سودافاي (Sudafai)**، وتتمثل في:
> **"ظهور بعض عمليات إدارة راوتر MikroTik للمستخدم على أنها نُفذت بنجاح، بينما يتم حفظها داخل قاعدة بيانات التطبيق فقط دون أن تنعكس فعلياً على راوتر MikroTik المستهدف."**

انطلاقاً من القاعدة المعمارية الصارمة:
1. **MikroTik RouterOS هو المصدر الحقيقي الوحيد للحالة (Source of Truth).**
2. **قاعدة بيانات التطبيق (PostgreSQL / Local Storage) هي طبقة مساندة للتخزين المؤقت، والسجلات المالية، وتحليلات الأعمال، وليست بديلاً عن الراوتر.**
3. **يُمنع منعاً باتاً إظهار حالة نجاح (SUCCESS / 200 / 201) لأي عملية إدارة ما لم تُنفّذ وتُؤكّد فعلياً على جهاز الراوتر.**
4. **التغييرات التي تتم خارجياً عبر WinBox أو CLI Terminal يجب أن تنعكس تلقائياً في التطبيق.**

---

## 2. المعمارية الحالية لطبقة التكامل وتدفق البيانات (Current Architecture)

يتألف النظام من أربعة أطراف رئيسية:
1. **خادم الواجهة الخلفية (Backend API):** تطبيق NestJS متعدد المستأجرين (Multi-tenant)، يتعامل مع قاعدة بيانات PostgreSQL عبر Prisma ORM.
2. **عميل ويندوز/لينكس المحلي (LAN Agent):** خدمة Node.js تعمل كـ Daemon على شبكة الراوتر المحلية لتلقي الأوامر عبر طابور `AgentCommand` في قاعدة البيانات وتنفيذها محلياً.
3. **تطبيق الهاتف المحمول (Flutter Mobile App):** تطبيق هاتف يحتوي على منطق اكتشاف محلي (MNDP/ARP/REST) وتخزين محلي (Offline-first) مع مزامنة مع السيرفر.
4. **لوحة التحكم المركزية (React Admin Dashboard):** واجهة ويب للمديرين والمشرفين تتصل مباشرة بـ Backend API.

```
                  ┌──────────────────────────────────────────────┐
                  │          React Web Admin / Cashier           │
                  └──────────────────────┬───────────────────────┘
                                         │ HTTPS REST
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │           NestJS Backend API                 │
                  │  (Devices, Hotspot, Cards, Portal, PPPoE)    │
                  └──────┬───────────────────────┬───────────────┘
                         │                       │
     Direct TCP / REST   │                       │ Polling / Commands Queue
     (Port 8728/80/443)  │                       │ (table: AgentCommand)
                         ▼                       ▼
               ┌───────────────────┐   ┌───────────────────────────┐
               │  Physical Router  │◄──┤  Sudafi Agent (Daemon)    │
               │  (Public / VPN)   │   │  (Runs inside local LAN)  │
               └───────────────────┘   └───────────────────────────┘
                         ▲
                         │ Direct Local LAN (Port 8728/80)
               ┌─────────┴─────────┐
               │ Flutter Mobile App│
               └───────────────────┘
```

---

## 3. جرد الملفات والخدمات المسؤولة عن تكامل MikroTik

| # | المكون / الخدمة | مسار الملف | الوظيفة الأساسية |
|---|---|---|---|
| 1 | **MikrotikClientFactory** | `apps/api/src/core/mikrotik/mikrotik-client.factory.ts` | إدارة اتصالات الراوتر، وإعادة استخدام المقابس (Socket Pooling)، وتحديد نوع الاتصال (API Socket vs REST). |
| 2 | **RouterOsApiClient** | `apps/api/src/core/mikrotik/clients/routeros-api.client.ts` | عميل بروتوكول MikroTik Binary API (المنافذ 8728 / 8729). |
| 3 | **RouterOsRestClient** | `apps/api/src/core/mikrotik/clients/routeros-rest.client.ts` | عميل RouterOS v7 REST API (المنافذ 80 / 443). |
| 4 | **IMikrotikClient** | `apps/api/src/core/mikrotik/interfaces/mikrotik-client.interface.ts` | العقد البرمجي الموحد لعمليات الراوتر. |
| 5 | **RouterOsSocketProtocol** | `apps/api/src/core/mikrotik/protocols/routeros-socket-protocol.ts` | ترميز وفك تشفير الجمل والكلمات الثنائية (Word Length Encoding). |
| 6 | **DevicesService & Controller** | `apps/api/src/modules/devices/devices.service.ts`<br>`apps/api/src/modules/devices/devices.controller.ts` | إدارة أجهزة الراوتر، واختبار الاتصال، والنسخ الاحتياطي، وحظر البث، وقفل الطوارئ. |
| 7 | **HotspotService & Controller** | `apps/api/src/modules/hotspot/hotspot.service.ts`<br>`apps/api/src/modules/hotspot/hotspot.controller.ts` | إدارة بروفايلات الهوتسبوت، وجلسات المستخدمين الحية، وفصل المستخدمين (Kick). |
| 8 | **CardsService & Controller** | `apps/api/src/modules/cards/services/cards.service.ts`<br>`apps/api/src/modules/cards/controllers/cards.controller.ts` | توليد الكروت وحزم الفاوتشرات، وتزامنها مع الراوتر، وتفعيلها وحذفها الجماعي. |
| 9 | **PortalService & Controller** | `apps/api/src/modules/portal/portal.service.ts`<br>`apps/api/src/modules/portal/portal.controller.ts` | تصميم وتجميع ونشر صفحات تسجيل الدخول (Captive Portal) وملفات الراوتر. |
| 10 | **PppoeService & Controller** | `apps/api/src/modules/pppoe/pppoe.service.ts`<br>`apps/api/src/modules/pppoe/pppoe.controller.ts` | إدارة اشتراكات وبروفايلات PPPoE وحسابات المشتركين وسجلات الاتصال. |
| 11 | **AgentService & RouterWorker** | `apps/api/src/modules/agent/agent.service.ts`<br>`apps/agent/src/router/routeros-worker.ts` | نظام وكيل الشبكة المحلية (LAN Agent) لطابور الأوامر غير المتزامنة. |
| 12 | **Provisioning Engine** | `apps/api/src/modules/mikrotik-provisioning/services/command-executor.service.ts` | محرك الضبط الأوتوماتيكي وتخطيط الأوامر والتراجع المسجل (Tracked Rollback). |
| 13 | **Mobile Discovery & Local Client** | `apps/mobile/lib/core/services/mikrotik_discovery_service.dart` | اكتشاف الراوترات وتنفيذ العمليات المحلية عبر التطبيق. |

---

## 4. الفحص التفصيلي ونقاط الخلل المكتشفة (Audit Findings)

### الخلل 1: آلية `isLocalOnlyPrivateLan` تعزل السيرفر وتعطي نجاحاً محلياً كاذباً (Fake Success)
- **الموقع:** 
  - `apps/api/src/modules/devices/devices.service.ts` (السطور 123-127، 1608-1632، 1704-1728)
  - `apps/api/src/modules/hotspot/hotspot.service.ts` (السطور 348-350، 427-431)
  - `apps/api/src/modules/cards/services/cards.service.ts` (السطور 596-598، 695-702)
  - `apps/api/src/modules/portal/portal.service.ts` (السطور 586-605)
- **وصف الخلل:**
  تعتمد المنظومة منطقاً مفاده: إذا كان عنوان الراوتر خاصاً (مثل `192.168.88.1`) وتلقى السيرفر تقرير تيليمتري من الموبايل، تُصنف حالة الراوتر على أنها `isLocalOnlyPrivateLan`.
  عند تفعيل هذا الشرط:
  1. في **قفل الطوارئ (`setEmergencyLock`)**: يقوم السيرفر بتحديث حقل `isLocked` في قاعدة بيانات PostgreSQL ويعيد `{ success: true, message: "تم تفعيل قفل الطوارئ في النظام..." }` دون إرسال أي أمر إلى الراوتر مطلقاً!
  2. في **حظر البث وتثبيت TTL (`setAntiTethering`)**: يحدث قاعدة البيانات فقط ويعيد `{ success: true }` دون لمس الراوتر!
  3. في **إنشاء بروفايل هوتسبوت (`createProfile`)**: إذا كان الراوتر `isLocalOnlyPrivateLan`، يتم تخطي الاتصال بالراوتر وحفظ البروفايل في قاعدة البيانات، وإرجاع نجاح للمستخدم مع حقل `routerSyncStatus: 'PENDING_OFFLINE'`!
  4. في **توليد الكروت (`createBatch`)**: يتم تخطي إنشاء الكروت على الراوتر، ويتم تحويل حالة الدفعة في قاعدة البيانات إلى `status: COMPLETED`! فيرى المستخدم الدفعة مكتملة بينما الراوتر لا يعلم بوجود أي كرت!
- **النتيجة:** نجاح وهمي بنسبة 100% في كافة هذه العمليات عند التعامل مع راوترات الشبكة المحلية.

---

### الخلل 2: كارثة حذف الكروت الجماعي والفردي على RouterOS 7 REST (`isHotspotUserNotFoundError`)
- **الموقع:** 
  - `apps/api/src/modules/cards/services/cards.service.ts` (السطور 236-295، 1680-1698)
  - `apps/api/src/core/mikrotik/clients/routeros-rest.client.ts` (السطور 316-320)
- **وصف الخلل:**
  1. في `RouterOsRestClient.deleteHotspotUser(name)`، يتم إرسال طلب HTTP DELETE بالشكل:  
     `DELETE /rest/ip/hotspot/user/${name}` (مثال: `DELETE /rest/ip/hotspot/user/card_883192`)
  2. واجهة REST API في RouterOS 7 **لا تدعم الحذف بالاسم في المسار**، بل تتطلب المعرف الداخلي فقط (مثل `DELETE /rest/ip/hotspot/user/*1A`).
  3. النتيجة الحتمية: يرجع راوتر MikroTik استجابة `HTTP 404 Not Found` برسالة `{"detail": "no such item"}`.
  4. في `cards.service.ts`، تقوم الدالة `isHotspotUserNotFoundError` بفحص الخطأ: وبما أنه يحتوي على `404` و `no such item`، تعتبر الدالة أن الكرت "محذوف مسبقاً من الراوتر"!
  5. يقوم السيرفر بزيادة عداد `mikrotikRemovedCount++` وحذف الكرت نهائياً من قاعدة بيانات PostgreSQL!
- **النتيجة الكارثية:** يتم حذف الكروت من لوحة التحكم وقاعدة البيانات بنجاح تام ظاهرياً للمستخدم، بينما تظل الكروت **حية وشغالة وفعالة داخل راوتر MikroTik** يستطيع أي شخص الاتصال بها مجاناً دون وجود أثر لها في النظام!

---

### الخلل 3: خطأ صياغة الأوامر في `RouterOsApiClient` (`numbers=` بدلاً من `*id`)
- **الموقع:** 
  - `apps/api/src/core/mikrotik/clients/routeros-api.client.ts` (السطور 483، 499، 508، 517، 557)
- **وصف الخلل:**
  1. في أوامر Socket Binary API لميكروتيك (المنافذ 8728/8729):
     - السطر 517: `await this.executeCommand(['/ip/hotspot/user/remove', `numbers=${target.id}`]);`
     - السطر 557: `await this.executeCommand(['/ip/hotspot/active/remove', `numbers=${targetId}`]);`
     - السطر 483: `await this.executeCommand(['/ip/hotspot/user/set', `numbers=${target.id}`]);`
     - السطر 499: `await this.executeCommand(['/ip/hotspot/user/set', `numbers=${target.id}`, '=disabled=yes']);`
  2. وفق معيار MikroTik API الرسمي:
     - كل كلمة وسيطة (Argument Word) **يجب** أن تبدأ برمز `=`. تمرير `numbers=...` بدون `=` يعتبر خطأ بنيوياً يرفضه الراوتر فوراً.
     - علاوة على ذلك، في بروتوكول API لا يتم استخدام `numbers` (فهذا خاص بـ CLI فقط)، بل يتم استخدام المعرف الداخلي المسبوق بـ `.` أي:  
       `=.id=*1A`
- **النتيجة:** فشل أوامر التعديل والحذف وفصل الجلسات عبر المقبس الثنائي (Socket API) أو عدم مطابقتها للمواصفات القياسية.

---

### الخلل 4: ابتلاع الأخطاء في تحديث بروفايل الهوتسبوت (`updateTenantProfile`)
- **الموقع:** 
  - `apps/api/src/modules/hotspot/hotspot.service.ts` (السطور 622-647)
- **وصف الخلل:**
  عند قيام المستخدم بتعديل بروفايل (السرعة Rate-Limit، أو مدة الجلسة Session-Timeout):
  ```typescript
  try {
    await client.updateHotspotProfile(profile.name, { ... });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    this.logger.warn(`Could not update profile on physical router: ${msg}`);
  }
  // ثم يواصل الكود ويقوم بتحديث قاعدة بيانات PostgreSQL!
  const updated = await this.prisma.hotspotProfile.update({ ... });
  return updated;
  ```
- **النتيجة:** إذا رفض الراوتر القيمة، أو كان غير متصل، أو فشلت الصلاحيات، يبتلع التطبيق الخطأ في `catch`، ويقوم بتحديث قاعدة البيانات، ويظهر للمستخدم إشعار أخضر: "تم تحديث الباقة بنجاح!" بينما الراوتر لا يزال يعمل بالسرعات القديمة!

---

### الخلل 5: منظومة PPPoE مفصولة بالكامل عن عملاء MikroTik المباشرين
- **الموقع:** 
  - `apps/api/src/modules/pppoe/pppoe.service.ts` (السطور 334-361، 863-885)
  - `apps/api/src/core/mikrotik/interfaces/mikrotik-client.interface.ts`
- **وصف الخلل:**
  1. واجهة `IMikrotikClient` وفئتا `RouterOsApiClient` و `RouterOsRestClient` **لا تحتوي على أي دوال لإدارة PPPoE** (لا يوجد `createPppSecret`، ولا `listPppProfiles`، ولا `deletePppSecret`، ولا `disconnectPppSession`).
  2. تعتمد خدمة `pppoe.service.ts` بالكامل وبشكل حصري على وجود `Agent` مقترن عبر جدول `AgentCommand`.
  3. إذا قام مستخدم بإضافة حساب PPPoE جديد لراوتر متصل بالسيرفر مباشرة دون تثبيت خدمة Agent على كمبيوتر محلي:
     - يتم حفظ الحساب في قاعدة البيانات بحالة `SyncStatus.PENDING`.
     - يعيد السيرفر كود `201 Created` مع بيانات الحساب.
     - الواجهة تعرض: "تم إنشاء حساب المشترك بنجاح".
     - على أرض الواقع: **لم يتم إرسال أي بايت إلى الراوتر إطلاقاً** لأن العميل البرمجي لا يمتلك الكود اللازم لإنشائه!
- **النتيجة:** انفصال كامل بين حسابات المشتركين على السيرفر والراوتر.

---

### الخلل 6: منظومة رفع صفحات تسجيل الدخول (Hotspot Portal) غير قابلة للتنفيذ المباشر
- **الموقع:** 
  - `apps/api/src/modules/portal/portal.service.ts` (السطور 34-36، 608-730)
- **وصف الخلل:**
  1. **تخزين القوالب في الذاكرة العشوائية:** `tenantTemplates = new Map(...)` يتم حفظ قوالب الصفحات في متغير RAM داخل السيرفر بدلاً من حفظها في قاعدة بيانات PostgreSQL! عند إعادة تشغيل السيرفر أو عمل Deploy تُفقد كافة القوالب المعدلة.
  2. **استدعاء دالة خاصة غير موجودة على عميل REST:** السطر 617 و 705 يستدعي `(client as any).executeCommand(...)`؛ هذه الدالة `private` في عميل Socket، و**غير موجودة تماماً** في عميل REST (مما يسبب `TypeError: client.executeCommand is not a function`).
  3. **استخدام أمر منقرض في RouterOS 7 (`/file/add`):**
     - في RouterOS 7 تم حذف أمر `/file/add` نهائياً من النظام.
     - في RouterOS 6، كتابة الملفات عبر `/file/set =contents=...` محدودة بـ 4096 بايت (4KB) فقط وتفشل تماماً مع الصور والملفات الثنائية والصفحات الكاملة، ولا تنشئ المجلدات الفرعية.
  4. عند فشل النشر المباشر وكان الراوتر ذا IP محلي، يتم إرجاع حالة `LOCAL_DEPLOY_REQUIRED` مع وضع حالة القالب `syncStatus = 'SYNCED'` كذباً!
- **النتيجة:** رفع صفحات الهوتسبوت يعطي نجاحاً أو حالة معلقة ولا ينعكس فعلياً على ملفات الراوتر ولا يغير مسار صفحة الهوتسبوت في بروفايل الخادم.

---

### الخلل 7: غياب المزامنة العكسية التلقائية (WinBox / CLI -> App Sync)
- **الموقع:** 
  - `apps/api/src/modules/hotspot/hotspot.service.ts` (السطور 89-106)
  - `apps/api/src/modules/sync`
- **وصف الخلل:**
  1. عند طلب قائمة البروفايلات `listProfiles`، يقرأ السيرفر مباشرة من جدول `hotspotProfile` في PostgreSQL، ولا يستعلم من الراوتر!
  2. إذا دخل مسؤول الشبكة عبر WinBox وقام بحذف بروفايل أو تعديل سرعته أو إضافة بروفايل جديد، فإن التطبيق يظل يعرض البيانات القديمة المخزنة محلياً.
  3. لا توجد وظيفة دورية (Cron / Background Job) للتحقق من تطابق البروفايلات والمستخدمين وسحب التغييرات الخارجية.
  4. المزامنة الوحيدة الموجودة هي زر يدوي `syncProfiles` مخصص لبروفايلات الهوتسبوت فقط، ولا يشمل المستخدمين أو PPPoE أو الملفات.
- **النتيجة:** فقدان صفة "المصدر الحقيقي للبيانات" من الراوتر وتحول التطبيق إلى جزر بيانات معزولة.

---

### الخلل 8: الغياب التام لتكامل User Manager
- **الموقع:** المشروع بالكامل.
- **وصف الخلل:**
  النظام مبني على جداول `/ip/hotspot/user` و `/ppp/secret` فقط. لا توجد أي خدمة أو أمر أو موديل يتعامل مع حزمة User Manager الخاصة بميكروتيك (سواء `/tool user-manager` لإصدار RouterOS 6 أو حزمة `/user-manager` الجديدة في RouterOS 7).
- **النتيجة:** عدم وجود هذه الميزة في الكود الحالي، ويجب توثيق حدودها بوضوح.

---

## 5. مصفوفة تدقيق العمليات: الفعلي مقابل المحلي والوهمي

| العملية الوظيفية | مدخل العملية | كيف تعمل حالياً؟ | التصنيف الهندسي | التأثير على الراوتر |
|---|---|---|---|---|
| **قراءة الجلسات الحية** | `GET /hotspot/sessions` | تستعلم فعلياً من الراوتر عبر `/ip/hotspot/active/print` | ✅ **REAL_EXECUTION** | قراءة حقيقية من الراوتر |
| **طرد مستخدم هوتسبوت** | `POST /sessions/:id/kick` | ينفذ `/ip/hotspot/active/remove` (يعمل إذا صلح المعرف) | ⚠️ **PARTIAL_DEFECT** | يفشل على بعض الراوترات لخطأ `numbers=` |
| **إنشاء بروفايل هوتسبوت** | `POST /hotspot/profiles` | ينفذ على الراوتر إذا كان Public؛ إذا كان Private LAN يحفظ في DB فقط! | ❌ **FAKE_SUCCESS** (في Private LAN) | لا يصل للراوتر إطلاقاً في الشبكات المحلية |
| **تعديل بروفايل هوتسبوت** | `PATCH /hotspot/profiles/:id` | يبتلع أخطاء الراوتر ويحدث DB ويعيد 200 نجاح | ❌ **FAKE_SUCCESS** | تظهر القيمة الجديدة في التطبيق وتبقى القديمة في الراوتر |
| **حذف بروفايل هوتسبوت** | `DELETE /hotspot/profiles/:id` | يرفض الحذف من DB إذا فشل الراوتر (كود منضبط) | ✅ **REAL_VERIFIED** | محمي ولا يعطي نجاحاً وهمياً |
| **توليد دفعة كروت** | `POST /cards/batches` | ينشئ في DB؛ إذا كان Private LAN يحول الدفعة إلى COMPLETED دون مس الراوتر | ❌ **FAKE_SUCCESS** (في Private LAN) | كروت منشأة في التطبيق ومعدومة على الراوتر |
| **مزامنة دفعة للراوتر** | `POST /cards/batches/:id/sync` | يكرر إنشاء المستخدمين على الراوتر ويحدث حالة الكروت | ⚠️ **PARTIAL_WORKING** | يعمل على Public، معطل تماماً على Private LAN |
| **حذف كروت هوتسبوت** | `POST /cards/bulk-delete` | على ROS7 REST يفسر 404 كنجاح ويحذف من DB ويبقى في الراوتر | ❌ **DANGEROUS_FAKE_SUCCESS** | حذف محلي مع بقاء الكروت شغالة على الراوتر |
| **حظر البث (TTL)** | `POST /devices/:id/anti-tethering` | إذا كان Private LAN يحدث DB فقط ويعيد نجاحاً | ❌ **FAKE_SUCCESS** | لم تتغير قواعد جدار الحماية على الراوتر |
| **قفل الطوارئ** | `POST /devices/:id/lock` | إذا كان Private LAN يحدث DB فقط ويعيد نجاحاً | ❌ **FAKE_SUCCESS** | لم يتم قفل حركة المرور على الراوتر |
| **نشر صفحة تسجيل الدخول** | `POST /portal/.../publish` | يستدعي أوامر مقابس غير مدعومة في REST وتخزين القالب في RAM | ❌ **FAILED / FAKE_SUCCESS** | لا ترفع الملفات بشكل سليم على الراوتر |
| **إنشاء حساب PPPoE** | `POST /pppoe/accounts` | يحفظ في DB فقط إذا لم يكن هناك Agent قيد التشغيل ويعيد 201 | ❌ **FAKE_SUCCESS** (بدون Agent) | حساب موجود في التطبيق ومعدوم على الراوتر |
| **مزامنة البيانات العكسية** | تحديث الشاشات | تقرأ من قاعدة البيانات المحلية دون مطابقة الراوتر | ❌ **LOCAL_ONLY** | لا يكتشف تغييرات WinBox الخارجية |

---

## 6. الأسباب الجذرية للمشكلة (Root Causes)

1. **الافتراض الخاطئ لعزل الشبكات المحلية (Private LAN Bypass Fallback):**  
   بدلاً من مطالبة المستخدم بوسيلة اتصال حقيقية أو إعادة خطأ صريح بأن الراوتر غير قابل للوصول، تم تصميم النظام ليقوم بـ "تخطي" التنفيذ على الراوتر وحفظ البيانات في قاعدة البيانات تحت مظلة "المزامنة اللاحقة"، مع إرجاع استجابات نجاح للواجهة الأمامية توحي باكتمال العملية!
2. **عدم مطابقة معرفات الموارد في RouterOS 7 REST API:**  
   الاعتماد على اسم المورد (Name) بدلاً من معرفه الفريد الداخلي (`.id`) في مسارات REST، مما تسبب في أخطاء 404 تم تفسيرها بشكل كارثي على أنها تعني عدم وجود العنصر أو حذفه مسبقاً.
3. **أخطاء صياغة وسائط المقبس الثنائي (Socket API Syntax):**  
   إرسال معلمات مثل `numbers=...` بدلاً من `=.id=...` متجاهلاً متطلبات بروتوكول MikroTik الصارمة ببدء كل كلمة برمز `=`.
4. **ابتلاع الاستثناءات (Exception Swallowing):**  
   استخدام كتل `try/catch` فارغة أو مقتصرة على `logger.warn` داخل خدمات أساسية، مما يمنع انتقال الاستثناء إلى وحدة التحكم فيتم إرجاع استجابة HTTP 200 افتراضية.
5. **انعدام طبقة التنفيذ والتحقق الموحدة (Missing Verification Layer):**  
   لا توجد طبقة تضمن التسلسل الإلزامي: **[تحقق مسبق -> تنفيذ على الراوتر -> قراءة تأكيدية من الراوتر -> تحديث قاعدة البيانات]**.
6. **فقدان تكامل PPPoE المباشر في عملاء MikroTik:**  
   ترك خدمات PPPoE معتمدة على الوكيل فقط دون توفير مسار اتصال مباشر عبر API/REST.

---

## 7. خطة الإصلاح الهندسية المقترحة (Proposed Engineering Remediation Plan)

### المرحلة 2: إصلاح وتوحيد طبقة الاتصال المركزية (Centralized Connection Layer)
1. تحديث `RouterOsApiClient` و `RouterOsRestClient` وتطبيق واجهة `IMikrotikClient` بالكامل.
2. تصحيح جميع صياغات الأوامر (`=.id=${target.id}` بدلاً من `numbers=`).
3. إضافة حل ديناميكي للمعرفات في عميل REST (البحث عن `.id` المطابق للاسم قبل إرسال PATCH أو DELETE).
4. إضافة دعم كامل لكافة عمليات PPPoE المباشرة (`createPppSecret`، `updatePppSecret`، `deletePppSecret`، `createPppProfile`، `deletePppProfile`، `listPppActiveSessions`، `disconnectPppSession`).
5. إضافة دعم حقيقي لإدارة الملفات في الراوتر (`listFiles`، `uploadFile`، `deleteFile`).

### المرحلة 3: بناء خط أنابيب التنفيذ والتحقق الإلزامي (Execution & Verification Pipeline)
إنشاء خدمة مركزية موحدة لتنفيذ الأوامر تتبع تسلسلاً صارماً:
```
1. استلام الطلب والتحقق من المدخلات
2. فحص اتصال الراوتر الفعلي والتأكد من استجابته
3. تنفيذ الأمر الفعلي على الراوتر المستهدف
4. التحقق بإعادة القراءة الفورية من الراوتر (Read-After-Write Verification)
5. مقارنة القيمة المرجعة بالقيمة المطلوبة
6. في حال النجاح المؤكد 100%: تحديث قاعدة البيانات
7. في حال الفشل: رفض العملية وإرجاع الخطأ الحقيقي للمستخدم مع بقاء قاعدة البيانات نقية
```
**قاعدة ذهبية:** إلغاء أي تحديث محلي في حال تعذر الوصول للراوتر أو فشل التنفيذ.

### المرحلة 4: مراجعة وإصلاح كافة الخدمات الفرعية
- **Hotspot Profiles:** منع ابتلاع الأخطاء في التعديل، التحقق من التعديل على الراوتر، وإزالة التخطي في الشبكات المحلية.
- **Hotspot Users & Cards:** إصلاح الحذف الجماعي والفردي، تصحيح `isHotspotUserNotFoundError`، والتأكد من وجود كل كرت فعلياً على الراوتر قبل وضع علامة `SYNCED`.
- **Hotspot Login Pages:** نقل تخزين القوالب إلى جدول بقاعدة البيانات، واستخدام آلية رفع ملفات حقيقية ومتوافقة مع إصدارات RouterOS 6 و 7، والتأكد من وجود الملفات في الراوتر قبل تحويل المسار.
- **PPPoE Management:** ربط PPPoE بعميل MikroTik المباشر، وتحديث الراوتر لحظياً عند إضافة أو تعديل أو حذف أي اشتراك.
- **Router Device Control:** تصحيح قفل الطوارئ وحظر البث ليتم إرسالهما كقواعد جدار حماية حقيقية للراوتر، وحظر النجاح الوهمي في غياب الاتصال.

### المرحلة 5: هندسة المزامنة ثنائية الاتجاه (Two-Way Sync Architecture)
- بناء محرك مزامنة دوري واستدعائي:
  - عند المزامنة، يتم جلب البيانات من الراوتر ومقارنتها بقاعدة البيانات.
  - العناصر المضافة عبر WinBox يتم استيرادها تلقائياً للنظام.
  - العناصر المحذوفة من WinBox يتم تحديث حالتها في النظام لتطابق الواقع.
  - إظهار طابع زمني دقيق لآخر مزامنة ناجحة وحالة الاتصال الحقيقية.

### المرحلة 6: الاختبارات الميدانية والآلية الصارمة (Verification & Tests)
- كتابة اختبارات تكامل آلية شاملة تغطي حالات الخطأ، انقطاع الاتصال، والتحقق بعد الكتابة.
- التحقق الفعلي بالدليل القاطع: **Evidence > Claims**.

---

**جاهز للانتقال إلى المرحلة التالية فور الاعتماد.**
