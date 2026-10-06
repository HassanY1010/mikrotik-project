# منصة إدارة كروت شبكات ميكروتك هوت سبوت

## MikroTik HotSpot Cards Management SaaS Platform

A production-grade, multi-tenant SaaS platform engineered for managing MikroTik
HotSpot networks, prepaid card generation, physical/thermal printing, sales
tracking, real-time router synchronization, and comprehensive analytics.

---

## 🌐 الروابط المباشرة على الإنترنت (Live Cloud Deployment)

| الخدمة | الرابط المباشر | الوصف |
| :--- | :--- | :--- |
| **لوحة التحكم الإدارية** | [https://mikrotik-admin.onrender.com](https://mikrotik-admin.onrender.com) | الواجهة الرسومية الكاملة باللغة العربية لإدارة الشبكات والكروت والمبيعات |
| **سيرفر الباك اند (API)** | [https://mikrotik-api-yn0e.onrender.com](https://mikrotik-api-yn0e.onrender.com) | خادم العمليات المركزية وقواعد البيانات السحابية |
| **توثيق الـ API التفاعلي** | [https://mikrotik-api-yn0e.onrender.com/docs](https://mikrotik-api-yn0e.onrender.com/docs) | وثائق ومُجرّب Swagger لجميع الـ Endpoints |
| **فاحص الجاهزية** | [https://mikrotik-api-yn0e.onrender.com/health/ready](https://mikrotik-api-yn0e.onrender.com/health/ready) | مراقبة حالة الخادم وقاعدة بيانات Supabase |

---

## 🏛 المعمارية الشاملة للمشروع (Monorepo Architecture)

```
mikrotik-saas/
├── apps/
│   ├── api/                     # Backend API: NestJS Modular Monolith + Prisma ORM + PostgreSQL 18
│   ├── admin/                   # Admin Web Portal: Vite + React 18 + TypeScript (Arabic RTL Glassmorphism)
│   └── mobile/                  # POS Mobile Client: Flutter 3 + Dart 3 (Offline-First + Thermal ESC/POS)
├── packages/
│   ├── shared-types/            # Canonical domain models, DTOs, Enums, and contracts
│   └── shared-validation/       # Runtime Zod validation schemas
├── docs/
│   ├── ARCHITECTURE.md          # Comprehensive architectural reference & system design
│   ├── OPERATIONS.md            # Production runbooks, native startup, backup & disaster recovery
│   ├── API.md                   # Complete REST API reference documentation
│   └── DECISIONS.md             # Architecture Decision Records (ADRs)
└── scripts/
    ├── start-production.ps1     # Native Windows production startup script
    ├── stop-production.ps1      # Graceful shutdown script
    ├── backup-db.ps1            # Automated PostgreSQL timestamped backup & retention pruner
    └── restore-db.ps1           # Point-in-time PostgreSQL database restoration script
```

---

## 🚀 البدء السريع والتشغيل (Quickstart)

### المتطلبات الأساسية (Prerequisites)

- **Node.js**: v20.x LTS (تم الفحص مع Node v20.19.6)
- **pnpm**: v10.x
- **PostgreSQL**: الإصدار 18+ (خدمة ويندوز محلية نشطة: `postgresql-x64-18` على
  المنفذ 5432)
- **Flutter SDK**: 3.38+ / Dart 3.10+ (لتطوير تطبيق الجوال)

### 1. إعداد البيئة وتثبيت الاعتماديات

```bash
# تثبيت الحزم لكافة مساحات العمل
pnpm install

# إعداد ملف المتغيرات البيئية
cp .env.example .env
```

### 2. تهيئة وتحديث قاعدة البيانات (Prisma Migrations)

```bash
# تطبيق الهجرات البرمجية على قاعدة البيانات
pnpm --filter @mikrotik-saas/api db:migrate:deploy

# زراعة البيانات الأولية للحسابات التجريبية
pnpm --filter @mikrotik-saas/api db:seed
```

### 3. تشغيل وضع التطوير المحلي (Development Mode)

```bash
# تشغيل خادم الـ API (NestJS على المنفذ 3000)
pnpm dev:api

# تشغيل لوحة الإدارة (React على المنفذ 5173)
pnpm dev:admin

# تشغيل تطبيق فلاتر المحمول
cd apps/mobile && flutter run
```

---

## 🛡️ التشغيل في بيئة الإنتاج (Production Runbook)

### التشغيل المباشر عبر PowerShell (موصى به في ويندوز)

```powershell
.\scripts\start-production.ps1
```

يقوم هذا السكربت بالتحقق من خدمة PostgreSQL، وتطبيق الهجرات، والتحقق من حزم
البناء، وإطلاق الخدمات في الخلفية مع كتابة السجلات في `logs/`.

### النسخ الاحتياطي اليومي لقاعدة البيانات

```powershell
.\scripts\backup-db.ps1 -Database "mikrotik_saas" -RetentionDays 14
```

---

## 🧪 معايير الجودة والفحوصات الآلية (Quality Suite)

تلتزم المنصة بمعايير جودة صارمة بدون أي استثناءات (`--max-warnings 0`):

```bash
# 1. فحص التنسيق البرمجي العام
pnpm format:check

# 2. فحص الجودة وخلو الأخطاء الصارم
pnpm -r lint

# 3. فحص تطابق الأنواع الصارم عبر TypeScript
pnpm -r type-check

# 4. بناء كافة حزم الإنتاج
pnpm -r build

# 5. تشغيل أجنحة الاختبارات الآلية (14 Test Suites, 66 Tests Passed)
pnpm -r test
```

---

## 📑 روابط وواجهات النظام (Access Points)

- **لوحة الإدارة السحابية:** `http://localhost:5173`
- **بوابة الـ API الخلفية:** `http://localhost:3000`
- **التوثيق التفاعلي (Swagger / OpenAPI):** `http://localhost:3000/docs`
- **مسبار الصحة (Liveness Probe):** `http://localhost:3000/health/live`
- **مسبار الجاهزية (Readiness Probe):** `http://localhost:3000/health/ready`

---

## 🔒 الأمن وحماية البيانات (Security Architecture)

1. **تشفير كلمات المرور:** خوارزمية Argon2id بمحددات الذاكرة (64MB) والتكرار (3
   دورات).
2. **تشفير بيانات الراوترات والمفاتيح الحساسة:** تشفير متماثل AES-256-GCM أثناء
   السكون (At-Rest).
3. **توليد البطاقات:** مولد عشوائي آمن تشفيرياً (CSPRNG) بدون حروف ملتبسة بصرياً
   لمنع أخطاء المستخدمين.
4. **تعدد المستأجرين الآمن:** عزل منطقي صارم على مستوى طبقة البيانات
   (`tenantId`) مع التحقق التلقائي في كافة الاستعلامات وحماية الحصص (Quotas).
5. **سجل تدقيق كامل:** تسجيل غير قابل للتعديل لكافة العمليات الحساسة مع عناوين
   IP ومعرّفات المستخدمين والبيانات الوصفية.

---

## 📄 الترخيص (License)

جميع الحقوق محفوظة © 2026. المنظومة مبنية وفق المعايير الإنتاجية العالمية لشبكات
ميكروتك هوت سبوت.
