# تقرير المراجعة الأمنية والتصحيحية للمرحلة الثالثة — الجزء الأول
**وثيقة التدقيق الأمني المعمق وإصلاحات تسجيل وإقران الوكيل (Security Audit & Fixes Report)**  
**المسار:** `E:\microTik_project`  
**تاريخ المراجعة:** 10 أكتوبر 2026  
**الحالة:** تم التدقيق والإصلاح والتحقق البرمجي بنسبة 100% (20/20 جناح اختبار ناجح — 130/130 اختبار ناجح)

---

## 1. الفحص الفعلي للكود وتحديد الثغرات ونقاط القصور (Vulnerabilities & Findings)

تم إجراء مراجعة تدقيقية نقدية على الكود المكتوب في الملفات التالية:
- `apps/api/src/modules/agent/agent.service.ts`
- `apps/api/src/modules/agent/agent.controller.ts`
- `apps/api/src/modules/agent/agent.module.ts`
- `apps/api/src/modules/agent/dto/pair-agent.dto.ts`
- `apps/api/src/modules/agent/dto/agent-response.dto.ts`
- `apps/api/prisma/schema.prisma`
- `apps/api/src/app.module.ts`
- `apps/api/src/modules/agent/agent.service.spec.ts`

كشف التدقيق عن **4 ثغرات ومشكلات معمارية حرجة** تم علاجها بالكامل في هذه المراجعة:

---

### الثغرة الأولى: أمان HMAC لرمز الإقران وتخزين الـ Salt
- **التشخيص الفعلي:**
  في المسودة السابقة، كان التشفير يُنفذ عبر:
  `crypto.createHmac('sha256', salt).update(rawCode).digest('hex')`
  حيث كان الـ `salt` العشوائي يُستخدم بمفرده كـ Secret Key للـ HMAC، ويُحفظ بجوار الـ `codeHash` في نفس السجل بجدول `agent_pairing_codes`.
- **الخطر الأمني:**
  إذا تم تسريب قاعدة البيانات (SQL Injection أو Data Breach)، يستطيع المهاجم تجربة كافة الاحتمالات المليون (1,000,000) للرمز المكون من 6 أرقام في بضع ثوانٍ Offline، لأنه يمتلك الـ `salt` والـ `codeHash` معاً!
- **الإصلاح الفعلي:**
  تم اشتقاق مفتاح سري خاص بالخادم `serverSecret` عبر `ConfigService` (`AGENT_PAIRING_SECRET` أو `ENCRYPTION_KEY`) محمي في الذاكرة الحية فقط، ولا يُخزن في قاعدة البيانات أو السجلات نهائياً:
  ```typescript
  const configuredSecret = this.configService.get<string>('AGENT_PAIRING_SECRET') ||
                           this.configService.get<string>('ENCRYPTION_KEY');
  this.serverSecret = crypto.createHash('sha256').update(`sudafi:pairing:salt:${configuredSecret}`).digest('hex');
  ```
  وأصبح الـ Hash يُحسب كالتالي:
  ```typescript
  crypto.createHmac('sha256', this.serverSecret).update(`${rawCode}:${salt}`).digest('hex');
  ```
  الآن، حتى لو تسربت قاعدة البيانات بالكامل، يستحيل على المهاجم تخمين أو مطابقة أي رمز إقران دون امتلاك الـ Server Secret المخزن في بيئة السيرفر.

---

### الثغرة الثانية: تعارض القيد الفريد `deviceId @unique` وفقدان سجل الوكلاء الملغين
- **التشخيص الفعلي:**
  كان جدول `DeviceAgent` يحتوي على قيد فريد `deviceId String @unique`.
  عند إلغاء وكيل لراوتر معين ثم رغبة العميل في إقران جهاز كمبيوتر جديد لنفس الراوتر، كان الكود القديم يقوم بـ `upsert` يمحو سجل الوكيل الملغي ويعدل حالته إلى `OFFLINE` مستخدماً نفس الـ ID القديم.
- **الخطر الأمني والتشغيلي:**
  1. ضياع السجل التاريخي للوكلاء الملغين (`Audit Trail Loss`).
  2. في حال حدوث تداخل أو تدقيق جنائي (Forensics)، لا يمكن معرفة كم وكيلاً تم ربطه بهذا الراوتر وتاريخ إلغاء كل وكيل.
- **الإصلاح الفعلي:**
  1. إزالة `@unique` من حقل `deviceId` في `schema.prisma` واستبداله بـ `@@index([deviceId])`.
  2. عند إقران وكيل جديد للراوتر، يتم البحث داخل معاملة ذرية عن أي وكيل نشط سابق لنفس الـ `deviceId` وتحديث حالته إلى `REVOKED` وتشويه الـ `tokenHash` الخاص به.
  3. إنشاء سجل وكيل جديد تماماً بـ `id` جديد و `tokenHash` جديد، مع بقاء السجل الملغي القديم محفوظاً في قاعدة البيانات بحالة `REVOKED` و `revokedAt`.
  4. دالة `getAgentStatus` تبحث أولاً عن الوكيل النشط (`status != REVOKED`)، فإن لم تجد تعيد آخر وكيل ملغي، ودالة `revokeAgent` تلغي الوكيل النشط الحالي فقط.

---

### الثغرة الثالثة: غياب الذرية (Lack of Transaction Atomicity) وخطر الفشل الجزئي
- **التشخيص الفعلي:**
  في الكود القديم، كان استهلاك رمز الإقران (`updateMany: isConsumed = true`) يتم خارج معاملة الـ Database، ثم يليه إنشاء الوكيل (`upsert`).
- **الخطر الأمني والتشغيلي:**
  إذا نجح استهلاك الرمز، ثم حدث خطأ مفاجئ أثناء إنشاء الوكيل (مثل انقطاع الاتصال بقاعدة البيانات، أو امتلاء القرص `DB_DISK_FULL`، أو خطأ في القيود):
  - سيتم وسم الرمز بـ `isConsumed = true` دون إنشاء الوكيل!
  - يحترق رمز العميل، ويفشل الإقران، وتظل حالة الراوتر معلقة دون وكيل ودون إمكانية إعادة المحاولة بنفس الرمز!
- **الإصلاح الفعلي:**
  تم دمج العملية بالكامل داخل **معاملة ذرية مغلقة (`prisma.$transaction`)**:
  ```typescript
  createdAgent = await this.prisma.$transaction(async (tx) => {
    // 1. استهلاك الرمز ذرياً مع قفل السطر
    const updateResult = await tx.agentPairingCode.updateMany({
      where: { id: matchedCodeRecord!.id, isConsumed: false, expiresAt: { gt: now }, attempts: { lt: 3 } },
      data: { isConsumed: true, consumedAt: now },
    });
    if (updateResult.count === 0) throw new ConflictException('Pairing code already consumed or expired');

    // 2. إلغاء أي وكيل نشط سابق للراوتر
    await tx.deviceAgent.updateMany({
      where: { deviceId: matchedCodeRecord!.deviceId, status: { not: AgentStatus.REVOKED } },
      data: { status: AgentStatus.REVOKED, revokedAt: now, tokenHash: crypto.randomBytes(32).toString('hex') },
    });

    // 3. إنشاء سجل الوكيل الجديد
    const newAgent = await tx.deviceAgent.create({ ... });

    // 4. كتابة سجل التدقيق داخل نفس المعاملة
    await tx.auditLog.create({ ... });

    return newAgent;
  });
  ```
  في حال حدوث أي خطأ في أي مرحلة، تُلغى المعاملة بالكامل (`Rollback`)، ولا يُستهلك الرمز، ولا تُترك قاعدة البيانات في حالة غير متناسقة.

---

### الثغرة الرابعة: ضعف عدادات المحاولات وفقدان القفل عند إعادة التشغيل وتزوير الـ IP
- **التشخيص الفعلي:**
  كانت عدادات الـ Rate Limiting مخزنة في الذاكرة العشوائية `Map<string, RateLimitEntry>`.
- **الخطر الأمني:**
  1. عند إعادة تشغيل الـ API أو تحديث الحاوية على Render، يتم تصفير الذاكرة وتفقد المنصة كافة بيانات المهاجمين المحظورين.
  2. في حال تشغيل أكثر من نسخة من الـ API (Clustering أو Multiple Instances)، لا تشترك النسخ في نفس الذاكرة، مما يسمح للمهاجم بتجاوز حد المحاولات.
  3. ترويسة `X-Forwarded-For` يمكن تزويرها بسهولة من المهاجم إذا اعتمد عليها الـ Backend مباشرة.
- **الإصلاح الفعلي:**
  1. إضافة نموذج دائم في قاعدة البيانات `AgentPairingAttempt`:
     ```prisma
     model AgentPairingAttempt {
       id            String    @id @default(uuid())
       clientKey     String    @unique // SHA-256 of IP + User-Agent + Fingerprint
       attempts      Int       @default(1)
       lockedUntil   DateTime?
       lastAttemptAt DateTime  @default(now())
       createdAt     DateTime  @default(now())
       updatedAt     DateTime  @updatedAt

       @@index([clientKey])
       @@index([lockedUntil])
       @@map("agent_pairing_attempts")
     }
     ```
  2. أصبحت بيانات القفل ومحاولات التخمين مستمرة في قاعدة البيانات:
     - تصمد أمام إعادة تشغيل التطبيق أو سقوط الحاويات بنسبة 100%.
     - تشترك فيها كافة نسخ الـ API السحابية والمحلية.
  3. حماية ثنائية الطبقات (Dual-Layer Defense) ضد تزوير الـ IP:
     - **الطبقة الأولى (Client Key Hash):** دمج `req.ip` مع `User-Agent` والبصمة كـ SHA-256 لمنع التحايل بتغيير ترويسة واحدة.
     - **الطبقة الثانية (Code-Level Hard Limit):** حقل `attempts` في جدول `AgentPairingCode` نفسه؛ فإذا تعرض الرمز لـ 3 محاولات فاشلة، يُقفل الرمز ذاتياً في قاعدة البيانات بغض النظر عن عنوان الـ IP الذي يتصل منه المهاجم!

---

## 2. مصفوفة التحقق من النقاط السبعة المطلوبة

| البند المطلوب | الحالة | الملف الفعلي والكود الداعم | آلية التحقق والاختبار |
| :--- | :---: | :--- | :--- |
| **1. أمان رمز الإقران وHMAC السري** | **مُعالج ومثبت** | `apps/api/src/modules/agent/agent.service.ts` (الأسطر 38-51 و 368-373) | استخدام `serverSecret` من ConfigService مشتق من البيئة + Salt عشوائي. اختبار `agent.service.spec.ts:58`. |
| **2. إعادة الإقران بعد الإلغاء وحفظ السجل** | **مُعالج ومثبت** | `apps/api/prisma/schema.prisma` (السطر 593)<br>`apps/api/src/modules/agent/agent.service.ts` (الأسطر 200-217) | إزالة `@unique` عن `deviceId`، إلغاء التوكن القديم وإنشاء سجل جديد مع بقاء القديم. اختبار `agent.service.spec.ts:251`. |
| **3. ذرية عملية الإقران (Atomicity)** | **مُعالج ومثبت** | `apps/api/src/modules/agent/agent.service.ts` (الأسطر 184-250) | تغليف الاستهلاك والإنشاء في `prisma.$transaction`. اختبار التزامن والفشل الجزئي في `agent.service.spec.ts:182 & 207`. |
| **4. تخزين عدادات المحاولات والقفل** | **مُعالج ومثبت** | `apps/api/prisma/schema.prisma` (السطر 638)<br>`apps/api/src/modules/agent/agent.service.ts` (الأسطر 381-438) | جدول `agent_pairing_attempts` الدائم + عداد الرمز `attempts >= 3`. اختبار الصمود بعد إعادة التشغيل في `agent.service.spec.ts:229`. |
| **5. عزل المستأجرين والصلاحيات** | **مُعالج ومثبت** | `apps/api/src/modules/agent/agent.service.ts` (الأسطر 60-70، 268-280، 305-317)<br>`agent.controller.ts` (الأسطر 40-75) | التحقق الصارم من `device.tenantId === tenantId` عند التوليد والاستعلام والإلغاء. اختبار `agent.service.spec.ts:89 & 288`. |
| **6. رفض التوكن الملغى ومنع التسريب** | **مُعالج ومثبت** | `apps/api/src/modules/agent/agent.service.ts` (الأسطر 318-358)<br>`apps/api/src/app.module.ts` (الأسطر 64-70) | رفض صريح `Agent access has been revoked` + تشويش الـ Hash + حجب `pairingCode` و `agentToken` في Pino. اختبار `agent.service.spec.ts:318`. |
| **7. مراجعة Prisma والمخطط** | **مُعالج ومثبت** | `apps/api/prisma/schema.prisma` | تعديلات تراكمية فقط بدون مساس بأي جداول قائمة وبدون تنفيذ migrations على قاعدة بيانات الإنتاج. |

---

## 3. نتائج الاختبارات الآلية والبناء الفعلي (Test Results)

تم تحديث وتوسيع جناح الاختبارات الآلية ليغطي كافة الحالات السلبية وحالات الفشل المعقدة والتزامن:

### 3.1. نتائج اختبارات الوحدة الخاصة بالوكيل (`AgentService` & `AgentController`)
```
PASS src/modules/agent/agent.service.spec.ts
  AgentService
    generatePairingCode
      √ should generate a 6-digit code with salted HMAC using private server secret
      √ should reject non-existent router device with NotFoundException
      √ should enforce tenant isolation: reject device belonging to another tenant
      √ should allow Super Admin (tenantId: undefined) to generate code for any valid device
    pairAgent (Atomicity, Security & Concurrency)
      √ should atomically consume code, invalidate old agent, and create new agent in single transaction
      √ should roll back and reject concurrent requests with ConflictException if code consumed by another worker
      √ should roll back code consumption if agent creation fails mid-transaction (Partial Failure Protection)
      √ should enforce persistent lockout (HTTP 429) across restarts via database attempt store
      √ should record persistent failed attempt in DB on invalid code and enforce code threshold
    Re-pairing after Revocation (Historical Preservation)
      √ should support re-pairing a new agent on same router while preserving revoked record
    revokeAgent
      √ should revoke active agent, scramble token hash, and record timestamp
      √ should enforce tenant boundary and prevent Tenant A from revoking Tenant B device agent
      √ should throw NotFoundException if no active agent is registered for the device
    validateAgentToken
      √ should return valid agent metadata for active agent
      √ should reject revoked agent with UnauthorizedException (Revocation Enforcement)
      √ should reject invalid or scrambled token with UnauthorizedException
      √ should reject agent if associated tenant is suspended
      √ should reject agent if associated router device has been deleted

PASS src/modules/agent/agent.controller.spec.ts
  AgentController
    generatePairingCode
      √ should delegate code generation to service
    getAgentStatus
      √ should return agent status from service
    revokeAgent
      √ should delegate revocation to service
      √ should support alternative POST revoke endpoint
    pairAgent
      √ should extract client IP and user agent and call service
      √ should handle x-forwarded-for header properly
    validateToken
      √ should delegate token validation to service

Test Suites: 2 passed, 2 total
Tests:       25 passed, 25 total
```

### 3.2. نتائج الفحص الشامل لكافة أجنحة الاختبار للمشروع (`@mikrotik-saas/api`)
```
Test Suites: 20 passed, 20 total
Tests:       130 passed, 130 total
Snapshots:   0 total
Time:        57.754 s
Ran all test suites.
Exit code: 0
```

### 3.3. التحقق من البناء الإنتاجي
```
pnpm --filter @mikrotik-saas/api build
✔ Shared Types built
✔ Shared Validation built
✔ Prisma Client (v5.22.0) generated
✔ NestJS production build completed cleanly (dist/ generated)
Exit code: 0
```

---

## 4. النقاط التي لم يتم إثباتها ميدانياً بعد وتتطلب مراحل لاحقة

بناءً على مبدأ الشفافية الهندسية وعدم ادعاء ما لم يتم اختباره في بيئة حية:
1. **أداء جدول `agent_pairing_attempts` تحت هجمات الـ DDoS الموزعة الضخمة:**
   تم إثبات فاعليته برمجياً وفي اختبارات الوحدة المتزامنة، ولكن في بيئة إنتاج حية تتعرض لملايين الطلبات في الثانية، قد يُفضل مستقبلاً نقله إلى ذاكرة Redis سريعة عبر Redis TTL Keys لتخفيف الحمل عن PostgreSQL. (الجدول الحالي كافٍ تماماً للمرحلة الحالية ولا يتطلب أي اشتراك مدفوع).
2. **اختبار WebSocket والاتصال الحي للوكيل:**
   لم يتم تنفيذه بعد التزاماً بالتوجيهات الصريحة (مؤجل للجزء الثاني).
3. **تطبيق Migration على قاعدة بيانات الإنتاج:**
   لم يتم تنفيذ أي أمر `prisma migrate deploy` على سحابة الإنتاج Supabase؛ ويقتصر المخطط حالياً على الكود وتوليد الأنواع محلياً (`prisma generate`) بانتظار الاعتماد.

---

## 5. الخاتمة وجاهزية الاعتماد

أصبحت بنية **تسجيل وإقران وإلغاء الوكيل** الآن في أعلى مستويات المتانة الأمنية والتناغم المعماري:
- محصنة ضد التخمين والتزامن وتسريب السجلات.
- تدعم إعادة الإقران المتكرر مع حفظ السجل التاريخي الكامل.
- تضمن العزل التام للمستأجرين والتحقق الثلاثي من الصلاحيات.

نحن متوقفون الآن لمراجعتكم واعتماد هذه المراجعة الأمنية تمهيداً للانتقال إلى الجزء الثاني.
