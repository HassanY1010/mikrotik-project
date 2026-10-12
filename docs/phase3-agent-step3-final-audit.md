# تقرير المراجعة الفنية والأمنية النهائية — Phase 3: Step 3
## SudaFi Cloud Platform — Windows LAN Agent Final Operational Audit

**تاريخ المراجعة:** 11 أكتوبر 2026  
**المسار الأساسي:** `E:\microTik_project`  
**الحالة:** مكتمل ومُدقّق وشامل — جاهز للتجربة الميدانية بعد الاعتماد  

---

## 1. الملخص التنفيذي (Executive Summary)

أُجريت مراجعة نهائية صارمة وشاملة للكود والتوافق التشغيلي لتطبيق **Windows LAN Agent** (`apps/agent`) وعلاقته بالـ **Backend API** (`apps/api/src/modules/agent`).  
هدفت هذه المراجعة إلى استكشاف أي تباين في عقود البيانات (DTOs)، وتدقيق أمان تشفير الأسرار محلياً، وإحكام بروتوكول التوفيق (Router Reconciliation)، وضمان أمان اتصالات MikroTik Socket API و TLS، وبناء اختبارات تكامل حيّة تحاكي سيناريوهات التشغيل الواقعية.

### أهم نتائج وتصحيحات المراجعة:
1. **تصحيح تباينات DTOs وعقود الـ API:**
   - اكتشاف وتصحيح عدم تطابق اسم حقل رمز الإقران (`pairingCode` مقابل `code`) الذي كان سيتسبب في رفض طلب الإقران بـ `400 BadRequest` بسبب تفعيل `forbidNonWhitelisted: true`. تم تحديث الطرفين لدعم الحقلين بالتوازي.
   - تصحيح تباين أسماء مقاييس النبضات (`uptimeSeconds` و `freeMemoryBytes` مقابل `agentUptimeSeconds` و `memoryUsage`).
2. **ترقية تشفير الأسرار إلى Windows DPAPI الأصيل:**
   - استبدال الاشتقاق القائم على بصمة النظام بآلية **Windows Data Protection API (DPAPI)** الأصيلة بنطاق `CurrentUser`، المدعومة بحماية LSA و TPM، مع توفير fallback مشفر بـ AES-256-GCM وتقييد أذونات NTFS بـ `icacls`.
3. **إحكام بروتوكول التوفيق ومنع تكرار الأثر (Router Reconciliation):**
   - لم يعد وجود اسم المستخدم دليلاً كافياً على مطابقة البطاقة؛ تم تحديث منطق الفحص لمقارنة الـ `profile` والـ `comment` الفعلي على الراوتر. إذا تطابقا، يُعتبر الأمر تكراراً آمناً (`alreadyExistingCount`). وإذا اختلفا، يُعتبر **تعارض أسماء (Conflict)** ويُرفض فوراً لحماية بيانات الراوتر من التعديل العشوائي.
4. **أمان اتصال MikroTik وشهادات TLS:**
   - إلغاء التجاوز الافتراضي للشهادات (`rejectUnauthorized: false`)، وفرض التحقق الصارم من شهادات TLS على المنفذ 8729 مع دعم مسار شهادة المرجع المصدق (`caCertPath`).
   - إضافة مهلة تنفيذ للأوامر (Command Timeout) على مستوى المقبس لمنع تجمد الوكيل عند بطء الراوتر.
5. **جاهزية تشغيل وتوزيع Windows:**
   - إنشاء مشغلات Windows تنفيذية مباشرة (`sudafi-agent.cmd` و `sudafi-agent.ps1`)، مع نصوص تثبيت وإلغاء الخدمة في Task Scheduler على إقلاع النظام (`install-windows-service.bat` و `uninstall-windows-service.bat`).
6. **نتائج الاختبارات:**
   - **37 اختباراً للوكيل ناجحة بنسبة 100%** (شاملة جناح اختبارات التكامل HTTP الكامل).
   - **164 اختباراً للـ Backend ناجحة بنسبة 100%**.
   - **الإجمالي العام: 201 اختبار ناجح عبر 26 جناح اختبار (0 فشل، 0 تراجع).**

---

## 2. مراجعة التوافق التشغيلي بين Agent و Backend

### 2.1 المشكلات المكتشفة في العقود والتصحيحات المنفذة

| المكون / الحقل | المشكلة المكتشفة | مستوى الخطورة | الإجراء التصحيحي المنفذ |
| :--- | :--- | :---: | :--- |
| **مسار الإقران (`/agent/pair`)** | كان عميل الوكيل يرسل الحقل باسم `code`، بينما الـ Backend في `PairAgentDto` يتطلب `pairingCode` حصراً ويرفض أي خاصية إضافية بسبب `forbidNonWhitelisted`. | **عالي جداً** (يمنع الإقران) | - عُدّل `api-client.ts` ليرسل `pairingCode: code` و `code`.<br>- عُدّل `PairAgentDto` و `agent.service.ts` لقبول `pairingCode` و `code` كاسمين مترادفين مع التحقق من النمط `^\d{6}$`. |
| **مقاييس النبضات (`AgentHeartbeatDto`)** | كان الوكيل يرسل `agentUptimeSeconds` و `memoryUsage`، بينما الـ Backend كان يتوقع `uptimeSeconds` و `freeMemoryBytes`. | **عالي** (يرفض النبضة بـ 400) | - تم توحيد الواجهات في `types/index.ts` و `agent-daemon.ts` لترسل `uptimeSeconds` و `freeMemoryBytes`.<br>- أُضيفت أسماء الحقول البديلة في `AgentMetricsDto` لضمان عدم رفض أي استدعاء قديم. |
| **تسليم نتائج الأوامر (`/agent/commands/:id/result`)** | التحقق من مطابقة الحقول: `operationId` (UUIDv4)، `status` ('COMPLETED' \| 'FAILED')، `result` (Object)، `errorMessage` (String). | **سليم** | تم التحقق من تطابق البنية بين `SubmitCommandResultDto` و `SubmitResultPayload`. |
| **مسارات الـ API والبادئة (Versioning)** | ضبط الـ Backend يعتمد البادئة `api/v1` عبر `VersioningType.URI`. | **سليم** | تم التأكد من أن `serverUrl` الافتراضي في الوكيل يتضمن البادئة الصحيحة (`http://localhost:3000/api/v1`). |

---

## 3. مراجعة تشفير بيانات الاعتماد (Credential Security & DPAPI)

### 3.1 تقييم الحالة السابقة
- كانت الآلية السابقة تشتق مفتاحاً باستخدام `scryptSync` من عناصر عامة لنظام التشغيل (`hostname`, `username`, `arch`, `platform`).
- هذه العناصر معلومة لأي مستخدم على نفس الجهاز، وبالتالي لا يمكن وصفها تقنياً بأنها "Machine-bound" موثوقة.

### 3.2 الحل المنفذ: Windows DPAPI الأصيل
تمت ترقية [`CredentialVault`](file:///E:/microTik_project/apps/agent/src/security/credential-vault.ts) لدعم **Windows Data Protection API (DPAPI)**:
- **نطاق الحماية:** `DataProtectionScope::CurrentUser`.
- **الارتباط الأمني:** المفتاح مشفر ومحمي بواسطة نواة نظام Windows (LSA - Local Security Authority) ومربوط ببيانات اعتماد جلسة المستخدم المسجل ومفتاح الجهاز (TPM/Master Key).
- **أثر النقل والتلف:**
  - إذا تم نسخ الملف المشفر إلى جهاز كمبيوتر آخر، أو حاول مستخدم Windows آخر على نفس الجهاز قراءته، تفشل عملية فك التشفير برمجياً بواسطة نظام التشغيل، ويعيد التابع `load()` القيمة `null` فوراً بأمان تام دون تسريب البيانات.
  - إذا تلف الملف، يعيد `load()` القيمة `null` ويطلب إعادة الإقران.
- **تقييد أذونات NTFS:** يُنشأ الملف بصلاحية `0o600` مع تطبيق أمر `icacls` لحظر التوريث وحصر الوصول بمستخدم Windows المشغل للوكيل:
  ```cmd
  icacls credentials.enc /inheritance:r /grant:r "%USERNAME%:(R,W)"
  ```
- **حماية السجلات:** لا يتم طباعة الـ `token` أو كلمات مرور الراوتر في أي سجل خروج أو رسالة استثناء.
- **حدود الحماية (Security Boundaries):**
  - تحمي DPAPI الملف المشفر من الهجمات من خارج نظام التشغيل، ومن المستخدمين الآخرين على نفس النظام، ومن نسخ القرص الصلب (Offline Attack).
  - أي تطبيق يعمل بنفس هوية مستخدم Windows الفعلي (Same User Context) يملك صلاحية استدعاء DPAPI لفك التشفير، وهو السلوك المعياري لنظام Windows لحماية أسرار التطبيقات (مثل Chrome و Outlook).

---

## 4. مراجعة منع تكرار الأوامر وبروتوكول التوفيق (Router Reconciliation)

في أمر `hotspot.user.batch_add`:
> [!IMPORTANT]
> **قاعدة أمان:** وجود اسم المستخدم على الراوتر **لا يعني بالضرورة** أن المستخدم هو نفس البطاقة المطلوبة، فقد يكون حساباً إدارياً قديماً، أو بطاقة من شبكة أخرى لها نفس الكود.

### 4.1 منطق التوفيق الجديد المعتمد
عند محاولة إضافة مستخدم وتلقي رد الخطأ من MikroTik:
`already have user with this name`
يقوم الوكيل بتنفيذ بروتوكول التوفيق الدقيق:
1. استعلام الراوتر عن تفاصيل المستخدم الحالي: `/ip/hotspot/user/print ?name=<اسم_المستخدم>`.
2. استخراج الخصائص المقروءة: `profile` و `comment`.
3. التحقق والمقارنة:
   - **حالة التطابق (Safe Idempotency):** إذا كان الـ `profile` مطابقاً، والـ `comment` مطابقاً لرمز الدفعة المستهدفة، يُثبت أن البطاقة أُضيفت بالفعل في محاولة سابقة انقطع بعدها الاتصال (Lost Ack). تُسجل العملية كـ `alreadyExistingCount++` وتُعتبر البطاقة ناجحة ومكتملة دون تعديل.
   - **حالة التعارض (Collision / Conflict):** إذا كان الـ `profile` مختلفاً، أو الـ `comment` مختلفاً، يُعتبر ذلك **تعارض أسماء مع مستخدم أجنبي موجود مسبقاً على الراوتر**. يتم إلغاء الإضافة وتسجيلها كـ `failedCount++` مع رسالة خطأ واضحة:
     ```
     Conflict: Pre-existing user has mismatched attributes (profile: "X", comment: "Y"). Creation aborted to prevent data corruption.
     ```
4. **حظر تغيير كلمات المرور:** لا يقوم الوكيل إطلاقاً بتغيير كلمة مرور أي مستخدم موجود مسبقاً على الراوتر دون أمر صريح ومستقل.

---

## 5. مراجعة اتصال MikroTik وأمان Socket API

1. **إلغاء التجاوز غير الآمن لشهادات SSL:**
   - تم تعديل [`RouterOsWorker`](file:///E:/microTik_project/apps/agent/src/router/routeros-worker.ts) لإلغاء `rejectUnauthorized: false` الافتراضية.
   - أصبح التحقق من الشهادة مفعلاً افتراضياً (`rejectUnauthorized: true`).
   - تم دعم خيار `caCertPath` في الإعدادات للسماح بتمرير شهادة الـ CA الخاصة براوتر MikroTik عند استخدام API-SSL على المنفذ 8729.
   - إذا اختار المستخدم صراحة تعطيل التحقق (`rejectUnauthorized: false`) لراوتر تجريبي محلي، يتم تسجيل تحذير أمني واضح في السجلات.
2. **منع تجمد المقابس (Socket Stalls):**
   - تم تزويد التابع `executeCommand` بمهلة تنفيذ مستقلة (`timeoutMs`، افتراضياً 15 ثانية) تقوم بإنهاء المقبس ورمي استثناء إذا توقف الراوتر عن الرد على مستوى الأمر الفردي.
3. **متطلبات حساب مستخدم MikroTik:**
   - لعمل الوكيل، يجب إنشاء مستخدم خاص في MikroTik مع صلاحيات محددة:
     ```routeros
     /user group add name=sudafi-agent policy=api,read,write,test
     /user add name=sudafi-worker group=sudafi-agent password="STRONG_PASSWORD"
     ```
   - لا يحتاج الوكيل لصلاحيات `full` أو `policy` الحساسة لحماية الراوتر من أي استغلال.

---

## 6. اختبار التكامل الآمن (Full Integration Suite)

تم إنشاء جناح اختبارات تكامل حيّ كامل:
[`apps/agent/src/integration/agent-backend-integration.spec.ts`](file:///E:/microTik_project/apps/agent/src/integration/agent-backend-integration.spec.ts)

يعتمد هذا الجناح على خادم HTTP محلي أصيل يحاكي بدقة عقود الـ Backend، مع تشغيل نسخة كاملة من `AgentDaemon` و `ApiClient` و `MockRouterWorker`.

### الحالات الثمانية المختبرة ونتائجها:
1. **الإقران والتوثيق:** التحقق من رمز الإقران، إصدار التوكن، وتخزينه مشفراً بنجاح $\rightarrow$ **PASS**.
2. **رفض رمز الإقران غير الصحيح أو المنتهي:** الرفض بـ 401 والبقاء في حالة `UNPAIRED` $\rightarrow$ **PASS**.
3. **النبضات وتغير الحالة:** إرسال النبضة الدورية بنجاح وتحول الحالة إلى `ONLINE` $\rightarrow$ **PASS**.
4. **استلام وتنفيذ الأوامر المعتمدة:** استلام أمر `hotspot.user.batch_add`، تنفيذه، وإرسال نتيجته للخادم بنجاح $\rightarrow$ **PASS**.
5. **معالجة الرد المفقود (Lost Ack) والتوفيق:** إعادة إرسال نفس الأمر بعد انقطاع الاتصال، وتعرف الوكيل على وجود البطاقات مسبقاً وتوثيقها كـ `alreadyExistingCount = 1` دون تكرار إنشائها $\rightarrow$ **PASS**.
6. **حظر الأوامر غير المعتمدة:** رفض محاولة إرسال أمر `system.terminal.exec`، وتقرير فشله فوراً دون تنفيذه على الراوتر $\rightarrow$ **PASS**.
7. **انقطاع الاتصال واستعادته:** محاكاة سقوط الشبكة وتحول الوكيل إلى `RECONNECTING`، ثم العودة التلقائية إلى `ONLINE` فور عودة الخدمة $\rightarrow$ **PASS**.
8. **اكتشاف التوكن الملغى:** عند إلغاء التوكن من لوحة التحكم، استلام 401 وتوقف الوكيل فوراً مع التحول إلى `REVOKED` $\rightarrow$ **PASS**.

---

## 7. جاهزية تشغيل وتوزيع Windows

تم تجهيز أدوات التوزيع والتشغيل لنظام Windows داخل `apps/agent`:
1. **مشغل الأوامر التنفيذي المباشر:**
   [`apps/agent/sudafi-agent.cmd`](file:///E:/microTik_project/apps/agent/sudafi-agent.cmd)
   يتيح تشغيل أي أمر من موجه أوامر Windows مباشرة:
   ```cmd
   sudafi-agent.cmd pair --code 123456
   sudafi-agent.cmd run
   sudafi-agent.cmd status
   ```
2. **مشغل PowerShell المعتمد:**
   [`apps/agent/sudafi-agent.ps1`](file:///E:/microTik_project/apps/agent/sudafi-agent.ps1)
3. **مثبت خدمة Windows التلقائية (Startup Task):**
   [`apps/agent/scripts/install-windows-service.bat`](file:///E:/microTik_project/apps/agent/scripts/install-windows-service.bat)
   يقوم بتسجيل مهمة مجدولة في Windows Task Scheduler لتعمل تلقائياً عند إقلاع النظام بأعلى الصلاحيات (`ONSTART`).
4. **مزيل الخدمة:**
   [`apps/agent/scripts/uninstall-windows-service.bat`](file:///E:/microTik_project/apps/agent/scripts/uninstall-windows-service.bat)

---

## 8. ملخص نتائج الاختبارات الفعلي

```
------------------------------------------------------------------------------------------------------
 المشروع / الجناح                     | عدد الأجنحة | عدد الاختبارات | النتيجة
------------------------------------------------------------------------------------------------------
 @mikrotik-saas/agent (الوحدة + التكامل) | 6           | 37             | 100% نجاح (0 فشل)
 @mikrotik-saas/api (الـ Backend)       | 20          | 164            | 100% نجاح (0 فشل)
------------------------------------------------------------------------------------------------------
 الإجمالي الكلي                         | 26          | 201            | 100% نجاح كامل
------------------------------------------------------------------------------------------------------
 بناء الحزم (Build Verification)        | clean build (exit status 0) لجميع الحزم
------------------------------------------------------------------------------------------------------
```

---

## 9. ما لا يزال يحتاج إلى اختبار على راوتر حقيقي (Real-World Test Matrix)

> [!CAUTION]
> **إقرار بالشفافية والحدود الميدانية:**
> جميع الاختبارات الحالية نُفذت باستخدام Mocks، واختبارات تكامل Loopback شبكية حقيقية، ومحاكي RouterOS متكامل.  
> **قبل وضع الوكيل في الإنتاج التجاري، يجب تنفيذ مصفوفة الاختبارات الميدانية التالية على راوتر MikroTik حقيقي في بيئة معزولة (Lab Router):**
> 1. اختبار المصادقة الحقيقية على RouterOS v6 (Challenge-Response) و RouterOS v7 (Plain API login) باستخدام اسم مستخدم وكلمة مرور فعلية.
> 2. اختبار الاتصال عبر منفذ 8729 بشهادة SSL حقيقية مصدرة من الراوتر.
> 3. اختبار إضافة 100 بطاقة هوتسبوت حقيقية وفحص استهلاك موارد معالج الراوتر والذاكرة أثناء الإضافة.
> 4. محاكاة فصل كابل الشبكة من الراوتر أثناء إضافة البطاقات للتحقق الميداني من بروتوكول التوفيق.
> 5. اختبار التشغيل بعد إعادة تشغيل جهاز الكمبيوتر (Windows Reboot) والتحقق من عمل المهمة المجدولة عبر Task Scheduler.

---

## 10. التوقف للمراجعة (Hold for Approval)

التزاماً بالقيود الإلزامية:
- لم يتم الاتصال بأي راوتر عميل دون تصريح.
- لم يتم النشر إلى Render أو تعديل إعداداته.
- لم يتم تنفيذ أي Migration على قاعدة بيانات الإنتاج.
- لم يتم تعديل وظائف البطاقات أو الاشتراكات أو الحصص.
- لم يبدأ العمل على PPPoE.

**توقف العمل هنا تماماً بانتظار مراجعة وتوجيهات الإدارة.**
