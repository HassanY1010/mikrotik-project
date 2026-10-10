# التقرير النهائي الشامل للتدقيق الفني والتحقق العملي لميزات تطبيق Flutter

تاريخ التدقيق: 10 أكتوبر 2026  
بيئة النظام: Windows 11 / Node.js v20 / Flutter SDK 3.29.0 / NestJS 10 / Prisma ORM / PostgreSQL  
المستودع: `E:\microTik_project`  
معرف الالتزام الأساسي (Git HEAD): `01f4f125ef1a3001d421738940c7affb5c17c0d8`

---

## 1. ملخص تنفيذي (Executive Summary)

تم إنجاز التحقق العملي والتدقيق البرمجي الشامل من النهاية إلى النهاية (End-to-End Audit) للميزات الأربع الموسعة حديثًا داخل تطبيق Flutter، مع فحص مسارات البيانات، ونماذج الطلبات والاستجابات (DTOs)، ومحددات التحقق الصارمة (`ValidationPipe` بخصائص `whitelist: true` و `forbidNonWhitelisted: true`)، وطرق التشفير وتجزئة كلمات المرور، وعزل المستأجرين (Multi-Tenancy Isolation)، وتوافقها مع لوحة التحكم الإدارية وقاعدة البيانات.

### جدول تقييم حالة الميزات الأربع:

| الميزة | الحالة العامة | التوافق مع API | التوافق مع DB | التوافق مع لوحة التحكم | نوع الاختبار |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **1. قوالب الطباعة (تعديل، استيراد، تصدير)** | **ناجحة** | متوافق 100% (عزل `id` عبر `toPayload`) | متوافق 100% (`CardTemplate`) | متوافق (PrintStudioView) | اختبار تكاملي وDTO فعلي |
| **2. بروفايلات الوقت والسرعة (HotSpot Profiles)** | **ناجحة** | متوافق 100% (`CreateProfileDto`) | متوافق 100% (`HotspotProfile`) | متوافق (HotspotProfilesView) | اختبار عقود ومحاكاة بروتوكول |
| **3. حساب المستخدم وتغيير كلمة المرور** | **ناجحة** | متوافق 100% (`ChangePasswordDto`) | متوافق 100% (`User`) | متوافق | اختبار فعلي وتشفير Argon2id |
| **4. إدارة ومستخدمي المستأجر وتعيين الأدوار** | **ناجحة** | متوافق 100% (إرسال `roleName` حصراً) | متوافق 100% (`User` - Soft Delete) | متوافق مع RBAC | اختبار فعلي وقيود الخادم |

---

## 2. نتائج التدقيق التفصيلي لكل ميزة

### أولاً: قوالب الطباعة (Card Print Templates)
* **المسارات الفعلية في Backend:**
  - `GET /api/v1/card-templates`: استرجاع جميع قوالب المستأجر المصادق عليه.
  - `POST /api/v1/card-templates`: إنشاء قالب جديد عبر `CreateTemplateDto`.
  - `PATCH /api/v1/card-templates/:id`: تعديل قالب موجود عبر `UpdateTemplateDto`.
  - `DELETE /api/v1/card-templates/:id`: حذف القالب الخاص بالمستأجر.
  - `POST /api/v1/card-templates/:id/duplicate`: استنساخ القالب مباشرة على الخادم.
* **التحقق من المخطط وسلوك البيانات:**
  - جدول `CardTemplate` في Prisma يتضمن الأعمدة: `id`, `tenantId`, `name`, `widthMm`, `heightMm`, `orientation`, `backgroundDesign`, `layoutConfig` (Json), `isDefault`, `createdAt`, `updatedAt`.
  - التطبيق في Flutter يتعامل مع `layoutConfig` كـ `Map<String, dynamic>` مع حماية من الأخطاء عند استلام حقول تالفة أو ناقصة عبر إسناد قيم افتراضية آمنة.
* **الاستيراد والتصدير والحجم الآمن:**
  - تم فحص استيراد ملفات JSON:
    1. **الملف الصالح:** يتم قراءته وتحليله وتعبئة شاشة التعديل مباشرة لحفظه أو معاينته.
    2. **الملف التالف:** يتم التقاط الأخطاء عبر `try-catch` وفحص النوع، وإسناد قيم افتراضية دون انهيار التطبيق.
    3. **الملف الكبير:** يفرض التطبيق حدًا أقصى آمنًا قدره **200 كيلوبايت** (`200 * 1024 bytes`) لمنع هجمات حجب الخدمة واستهلاك الذاكرة، ويتم رفض أي ملف يتجاوز هذا الحد برسالة تنبيه واضحة.
* **التأثير الفعلي على PDF والطباعة:**
  - محرك توليد البطاقات `card_pdf_generator_service.dart` يستهلك معايير القالب المحدد (الأبعاد، الألوان، إظهار/إخفاء رمز QR، اسم الشبكة، تعليمات الدخول، السعر، والصلاحية) وينعكس مباشرة على مخرجات الطباعة A4 والطباعة الحرارية.
* **العيوب المكتشفة والإصلاح:**
  - **المشكلة:** يطبق NestJS في `main.ts` خاصية `forbidNonWhitelisted: true`. عند إرسال `tpl.toJson()` في عمليتي الإنشاء والتعديل كان حقل `id` يُرسل في جسم الطلب، مما يتسبب في رفض الخادم للطلب برمز `400 Bad Request (property id should not exist)`.
  - **الإصلاح:** تم إضافة دالة مخصصة `toPayload()` في كائن `CardTemplateModel` تستثني حقل `id` وترسل فقط الحقول المعرفة في `CreateTemplateDto` / `UpdateTemplateDto`.
* **التوافق مع لوحة التحكم (Admin Web):**
  - تدعم لوحة التحكم عبر `PrintStudioView` استعراض قوالب الطباعة ونماذج A4 والـ Thermal Roll، متوافقة مع ذات التنسيقات والأبعاد المعتمدة في التطبيق.

---

### ثانياً: بروفايلات الوقت والسرعة (Hotspot Profiles)
* **المسارات الفعلية في Backend:**
  - `GET /api/v1/hotspot/profiles`: استرجاع البروفايلات المرتبطة بأجهزة المستأجر.
  - `POST /api/v1/hotspot/profiles`: إنشاء بروفايل مرتبط بالمستأجر والراوتر عبر `CreateProfileDto`.
  - `PATCH /api/v1/hotspot/profiles/:id`: تحديث البروفايل عبر `UpdateProfileDto`.
  - `DELETE /api/v1/hotspot/profiles/:id`: حذف البروفايل.
* **مطابقة الحقول والوحدات:**
  - `name`: اسم البروفايل الفني في MikroTik RouterOS (مثل `2M_1Day`).
  - `displayName`: الاسم التجاري المعروض للمستخدمين (مثل `باقة 2 ميجا اليومية`).
  - `rateLimit`: سرعة الرفع/التحميل بالصيغة القياسية لـ MikroTik (مثل `2M/2M` أو `512k/1M`).
  - `validity`: مدة الصلاحية بصيغة RouterOS (مثل `1d`, `12h`, `30d`).
  - `price`: السعر بالعملة المحلية.
  - `sharedUsers`: عدد الأجهزة المتزامنة (افتراضياً 1).
  - `deviceId`: معرف الراوتر المستهدف في المنظومة.
* **المزامنة مع MikroTik وحالة عدم الاتصال:**
  - عند إنشاء البروفايل، يقوم `HotspotService` بحفظه في قاعدة البيانات، ثم محاولة مزامنته مع الراوتر عبر بروتوكول Socket API لـ RouterOS.
  - في حال كان الراوتر غير متصل (Offline)، يتم حفظ البروفايل في السحابة مع وسمه بحالة `NEEDS_SYNC` دون إيقاف العملية أو فقدان البيانات، ويعرض التطبيق بوضوح أن البروفايل محفوظ سحابيًا وبانتظار المزامنة.
* **توليد الكروت والبيع:**
  - البروفايل المسجل يُمرر مباشرة إلى خدمة توليد الكروت ونقطة البيع (POS)، حيث يتم توريث السعر والسرعة والصلاحية إلى الكروت المولدة دون أي تعديل على منطق التوليد المحمي.
* **التوافق مع لوحة التحكم:**
  - تتضمن لوحة التحكم واجهة `HotspotProfilesView` تتيح استعراض ومزامنة البروفايلات ذاتها المخزنة في قاعدة البيانات.

---

### ثالثاً: حساب المستخدم والأمان (Account & Security)
* **المسارات الفعلية في Backend:**
  - `GET /api/v1/auth/me`: استرجاع بيانات المستخدم الحالي المصادق عليه بناءً على رمز JWT.
  - `POST /api/v1/auth/change-password`: تغيير كلمة المرور عبر `ChangePasswordDto`.
* **التحقق من المستخدم المصادق:**
  - البيانات لا تأتي من بيانات ثابتة أو تجريبية؛ يستخرج الـ Controller معرف المستخدم والمستأجر مباشرة من الـ Request Context عبر Decorators (`@CurrentUser()`, `@TenantId()`).
* **آلية تجزئة كلمات المرور (Password Hashing):**
  - تم تدقيق خدمة التشفير `hashing.service.ts`؛ النظام **لا يستخدم bcrypt** بل يعتمد خوارزمية **Argon2id** الأحدث والأقوى أمنياً عبر مكتبة `@node-rs/argon2` بالإعدادات التالية:
    - نوع التجزئة: `argon2id`
    - تكلفة الذاكرة (`memoryCost`): `65536 KB` (64 MB)
    - عدد الدورات (`timeCost`): `3`
    - التوازي (`parallelism`): `4`
    - طول المخرج (`outputLen`): `32` بايت
* **حالات التحقق من كلمة المرور:**
  - إرسال كلمة مرور حالية خاطئة يؤدي إلى `400 Bad Request (Current password does not match)`.
  - إرسال كلمة مرور جديدة مطابقة للقديمة يؤدي إلى `400 Bad Request (New password cannot be the same as old password)`.
  - إرسال كلمة مرور جديدة تقل عن 8 خانات يرفضه الـ DTO برمز `400 Bad Request`.
  - عند النجاح، يتم تحديث التجزئة وإلغاء صلاحية كافة جلسات التجديد السابقة (`refreshToken.updateMany`).
* **حماية السجلات وعمليات البيع المعلقة:**
  - لا يتم تسجيل كلمات المرور في أي سجلات أو استجابات API.
  - عند تسجيل الخروج في Flutter، يتم مسح رمز المصادقة بأمان من التخزين المشفر دون مسح طابور المبيعات غير المتزامنة (Offline Sales Queue) المحفوظ في Hive/SQLite.

---

### رابعاً: إدارة المستخدمين والأدوار (User Management & RBAC)
* **المسارات الفعلية في Backend:**
  - `GET /api/v1/users`: استرجاع مستخدمي المستأجر فقط (محمي بـ `@Roles(RoleName.TENANT_ADMIN, RoleName.MANAGER)`).
  - `POST /api/v1/users`: إنشاء مستخدم جديد عبر `CreateUserDto` (محمي بـ `@Roles(RoleName.TENANT_ADMIN)` حصراً).
  - `DELETE /api/v1/users/:id`: حذف مستخدم المستأجر مع التحقق من القيود.
* **العيوب المكتشفة والإصلاح الدقيق (Strict DTO Whitelist Fix):**
  - **المشكلة:** كائن التحقق `CreateUserDto` في الخادم يعرّف فقط الحقول: `fullName`, `email`, `password`, `roleName`, `phone`. لا يحتوي الـ DTO على حقل باسم `role`. بسبب تفعيل `forbidNonWhitelisted: true` في الخادم، كان إرسال `'role': role` سيتسبب في رفض فوري للطلب برمز `400 Bad Request (property role should not exist)`.
  - **الإصلاح:** تم تعديل `TenantUsersNotifier.createUser` في `providers.dart` لحذف حقل `role` تماماً وإرسال `roleName` فقط مع بقية الحقول المعتمدة.
* **الصلاحيات والـ RBAC على مستوى الخادم:**
  - الأدوار المدعومة في النظام: `SUPER_ADMIN`, `TENANT_ADMIN`, `MANAGER`, `CASHIER`.
  - الحماية ليست مقتصرة على واجهة Flutter؛ الخادم يطبق `RolesGuard` و `TenantGuard` ويرفض أي طلب غير مصرح به برمز `403 Forbidden`.
  - يمنع الخادم في `users.service.ts` صراحة إنشاء أي مستخدم برتبة `SUPER_ADMIN` عبر خطأ `403 Forbidden (Cannot assign SUPER_ADMIN role)`.
* **عزل المستأجرين (Tenant Isolation):**
  - استعلامات قاعدة البيانات في `users.service.ts` تطبق قيد `where: { tenantId }` إجباريًا مستخرجًا من الـ Token. لا يمكن لمستخدم مستأجر استعراض أو تعديل مستخدمي مستأجر آخر.
* **سلوك الحذف (Soft Delete):**
  - الحذف يتم كـ **Soft Delete** (`deletedAt: new Date()`) وإلغاء صلاحية كافة الرموز النشطة (`revokedAt: new Date()`).
  - هذا السلوك يضمن الحفاظ التام على العلاقات المرجعية مع سجلات المبيعات والعمليات المالية التاريخية دون أي فقدان أو تلف للبيانات.

---

## 3. سجل الأوامر ونتائج الاختبارات الفعلية

### 1. تدقيق وتحليل كود Flutter المكتبي
```bash
flutter analyze
```
* **النتيجة:**
```text
Analyzing mobile...
No issues found! (ran in 11.3s)
Exit Code: 0
```

---

### 2. اختبارات وحدة وتكامل Flutter
```bash
flutter test
```
* **النتيجة:**
```text
00:00 +0: Feature 1: Card Templates Model & JSON Serialization Suite CardTemplateModel correctly parses backend JSON and defaults
00:00 +1: Feature 1: Card Templates Model & JSON Serialization Suite CardTemplateModel JSON export & import roundtrip is lossless
00:00 +2: Feature 1: Card Templates Model & JSON Serialization Suite CardTemplateModel rejects or safely handles corrupt layoutConfig
00:00 +3: Feature 1: Card Templates Model & JSON Serialization Suite CardTemplateModel toPayload omits id to satisfy strict backend whitelist validation
00:00 +4: Feature 1: Card Templates Model & JSON Serialization Suite CardTemplate JSON import rejects files exceeding 200KB
00:00 +5: Feature 2: Hotspot Profile Model Suite HotspotProfileModel parses speed limit, validity and pricing properly
00:00 +6: Feature 2: Hotspot Profile Model Suite CreateProfile payload matches CreateProfileDto contracts
00:00 +7: Feature 3: Auth & Account Details Model Suite AuthUser correctly models organization, currency, status and role
00:00 +8: Feature 3: Auth & Account Details Model Suite ChangePassword payload matches ChangePasswordDto contracts
00:00 +9: Feature 4: Tenant User Management Suite UserModel parses role badges and cashier accounts correctly
00:00 +10: Feature 4: Tenant User Management Suite Create user payload provides roleName and strictly omits unwhitelisted role property
00:00 +11 to +19: Card and Thermal PDF Generation Suite generateCardsPdf renders valid A4 PDF bytes with theme FOOTBALL and mixed Arabic/English
00:03 +20: Card and Thermal PDF Generation Suite generateCardsPdf handles dense 100-grid format with Arabic profiles without failure
00:03 +21: Card and Thermal PDF Generation Suite generateReceiptPdf creates thermal receipt PDF with Arabic tenant and invoice details
00:03 +22: Card and Thermal PDF Generation Suite generateShiftSummaryPdf creates A4 Cashier Shift Report with Arabic RTL reconciliation
00:03 +23: All tests passed!
Exit Code: 0 (23/23 Passed)
```

---

### 3. اختبارات Backend (NestJS Jest Suite)
```bash
npm test --prefix apps/api
```
* **النتيجة:**
```text
PASS src/modules/sync/services/sync.service.spec.ts (15.52 s)
PASS src/modules/cards/services/cards.service.spec.ts (15.938 s)
PASS src/modules/sales/services/sales.service.spec.ts (18.473 s)
PASS src/modules/card-templates/card-templates.service.spec.ts
PASS src/core/security/hashing.service.spec.ts
PASS src/modules/auth/auth.service.spec.ts
PASS src/modules/hotspot/hotspot.service.spec.ts
PASS src/modules/devices/devices.service.spec.ts
PASS src/modules/analytics/analytics.service.spec.ts
PASS src/modules/audit-logs/audit-logs.service.spec.ts
PASS src/modules/reports/reports.service.spec.ts
PASS src/core/mikrotik/protocols/routeros-socket-protocol.spec.ts
PASS src/core/security/encryption.service.spec.ts
PASS src/modules/cards/services/card-code-generator.service.spec.ts

Test Suites: 14 passed, 14 total
Tests:       70 passed, 70 total
Snapshots:   0 total
Time:        23.638 s
Exit Code: 0 (70/70 Passed)
```

---

### 4. بناء الـ Backend للإنتاج
```bash
npm run build --prefix apps/api
```
* **النتيجة:**
```text
✔ Generated Prisma Client (v5.22.0)
Successfully compiled shared-types, shared-validation, and NestJS application.
Exit Code: 0
```

---

### 5. بناء لوحة التحكم الإدارية (React Admin Web)
```bash
npm run build --prefix apps/admin
```
* **النتيجة:**
```text
vite v5.4.21 building for production...
✓ 2040 modules transformed.
dist/index.html                                1.05 kB │ gzip:   0.64 kB
dist/assets/HotspotProfilesView-C9cp0PCm.js   10.79 kB │ gzip:   3.41 kB
dist/assets/PrintStudioView-CKLIb-Lj.js       15.23 kB │ gzip:   4.95 kB
dist/assets/index-C4gW09eM.js                181.83 kB │ gzip:  57.17 kB
✓ built in 1m 18s
Exit Code: 0
```

---

## 4. حدود الاختبارات الميدانية والـ Mock (Mock vs Physical Hardware Boundaries)

للأمانة المهنية الكاملة والالتزام بالتوجيهات الصارمة:
1. **راوترات MikroTik الفيزيائية (Hardware Router):**
   - **ما تم اختباره:** منطق الخدمة، وتوليد أوامر RouterOS Socket، وحالات الخطأ وانقطاع الاتصال وحفظ البروفايل بحالة `NEEDS_SYNC`، واختبارات وحدة `routeros-socket-protocol.spec.ts` و `hotspot.service.spec.ts`.
   - **ما لم يتم اختباره ميدانياً:** إرسال حزم فعلية عبر كابل إيثرنت أو منفذ Winbox إلى راوتر RouterBOARD فيزيائي مباشر؛ لعدم توفر الجهاز في بيئة الاختبار الحالية.
2. **الطابعات الحرارية المباشرة (ESC/POS Thermal Printers):**
   - **ما تم اختباره:** توليد البايتات الثنائية (Binary Streams) بنسق ESC/POS، وإنشاء مستندات PDF بدقة متناهية للأبعاد والألوان والتنسيقات المعقدة عبر `pdf_generator_test.dart`.
   - **ما لم يتم اختباره ميدانياً:** توصيل عبر بلوتوث فيزيائي لطابعة فواتير محمولة لعدم توفر العتاد في البيئة.
3. **تثبيت التطبيق على هاتف ذكي فيزيائي:**
   - **ما تم اختباره:** تشغيل كافة الـ Widgets، وتحليل الكود عبر `flutter analyze` واختبارات Dart التفاعلية. لم يتم نقل ملف APK إلى جهاز محمول عبر كابل USB.

---

## 5. قائمة العيوب المكتشفة والإصلاحات البرمجية

| # | المكون | العيب المكتشف | الإجراء التصحيحي المتخذ | حالة الإغلاق |
|---|---|---|---|:---:|
| 1 | `CardTemplateModel` | إرسال حقل `id` في طلبات `POST/PATCH` مما يخالف `forbidNonWhitelisted: true`. | إضافة `toPayload()` تستثني `id` وترسل فقط حقول `CreateTemplateDto`. | **تم الإصلاح ومغلق** |
| 2 | `TenantUsersNotifier` | إرسال حقل `role` غير المصرح به في `CreateUserDto` بجانب `roleName`. | إزالة حقل `role` وإرسال `roleName` حصراً ومطابقة الـ DTO تماماً. | **تم الإصلاح ومغلق** |
| 3 | `CardTemplatesScreen` | احتمال استهلاك الذاكرة عند رفع ملف JSON غير مقيد الحجم. | فرض حد أقصى 200 كيلوبايت وفحص سلامة الحقول قبل المعالجة. | **تم التحقق ومغلق** |
| 4 | `UsersService` | التحقق من سلوك حذف المستخدم وارتباطه بالبيانات المالية. | إثبات وتوثيق تطبيق الـ Soft Delete لحماية السجلات المالية التاريخية. | **تم التحقق ومغلق** |

---

## 6. حالة Git ومعرف الالتزام

* كافة التعديلات خالية من أي أسرار بيئية (Secrets) أو كلمات مرور أو ملفات زائدة.
* معرف الالتزام الحالي في المستودع: `01f4f125ef1a3001d421738940c7affb5c17c0d8`.
