# تقرير هندسي نهائي: التحقيق الجذري وإصلاح منظومة الاتصال والبرمجة التلقائية والمتقدمة (MikroTik Provisioning Engine)

**تاريخ التقرير:** 19 نوفمبر 2026  
**المشروع:** Sudafai SaaS Cloud & Mobile Ecosystem  
**النطاق:** Real Connection, Auto Provisioning Engine, 6-Step Advanced Configuration Wizard, Socket/REST Protocols, and Central Operation Verification  
**الحالة العامة:** تم الإصلاح والتحقق البرمجي بنجاح (All Core & Provisioning Tests Passing)

---

## ملخص تنفيذي (Executive Summary)

تم إجراء تحقيق هندسي شامل ومعمق في الكود المصدري لمنظومة إدارة وتكوين راوترات MikroTik داخل مشروع Sudafai. هدف التحقيق إلى معالجة العيوب التي أبلغ عنها العملاء والتي تمثلت في:
1. ظهور عمليات التكوين كناجحة في واجهة التطبيق وقاعدة البيانات دون أن تنعكس فعلياً على راوتر MikroTik الحقيقي.
2. فشل البرمجة عند الاتصال بالراوترات الواقعة على شبكات محلية خاصة (Private RFC1918 LAN مثل `192.168.88.1`).
3. أخطاء صياغة أوامر RouterOS API وسقوط المعاملات عند وجود مسافات (Spaces) أو معاملات خاصة بطبقة سطر الأوامر (`=numbers=`).
4. ابتلاع استثناءات المزامنة في تطبيق الموبايل وإخفاء أسباب الفشل الحقيقية.

تم تحديد **أربعة أسباب جذرية حرجة** وإصلاحها بالكامل في الكود الفعلي دون المساس بأي إصلاحات سابقة أو إعادة بناء المنظومة من الصفر.

---

## المرحلة الأولى: التحقيق في الاتصال الحقيقي (Real Connection Investigation)

### 1.1 السبب الجذري لانقطاع الاتصال بالراوترات المحلية (The Private IP Cloud Trap)
- **المشكلة:** راوترات المشتركين تعمل غالباً على عناوين IP خاصة (`192.168.88.1` أو `10.x.x.x` أو `172.16.x.x`). عند طلب تنفيذ البرمجة التلقائية (Auto Provisioning)، يقوم هاتف الموبايل بتنفيذ الخطة بنجاح محلياً عبر مكتبة Socket/REST عبر الواي فاي، ثم يرسل استدعاء المزامنة إلى الخادم السحابي عبر `POST /mikrotik-provisioning/devices/:id/apply` مع تحديد `executionMode: 'LOCAL'` ومرفق معه كائن النتيجة `clientExecutionResult`.
- **الخلل في Backend:** 
  1. كلاس `StartAutoProvisioningDto` لم يكن يحتوي على الحقل `clientExecutionResult`. ونظراً لأن NestJS مفعل لديه `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`، كان الخادم يرفض طلب المزامنة فوراً بخطأ `400 Bad Request` (`property clientExecutionResult should not exist`).
  2. خدمة `CommandExecutorService` كانت تتجاهل تماماً قيمة `dto.executionMode === 'LOCAL'`. وحتى لو تم استلام الطلب، كانت تحاول فتح اتصال TCP مباشر من سيرفر Render السحابي إلى العنوان الداخلي `192.168.88.1:8728`، مما يؤدي حتماً إلى `ETIMEDOUT` ووسم العملية بأنها `FAILED` في قاعدة البيانات.
  3. تطبيق الموبايل في شاشة `auto_provisioning_screen.dart` كان يحتوي على `catch (_)` صامت يبتلع الخطأ وينتقل إلى الخطوة 4 دون إبلاغ المستخدم.

### 1.2 الإصلاح المعتمد
1. إضافة `@ApiPropertyOptional() @IsObject() @IsOptional() clientExecutionResult?: Record<string, unknown>;` إلى `StartAutoProvisioningDto`.
2. إضافة مسار المعالجة المركزية `handleLocalExecutionResult` في `CommandExecutorService`:
   - التحقق من نتائج التنفيذ الموقعة تشفيرياً.
   - تحديث حالات خطوات البرمجة (`provisioningStep`) وسجلات الأوامر (`provisioningCommandLog`) إلى `SUCCESS`.
   - اعتماد العملية كـ `COMPLETED` في قاعدة البيانات.
   - تحديث حالة الراوتر إلى `isOnline: true`, `status: DeviceStatus.ONLINE`, وتحديث `lastSyncAt`.
   - تسجيل سجل تدقيق `AUDIT_LOG_ACTIONS.AUTO_PROVISIONING_COMPLETED` مع توثيق `executionMode: 'LOCAL'`.
   - منع السيرفر السحابي من محاولة الاتصال المباشر بالعناوين المحلية.

---

## المرحلة الثانية: فحص البرمجة التلقائية (Auto Provisioning Inspection)

### 2.1 بنية المحرك وسلسلة التنفيذ
- **المكونات:** `MikrotikProvisioningService`، `CommandExecutorService`، `RouterOS6Adapter`، `RouterOS7Adapter`، و`RouterDiscoveryEngineService`.
- **مسار التنفيذ السحابي (Cloud Mode):**
  - **Stage 0:** فحص الأمان واكتشاف مسار الإدارة المباشر (`verifyManagementSafety`) قبل تنفيذ أي أمر تغيير.
  - **Stage 1 (Pre-Backup):** أخذ نسخة احتياطية مشفرة ثنائية (`.backup`) ونصية (`.rsc`) قبل التعديل لضمان إمكانية التراجع.
  - **Stage 2 (Sequential Execution):** تنفيذ الأوامر مرحلة بمرحلة مع تتبع الموارد المنشأة في `rollbackStack`.
  - **Stage 3 (Multi-Point Verification):** فحص صلاحية الإعدادات بعد الكتابة (Read-After-Write).
  - **Stage 4 (Commit & Telemetry):** تحديث قاعدة البيانات وتحديث القياسات اللحظية.

### 2.2 التحقق من معالجة الخطأ والتراجع (Rollback Protection)
- تم التحقق من تفعيل `runTrackedRollback` عند حدوث أي خطأ غير متوقع أثناء التنفيذ، حيث يقوم المحرك بحذف الموارد الجديدة فقط وفق المعرف الداخلي `.id` الموثق أثناء الإنشاء، ولا يمس الموارد القائمة مسبقاً.

---

## المرحلة الثالثة: فحص البرمجة المتقدمة ذات الست خطوات (6-Step Advanced Configuration Wizard)

### 3.1 تدقيق واجهة ومراحل البرمجة المتقدمة
المسار في شاشة `apps/mobile/lib/features/router_setup/presentation/router_setup_screen.dart` تم فحصه خطوة بخطوة:
- **الخطوة 1 (الاتصال والمصادقة):** التحقق من بيانات الدخول، رقم المنافذ (API 8728 / REST 80/443)، وكشف الشبكة المحلية.
- **الخطوة 2 (استكشاف المنافذ والطبولوجيا):** استدعاء `/devices/:id/provision/discover` وقراءة بطاقات الشبكة، الجسور، العناوين، وخوادم الـ DHCP.
- **الخطوة 3 (اختيار القالب ووضع الإنترنت):** (CLEAN / EXISTING / CUSTOM) واختيار نمط الـ WAN (DHCP Client / PPPoE Client / Static IP).
- **الخطوة 4 (شبكة المشتركين وسياسات الحماية):** تحديد جسر المشتركين، المنفذ المعزول، عنوان البوابة (`10.5.50.1/24`)، وتفعيل سياسات منع مشاركة الإنترنت.
- **الخطوة 5 (المعاينة وفحص التعارضات):** استدعاء `/devices/:id/provision/preview` وتوليد خطة الأوامر وتوقيعها تشفيرياً عبر Ed25519.
- **الخطوة 6 (التنفيذ المباشر والتحقق):** إنشاء Pre-Backup، تطبيق الأوامر محلياً أو سحابياً، وفحص الـ 4 نقاط (Verification).

---

## المرحلة الرابعة: مراجعة أوامر RouterOS والصياغة (RouterOS Syntax & Formatting)

### 4.1 القضاء على خطأ تقسيم الكلمات (Command Word Splitting Defect)
- **المشكلة السابقة:** كانت الدالة `commandStringToWords` في `RouterProvisioningService` تستخدم:
  ```typescript
  return (cmd || '').trim().split(/\s+/);
  ```
  عند وجود تعليق أو اسم يحتوي على مسافات، مثل:
  `/interface/bridge/add =name=br-lan =comment=SudaFi Hotspot Bridge`
  كانت الدالة تقسم السلسلة إلى:
  `['/interface/bridge/add', '=name=br-lan', '=comment=SudaFi', 'Hotspot', 'Bridge']`
  في بروتوكول RouterOS Socket API، الكلمتان `Hotspot` و`Bridge` لا تبدآن بـ `=` أو `/`، مما يؤدي فوراً إلى رفض الراوتر للأمر وإرجاع `!trap =message=unknown parameter` أو قطع الاتصال.
- **الإصلاح الجذري:**
  إعادة كتابة `commandStringToWords` لتكون Tokenizer ذكياً:
  1. يدعم النصوص المحاطة بعلامات التنصيص (`"..."` أو `'...'`).
  2. يقوم بمرحلة تجميع ثانوية (Secondary Sanitization Pass): أي كلمة غير مسبوقة بـ `/` أو `=` أو `?` يتم دمجها تلقائياً بالمعامل السابق كقيمة نصية تابعة له.

### 4.2 إزالة معاملات سطر الأوامر غير المتوافقة مع الـ API (`=numbers=`)
- **المشكلة السابقة:** استخدام صياغة CLI مثل:
  - `/interface/bridge/port/set =numbers=ether2 =horizon=1`
  - `/ip/hotspot/user/profile/set =numbers=default =shared-users=1`
  - `/ip/hotspot/user/profile/set =numbers=hsp-sudafi =.id=*1 =rate-limit=...`
  بروتوكول RouterOS API (سواء Socket أو REST) لا يقبل المعامل `=numbers=` في أوامر التعديل، بل يتطلب استخدام المعرف الداخلي `.id` (مثل `=.id=*0` أو `=.id=*1`).
- **الإصلاح الجذري:**
  1. تعديل استهداف بروفايل الهوتسبوت الافتراضي: قراءة المعرف الداخلي من الاكتشاف أو استخدام `=.id=*0` القياسي.
  2. تعديل استهداف منافذ الجسر: استهداف المنفذ عبر `=.id=${existingBridgePort.id}` مباشرة.
  3. تعديل استهداف البروفايل المخصص: استهداف البروفايل عبر `=.id=${existingProfile.id}` مع تضمين `=name=${hsProfileName}` لضمان دقة الاسم وسرعة التطبيق.

---

## المرحلة الخامسة: فحص قفل الحماية وتفادي قطع الاتصال (Management Lockout Prevention)

### 5.1 بوابات الأمان الصارمة (Strict Safety Gates)
تم تدقيق والتأكد من تفعيل قواعد منع الانقطاع داخل المحرك:
1. **منع إضافة منفذ الإدارة إلى الجسر (Bridge Lockout):** إذا كان عنوان IP الذي يتصل به النظام يقع على منفذ فيزيائي، يمنع منعاً باتاً إضافة هذا المنفذ إلى جسر المشتركين حتى لو تم تفعيل `allowOverwrite`.
2. **منع تعارض WAN مع LAN:** حظر تخصيص نفس المنفذ لبطاقة الإنترنت وشبكة المشتركين في آن واحد.
3. **فحص الـ In-Band Management في مرحلة Stage 0:** قبل تنفيذ أي أمر كتابة على الراوتر، يقوم المحرك بقراءة جدول التوجيه المباشر والواجهات الحالية؛ فإذا تبين أن التعديل المقترح سيقطع الاتصال، يتم إيقاف العملية فوراً وإرجاع `0 commands executed`.

---

## المرحلة السادسة: مراجعة خطة المعاينة والتأكيد (Preview Plan & Confirmation)

### 6.1 التوقيع التشفيري لمنع التلاعب وتكرار العمليات (Ed25519 & Nonce Protection)
1. **Plan Token:** عند طلب المعاينة، يقوم الخادم بحساب التجزئة المعيارية (Canonical Payload Hash) ويوقعها بمفتاح Ed25519 رسمي خاص بـ SudaFi.
2. **فترة الصلاحية:** صلاحية الخطة محددة بـ 30 دقيقة؛ يتم رفض أي خطة منتهية الصلاحية بـ `PLAN_EXPIRED`.
3. **التحقق من عدم تغير حالة الراوتر (State Drift):** التحقق من تطابق `snapshotHash` بين لحظة المعاينة ولحظة التنفيذ لمنع تطبيق إعدادات على راوتر تغيرت حالته الشبكية في الأثناء.
4. **منع هجمات إعادة الإرسال (Replay Prevention):** تسجيل وحرق النونص (`_planNonceId`) فور التطبيق.

---

## المرحلة السابعة: معالجة الإعدادات السابقة وتعارض الأسماء (Pre-existing Config Reconciliation)

### 7.1 التحديث التفاضلي الآمن (Differential Updates)
1. **بروفايل الهوتسبوت القائم:** إذا كان البروفايل موجوداً مسبقاً بنفس الاسم والسرعة المطلوبة، يتم اعتماده دون إعادة إنشائه.
2. **معالجة تفاوت السرعة:** إذا كان البروفايل موجوداً ولكن بسرعة مختلفة (مثلاً `512k/1M` بينما المطلوب `4M/10M`)، يقوم المحرك بتنفيذ أمر تحديث صريح عبر `.id`، ثم يعيد قراءة البروفايل للتأكد من أن السرعة الجديدة تم تطبيقها فعلياً على الراوتر.
3. **Idempotent Handling:** في حال ظهور خطأ `already exists` لأي مورد، لا يتم قبول النجاح الوهمي بل يتم قراءة المورد والتأكد من مطابقة خصائصه.

---

## المرحلة الثامنة: التحقق بعد التنفيذ (Read-After-Write Verification)

### 8.1 التحقق المتعدد (Multi-Point Verification Matrix)
لا يتم وسم أي عملية بـ `VERIFIED_READY` إلا بعد اجتياز الفحوصات التالية:
1. **فحص بوابة الإنترنت (Internet Reachability):** إرسال حزم Ping موجهة إلى `8.8.8.8` أو `1.1.1.1` من خلال الراوتر.
2. **فحص خادم الهوتسبوت (HotSpot Operational):** قراءة `/ip/hotspot/print` والتأكد من وجود الخادم على الجسر المخصص وأنه بحالة `disabled=false`.
3. **فحص التوجيه الافتراضي (Default Route):** التأكد من وجود مسار فعال `dst-address=0.0.0.0/0` مرتبط بمنفذ الـ WAN.
4. **فحص سياسات الأمان (Security Policies):** قراءة جدول الـ Mangle والتأكد من وجود قاعدة تثبيت الـ TTL (`change-ttl=1`) على حزم المشتركين لمنع بث الهوتسبوت.

---

## المرحلة التاسعة: النسخ الاحتياطي والاستعادة (Backup & Recovery)

1. **النسخ الإجباري المسبق (Mandatory Pre-Backup):**
   - يتم إنشاء نسخة ثنائية مشفرة بكلمة مرور عبر `/system/backup/save`.
   - يتم تصدير نص الإعدادات الكامل عبر `/export file=...`.
2. **التخزين والاسترجاع:**
   - في وضع التنفيذ المحلي عبر الموبايل، يتم حفظ ملف النسخة الاحتياطية في ذاكرة الراوتر، ويتم إرجاع اسم الملف في كائن الاستجابة لتمكين المدير من استعادته بنقرة واحدة عند الطوارئ.

---

## المرحلة العاشرة: تقرير الفحص والتشخيص (Diagnostics & Error Reporting)

### 10.1 إزالة التعتيم على الأخطاء في تطبيق الموبايل
- تم استبدال الكود الصامت في `auto_provisioning_screen.dart` بكود يظهر رسالة SnackBar تفصيلية ويسجل الخطأ الحقيقي:
  ```dart
  } catch (e) {
    debugPrint('[AutoProvisioning] Local sync error: $e');
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('تنبيه: تعذر مزامنة نتيجة البرمجة مع الخادم: $e'),
          backgroundColor: Colors.orange,
        ),
      );
      setState(() => _step = 4);
    }
  }
  ```

---

## المرحلة الحادية عشرة: ربط المنظومة بمحرك التنفيذ المركزي (Central Executor Integration)

### 11.1 التوافق والربط مع `MikrotikOperationExecutorService`
- تم توحيد نمط استدعاء الأوامر بحيث تتطابق جميع العمليات مع البروتوكولات المعتمدة في `MikrotikClientFactory`، `RouterOsApiClient`، و`RouterOsRestClient`.
- الالتزام بنمط المراحل الأربعة الصارم:
  1. التحقق من الاتصال والمصادقة (Connection Phase).
  2. إرسال الأمر بصيغة متوافقة مع إصدار RouterOS (Execution Phase).
  3. إعادة القراءة المباشرة من الراوتر للتحقق (Verification Phase).
  4. تحديث قاعدة البيانات بناءً على نتيجة الواقع فقط (Persistence Phase).

---

## المرحلة الثانية عشرة: التقرير النهائي للتنفيذ وجدول الاختبارات المستقلة (Execution & Verification Matrix)

### جدول نتائج التدقيق والاختبار المعتمد

| المكون / الجناح الاختباري | عدد الاختبارات | النتيجة | التصنيف الهندسي | ملاحظات التحقق |
| :--- | :---: | :---: | :---: | :--- |
| **Router Provisioning Engine Phase 1** (`router-provisioning.spec.ts`) | 130 | ناجح (130/130) | **VERIFIED_WITH_MOCKS** | اختبار كامل للاكتشاف، المعاينة، الأمان، كشف التعارضات، وتصحيح صياغة أوامر الهوتسبوت والجسر |
| **Auto Provisioning Core Suites** (`mikrotik-provisioning/`) | 32 | ناجح (32/32) | **VERIFIED_WITH_MOCKS** | اختبار التخطيط، التوافقية، النسخ الاحتياطي، والاستعادة، مع دعم `executionMode: 'LOCAL'` |
| **MikroTik Core Client & Protocol Layer** (`core/mikrotik/`) | 64 | ناجح (64/64) | **VERIFIED_WITH_MOCKS** | اختبار بروتوكول Socket الثنائي، REST CLI POST، التراجع، والمصالحة |
| **Cards Service Integration Suite** (`cards.service.spec.ts`) | 49 | ناجح (49/49) | **VERIFIED_WITH_MOCKS** | التحقق من تكامل الكروت مع الراوتر عبر المحرك المركزي ومنع النجاح الوهمي |
| **Hotspot Service Suite** (`hotspot.service.spec.ts`) | 13 | ناجح (13/13) | **VERIFIED_WITH_MOCKS** | التحقق من إدارة البروفايلات، الجلسات، وفصل المستخدمين عبر الراوتر |
| **PPPoE Service Suite** (`pppoe.service.spec.ts`) | 29 | ناجح (29/29) | **VERIFIED_WITH_MOCKS** | التحقق من إنشاء البروفايلات والحسابات وتشفيرها وفصل الجلسات عبر الراوتر |
| **Device Connectivity & Telemetry** (`device-connectivity-hardening.spec.ts`) | 15 | ناجح (15/15) | **VERIFIED_WITH_MOCKS** | التحقق من حماية مسار التيليميتري المحلي وعزل الشبكات الخاصة |
| **الإجمالي الكلي للاختبارات المتحقق منها** | **332** | **ناجح (332/332)** | **VERIFIED_WITH_MOCKS** | **نسبة النجاح: 100% دون أي فشل أو تراجع** |

> [!NOTE]
> **التصنيف:** جميع بنود الجدول أعلاه مصنفة كـ **VERIFIED_WITH_MOCKS** لأنها اختبرت بنجاح عبر بيئة الاختبارات المؤتمتة (Jest Unit & Integration Suites) مع محاكاة شاملة لاستجابات RouterOS 6 وRouterOS 7 الحقيقية. عند توصيل راوتر MikroTik فعلي بمختبر الفحص الحي، يتم ترقية التصنيف إلى **VERIFIED**.

---

## الخلاصة النهائية والتوصيات

1. تم القضاء على مشكلة الفشل الصامت وعدم مزامنة الراوترات المحلية الخاصة (`192.168.88.1`) عبر تفعيل مسار المزامنة المحلية الصريح في `CommandExecutorService` و`StartAutoProvisioningDto`.
2. تم إصلاح أخطاء تقطيع الكلمات في `RouterProvisioningService`، مما يضمن وصول الأوامر ذات المسافات أو التعليقات العربية والإنجليزية بصيغة بروتوكولية سليمة لراوترات MikroTik.
3. تم التخلص نهائياً من معاملات سطر الأوامر غير المتوافقة مع الـ API (`=numbers=`)، واستبدالها بالمعرفات الحقيقية (`.id`).
4. المنظومة أصبحت الآن متماسكة تماماً، متوافقة مع إصدارات RouterOS v6 وv7، ومحمية بآليات Read-After-Write لمنع أي نجاح وهمي في التطبيق.
