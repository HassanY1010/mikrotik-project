# تقرير إنجاز المرحلة الثالثة — الجزء الأول (Agent Step 1 Report)
**تسجيل الوكيل وإقرانه وتوثيق هويته وإلغاء صلاحيته (Agent Registration, Pairing, Authentication & Revocation)**  
**المسار:** `E:\microTik_project`  
**تاريخ الإنجاز:** 10 أكتوبر 2026  
**الحالة:** مكتمل ومختبر برمجياً بنسبة 100% (20/20 أجنحة اختبار ناجحة — 129/129 اختبارات ناجحة)

---

## 1. ملخص تنفيذي (Executive Summary)

تم إنجاز الجزء الأول من المرحلة الثالثة بنجاح كامل وفقاً للاشتراطات الهندسية والأمنية الصارمة، دون المساس بأي كود سابق أو التأثير على اشتراكات أو حصص أو مزامنة الكروت، ودون تنفيذ أي تغييرات تدميرية على قاعدة البيانات أو بيئة الإنتاج على Render.

تضمن هذا الإنجاز:
1. تحديث مخطط Prisma بإضافة نموذجي `DeviceAgent` و `AgentPairingCode` وتعداد `AgentStatus`، وتوليد عميل Prisma المحدث بنجاح.
2. بناء وحدة NestJS متكاملة `AgentModule` تشتمل على `AgentService` و `AgentController` وكافة DTOs اللازمة.
3. تطبيق نظام تشفيري لرموز الإقران (6 أرقام عشوائية مشفرة بـ Salted HMAC-SHA256) بصلاحية 5 دقائق.
4. تنفيذ الاستهلاك الذري للرمز لمنع هجمات التزامن (Race Conditions) وإعادة الاستخدام (Replay Attacks).
5. بناء آلية متقدمة لتحديد معدل الطلبات (Rate Limiting) وقفل المحاولات المتكررة (Lockout لمدة 15 دقيقة بعد 5 محاولات فاشلة).
6. فرض عزل المستأجرين والتحقق الثلاثي من ملكية الراوتر وصلاحيات المستخدم عند كل عملية.
7. إصدار بيانات اعتماد مستقلة للوكيل (`AgentAuthToken` بطول 64 حرفاً و256-بت إنتروبيا) وتخزين الـ Hash فقط في قاعدة البيانات.
8. توفير ميزة الإلغاء الفوري للصلاحية (`Revocation`) مع تشويش الـ Hash لمنع أي مصادقة لاحقة.
9. تطبيق سياسة حظر تسجيل الأسرار في السجلات (Zero-Credential Logging) وتفعيل التعتيم التلقائي في `LoggerModule` عبر Pino.
10. كتابة واجتياز 24 اختباراً آلياً جديداً تغطي جميع الحالات الإيجابية والسلبية والتزامن والتخمين والإلغاء.

---

## 2. النماذج والتعديلات في قاعدة البيانات (Prisma Schema Additions)

تمت إضافة النماذج التالية بصورة تراكمية وغير تدميرية في `apps/api/prisma/schema.prisma`:

### 2.1. تعداد حالة الوكيل (`AgentStatus`)
```prisma
enum AgentStatus {
  ONLINE
  OFFLINE
  REVOKED
}
```

### 2.2. جدول الوكيل المرتبط بالراوتر (`DeviceAgent`)
```prisma
model DeviceAgent {
  id         String      @id @default(uuid())
  tenantId   String
  deviceId   String      @unique // وكيل نشط واحد لكل راوتر
  name       String      // اسم الجهاز المضيف (مثال: "Cashier-POS-PC")
  tokenHash  String      @unique // SHA-256 Hash لرمز الوصول المستقل
  status     AgentStatus @default(OFFLINE)
  version    String?     // إصدار برنامج الوكيل
  ipAddress  String?     // آخر عنوان IP خارجي مسجل
  lastPingAt DateTime?
  pairedAt   DateTime    @default(now())
  revokedAt  DateTime?
  createdAt  DateTime    @default(now())
  updatedAt  DateTime    @updatedAt

  tenant Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  device MikroTikDevice @relation(fields: [deviceId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([deviceId])
  @@index([status])
  @@map("device_agents")
}
```

### 2.3. جدول رموز الإقران المؤقتة (`AgentPairingCode`)
```prisma
model AgentPairingCode {
  id          String    @id @default(uuid())
  tenantId    String
  deviceId    String
  codeHash    String    @unique // HMAC-SHA256 Hash
  salt        String    // Salt عشوائي فريد لكل رمز
  attempts    Int       @default(0) // عداد المحاولات الفاشلة
  maxAttempts Int       @default(3) // حد القفل الخاص بالرمز
  isConsumed  Boolean   @default(false)
  consumedAt  DateTime?
  expiresAt   DateTime  // تاريخ انتهاء الصلاحية (5 دقائق)
  createdAt   DateTime  @default(now())

  tenant Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  device MikroTikDevice @relation(fields: [deviceId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([deviceId])
  @@index([codeHash])
  @@map("agent_pairing_codes")
}
```

---

## 3. التنفيذ البرمجي والأمني (Security & Implementation Highlights)

### 3.1. التوليد والتشفير الآمن لرمز الإقران
- يُولد الرمز المكون من 6 أرقام عبر `crypto.randomInt(100000, 1000000)`، وهو مولد عشوائي آمن تشفيرياً ومقاوم للتنبؤ.
- يُنشأ Salt فريد بطول 16 بايت لكل رمز: `crypto.randomBytes(16).toString('hex')`.
- يُخزن الرمز في قاعدة البيانات مشفراً عبر: `crypto.createHmac('sha256', salt).update(rawCode).digest('hex')`.
- لا يُخزن الرمز كنص صريح، ولا يُطبع في أي سجل (Log).
- يتم إبطال أي رموز غير مستهلكة سابقة للراوتر فور توليد رمز جديد.

### 3.2. الاستهلاك الذري ومنع التزامن وإعادة الاستخدام (Atomic Consumption)
- لحماية العملية من طلبين متزامنين بنفس الرمز في نفس الميلي ثانية (Race Condition)، يُنفذ الاستهلاك عبر تحديث شرطي ذري على مستوى قاعدة البيانات:
  ```typescript
  const updateResult = await this.prisma.agentPairingCode.updateMany({
    where: {
      id: matchedCodeRecord.id,
      isConsumed: false,
      expiresAt: { gt: now },
      attempts: { lt: matchedCodeRecord.maxAttempts },
    },
    data: {
      isConsumed: true,
      consumedAt: now,
    },
  });
  if (updateResult.count === 0) {
    throw new ConflictException('Pairing code has already been consumed or has expired');
  }
  ```
- هذا يضمن ميكانيكياً أن طلباً واحداً فقط سينجح، بينما سيحصل أي طلب مكرر أو متزامن على `409 ConflictException`.

### 3.3. تحديد معدل الطلبات والقفل ضد هجمات التخمين (Rate Limiting & Lockout)
- لا يعتمد النظام على عنوان IP بمفرده، بل يجمع بين:
  1. عنوان IP للعميل (مع دعم ترويسات البروكسي `x-forwarded-for`).
  2. هوية العميل / بصمة المتصفح أو الوكيل (`clientIdentifier / User-Agent`).
  3. عداد المحاولات الفاشلة لكل رمز (`attempts >= 3` يقفل الرمز فوراً).
- في حال تسجيل 5 محاولات فاشلة من نفس مفتاح العميل خلال 15 دقيقة، يُقفل العميل فوراً وتُرفض طلباته برمز `429 Too Many Requests` مع رسالة توضح مدة القفل المتبقية.

### 3.4. إصدار بيانات اعتماد الوكيل وإلغاؤها الفوري (Credentials & Revocation)
- عند نجاح الإقران، يُصدر الخادم توكن مستقل `AgentAuthToken` عشوائي بطول 32 بايت (64 حرفاً بنظام Hex) يتمتع بإنتروبيا عالية (256-bit).
- يُخزن في قاعدة البيانات `tokenHash` مشفر بـ `SHA-256`.
- يُعاد التوكن للوكيل لمرة واحدة فقط ليقوم بتخزينه محلياً عبر Windows DPAPI.
- **عند الإلغاء (`Revocation`):**
  - تُحدث حالة الوكيل إلى `REVOKED`.
  - يُستبدل الـ `tokenHash` برمز عشوائي جديد مُموّه، مما يجعل التوكن القديم غير صالح رياضياً ومستحيل المطابقة حتى لو حاول الوكيل استخدامه.
  - يُمنع الوكيل الملغى من المصادقة أو تجديد الجلسات (`validateAgentToken` يرفضه فوراً).

### 3.5. سياسة منع تسريب الأسرار في السجلات (Zero-Credential Logging)
- تم تعزيز إعدادات `LoggerModule` في `apps/api/src/app.module.ts` لتشمل مسارات الحجب التلقائي التالية:
  ```typescript
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.body.password',
    'req.body.currentPassword',
    'req.body.newPassword',
    'req.body.refreshToken',
    'req.body.pairingCode',
    'req.body.agentToken',
    'req.body.token',
  ],
  censor: '[REDACTED]',
  ```

---

## 4. توثيق نقاط النهاية (API Endpoints Specification)

### 4.1. نقاط إدارة لوحة التحكم (محمية بـ JWT + RBAC + TenantGuard)

#### أ) توليد رمز إقران جديد
- **المسار:** `POST /api/v1/devices/:id/agent/pairing-code`
- **الصلاحيات المطلوبة:** `SUPER_ADMIN`, `OWNER`, `TENANT_ADMIN`, `ADMIN`, `MANAGER`
- **الترويسات:** `Authorization: Bearer <JWT>`, `x-tenant-id: <TenantUUID>`
- **رد النجاح (201 Created):**
  ```json
  {
    "code": "482910",
    "expiresAt": "2026-10-10T20:25:00.000Z",
    "expiresInSeconds": 300
  }
  ```

#### ب) استعلام حالة الوكيل المقترن بالراوتر
- **المسار:** `GET /api/v1/devices/:id/agent`
- **الصلاحيات المطلوبة:** كافة أدوار المستأجر والـ Super Admin
- **رد النجاح (200 OK):**
  ```json
  {
    "id": "agent-uuid-7182",
    "tenantId": "tenant-uuid-1",
    "deviceId": "device-uuid-1",
    "name": "Cashier-POS-PC",
    "status": "OFFLINE",
    "version": "1.0.0",
    "ipAddress": "197.251.12.8",
    "lastPingAt": null,
    "pairedAt": "2026-10-10T20:20:00.000Z",
    "revokedAt": null
  }
  ```

#### ج) إلغاء صلاحية الوكيل
- **المسار:** `DELETE /api/v1/devices/:id/agent` (أو `POST /api/v1/devices/:id/agent/revoke`)
- **الصلاحيات المطلوبة:** مدراء المستأجر والـ Super Admin
- **رد النجاح (200 OK):**
  ```json
  {
    "success": true,
    "message": "Agent credentials and access have been revoked successfully"
  }
  ```

---

### 4.2. نقاط الوكيل العامة (تستدعى من برنامج الوكيل)

#### أ) إقران الوكيل واستهلاك الرمز (Pair Agent)
- **المسار:** `POST /api/v1/agent/pair`
- **الحماية:** Rate Limiting / Lockout Tracker (مفتوح بدون JWT)
- **جسم الطلب (Body):**
  ```json
  {
    "pairingCode": "482910",
    "name": "Cashier-POS-PC",
    "version": "1.0.0"
  }
  ```
- **رد النجاح (200 OK):**
  ```json
  {
    "success": true,
    "agentId": "agent-uuid-7182",
    "agentToken": "8f4a21e03d71bc88...64-char-hex...",
    "deviceId": "device-uuid-1",
    "tenantId": "tenant-uuid-1"
  }
  ```
- **ردود الأخطاء المحتملة:**
  - `401 Unauthorized`: رمز غير صحيح أو منتهي الصلاحية.
  - `409 Conflict`: الرمز مستهلك بالفعل.
  - `429 Too Many Requests`: تجاوز محاولات التخمين (قفل لمدة 15 دقيقة).

#### ب) التحقق من صحة توكن الوكيل (Validate Token)
- **المسار:** `POST /api/v1/agent/validate`
- **جسم الطلب (Body):**
  ```json
  {
    "token": "8f4a21e03d71bc88...64-char-hex..."
  }
  ```
- **رد النجاح (200 OK):**
  ```json
  {
    "valid": true,
    "agent": {
      "id": "agent-uuid-7182",
      "tenantId": "tenant-uuid-1",
      "deviceId": "device-uuid-1",
      "status": "OFFLINE",
      "name": "Cashier-POS-PC"
    }
  }
  ```

---

## 5. دليل الاختبار والتحقق المحلي (Local Testing Guide)

يمكنك تجربة دورة الإقران محلياً عبر أداة `curl` أو Postman باتباع الخطوات التالية:

### الخطوة 1: توليد رمز الإقران من لوحة الإدارة
```bash
curl -X POST http://localhost:3000/api/v1/devices/<DEVICE_ID>/agent/pairing-code \
  -H "Authorization: Bearer <TENANT_JWT_TOKEN>" \
  -H "Content-Type: application/json"
```
*النتيجة المتوقعة:* استلام كود من 6 أرقام مثل `{"code":"591240","expiresInSeconds":300}`.

### الخطوة 2: محاكاة إقران الوكيل
```bash
curl -X POST http://localhost:3000/api/v1/agent/pair \
  -H "Content-Type: application/json" \
  -d '{"pairingCode":"591240","name":"Test-Local-PC","version":"1.0.0"}'
```
*النتيجة المتوقعة:* استلام `agentToken` المكون من 64 حرفاً ومعرف الوكيل.

### الخطوة 3: التحقق من حظر إعادة الاستخدام
كرر نفس أمر الخطوة 2 فوراً:
*النتيجة المتوقعة:* استلام خطأ `401` أو `409 Conflict` (رمز مستهلك).

### الخطوة 4: التحقق من صحة التوكن
```bash
curl -X POST http://localhost:3000/api/v1/agent/validate \
  -H "Content-Type: application/json" \
  -d '{"token":"<AGENT_TOKEN_FROM_STEP_2>"}'
```
*النتيجة المتوقعة:* `{"valid":true,"agent":{...}}`.

### الخطوة 5: إلغاء الوكيل
```bash
curl -X DELETE http://localhost:3000/api/v1/devices/<DEVICE_ID>/agent \
  -H "Authorization: Bearer <TENANT_JWT_TOKEN>"
```

### الخطوة 6: التأكد من رفض الوكيل بعد الإلغاء
أعد استدعاء نقطة التحقق (الخطوة 4):
*النتيجة المتوقعة:* رفض فوري `401 Unauthorized: Agent access has been revoked`.

---

## 6. النتائج الفعلية للاختبارات الآلية والبناء (Test Results & Build Verification)

تم تنفيذ جميع الاختبارات الآلية والتحقق من سلامة البناء:

### 6.1. اختبارات الوحدة والتكامل الخاصة بالوكيل (`AgentService` & `AgentController`)
```
PASS src/modules/agent/agent.service.spec.ts
  AgentService
    generatePairingCode
      √ should generate a 6-digit pairing code with 5-minute TTL and salted HMAC
      √ should throw NotFoundException if device does not exist or is deleted
      √ should throw ForbiddenException if device belongs to another tenant
      √ should allow Super Admin (tenantId: undefined) to generate code for any valid device
    pairAgent
      √ should successfully pair agent with valid code and issue 64-char token
      √ should throw UnauthorizedException if pairing code does not match
      √ should throw ConflictException if concurrent request consumes code first
      √ should reject already consumed or expired pairing code
      √ should trigger rate limit lockout (HTTP 429) after 5 consecutive failed attempts from client
    revokeAgent
      √ should successfully revoke agent, scramble token hash, and record timestamp
      √ should enforce tenant boundary and prevent Tenant A from revoking Tenant B device agent
      √ should throw NotFoundException if no agent is registered for the device
    validateAgentToken
      √ should return valid agent metadata for active agent
      √ should reject revoked agent with UnauthorizedException
      √ should reject invalid or non-existent token with UnauthorizedException
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
Tests:       24 passed, 24 total
```

### 6.2. نتائج الجناح الكامل للمشروع (`@mikrotik-saas/api`)
```
Test Suites: 20 passed, 20 total
Tests:       129 passed, 129 total
Snapshots:   0 total
Time:        38.494 s
```

### 6.3. التحقق من البناء الإنتاجي (Production Build)
```
pnpm --filter @mikrotik-saas/api build
✔ Shared Types built successfully
✔ Shared Validation built successfully
✔ Prisma Client (v5.22.0) generated
✔ NestJS build completed cleanly (dist/ generated)
Exit code: 0
```

---

## 7. حدود هذه المرحلة والالتزام بعدم التجاوز (Strict Phase Boundaries)

وفقاً للتوجيهات الصريحة:
1. **لم يتم** بناء بوابة الـ WebSocket الدائمة بعد (`AgentGateway` مؤجلة للجزء الثاني).
2. **لم يتم** إنشاء ملف تنفيذي `sudafi-agent.exe` أو كتابة كود Go بعد (مؤجل للجزء الثالث).
3. **لم يتم** إرسال أي أوامر إلى راوترات ميكروتك حقيقية في هذه الخطوة.
4. **لم يتم** المساس بمنطق توليد الكروت أو الحصص أو الاشتراكات.
5. **لم يتم** تنفيذ migrations على قاعدة بيانات الإنتاج أو تغيير إعدادات Render.

---

## 8. الخاتمة وجاهزية الانتقال للجزء الثاني (Next Steps)

اكتمل الجزء الأول بنجاح تام وتم التحقق من كافة أركان التسجيل والإقران والأمان والعزل. 

نحن متوقفون الآن بانتظار مراجعتكم واعتماد هذا التقرير للبدء في **الجزء الثاني: WebSocket Gateway & Live Heartbeat Protocol**.
