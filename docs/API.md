# دليل واجهة برمجة التطبيقات الكامل (Comprehensive REST API Reference)

## MikroTik HotSpot Cards Management SaaS Platform

---

### الترويسات العامة والإلزامية (Global Request Headers)

| الترويسة (Header) | الوصف                                                                               | الإلزامية                         |
| :---------------- | :---------------------------------------------------------------------------------- | :-------------------------------- |
| `Authorization`   | توكن الجلسة المشفر بتنسيق `Bearer <JWT_TOKEN>`.                                     | إلزامي لكافة المسارات المحمية.    |
| `x-tenant-id`     | معرّف المستأجر المطلوب العمل ضمن نطاقه (مسموح لحسابات `SUPER_ADMIN` لتبديل السياق). | اختياري / إلزامي للـ Super Admin. |
| `Content-Type`    | نوع البيانات المرسلة، القيمة الافتراضية: `application/json`.                        | إلزامي لطلبات POST / PATCH / PUT. |

---

### 1. وحدة التوثيق وإدارة الجلسات (Authentication Module — `/auth`)

#### 1.1 تسجيل الدخول (Login)

- **المسار:** `POST /auth/login`
- **الصلاحية المطلوبة:** عام (Public)
- **جسم الطلب (Request Body):**
  ```json
  {
    "email": "owner@network.local",
    "password": "StrongPassword123"
  }
  ```
- **الاستجابة الناجحة (200 OK):**
  ```json
  {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi...",
    "expiresIn": 900,
    "user": {
      "id": "usr_c49e7b21",
      "email": "owner@network.local",
      "fullName": "مدير الشبكة",
      "role": "TENANT_ADMIN",
      "tenantId": "tnt_00000001"
    }
  }
  ```

#### 1.2 تجديد رمز الدخول (Refresh Token)

- **المسار:** `POST /auth/refresh`
- **جسم الطلب:**
  ```json
  {
    "refreshToken": "eyJhbGciOi..."
  }
  ```

#### 1.3 تسجيل مستأجر جديد (Register Tenant)

- **المسار:** `POST /auth/register-tenant`
- **الصلاحية:** عام (Public)
- **جسم الطلب:**
  ```json
  {
    "tenantName": "شبكة الأفق نت",
    "slug": "al-ofuq",
    "adminEmail": "admin@ofuq.net",
    "adminPassword": "SecurePassword#2026",
    "adminFullName": "أحمد اليماني",
    "currency": "YER"
  }
  ```

---

### 2. وحدة المستأجرين والاشتراكات (Tenants Module — `/tenants`)

#### 2.1 جلب قائمة المستأجرين

- **المسار:** `GET /tenants`
- **الصلاحية:** `SUPER_ADMIN`
- **الاستجابة:** قائمة المستأجرين، عدد الأجهزة، عدد البطاقات النشطة، والحالة.

#### 2.2 تعديل حالة المستأجر (Update Status)

- **المسار:** `PATCH /tenants/:id/status`
- **الصلاحية:** `SUPER_ADMIN`
- **جسم الطلب:**
  ```json
  {
    "status": "SUSPENDED",
    "reason": "تأخر سداد الاشتراك الشهري"
  }
  ```

#### 2.3 اعتماد أو تمديد الاشتراك (Approve Subscription)

- **المسار:** `POST /tenants/:id/approve-subscription`
- **الصلاحية:** `SUPER_ADMIN`
- **جسم الطلب:**
  ```json
  {
    "plan": "ENTERPRISE",
    "durationMonths": 12,
    "maxDevices": 10,
    "maxActiveCards": 50000
  }
  ```

---

### 3. وحدة أجهزة وشبكات ميكروتك (Devices Module — `/devices`)

#### 3.1 استعراض الأجهزة المربوطة

- **المسار:** `GET /devices`
- **الصلاحية:** `TENANT_ADMIN`, `MANAGER`
- **الاستجابة:** قائمة الموجهات مع عنوان IP، نوع البروتوكول، وحالة الاتصال
  اللحظية.

#### 3.2 إضافة راوتر جديد

- **المسار:** `POST /devices`
- **الصلاحية:** `TENANT_ADMIN`
- **جسم الطلب:**
  ```json
  {
    "name": "راوتر البرج الرئيسي",
    "ipAddress": "192.168.88.1",
    "apiPort": 8728,
    "username": "saas_admin",
    "password": "RouterPassword123",
    "protocol": "API_SOCKET",
    "hotspotServer": "all"
  }
  ```

#### 3.3 فحص الاتصال بالراوتر (Ping Test)

- **المسار:** `POST /devices/:id/ping`
- **الاستجابة:** `{ "success": true, "latencyMs": 14, "status": "ONLINE" }`

#### 3.4 تشخيص موارد الراوتر اللحظية (Diagnostics)

- **المسار:** `GET /devices/:id/diagnostics`
- **الاستجابة:**
  ```json
  {
    "cpuLoad": 18,
    "freeMemoryBytes": 134217728,
    "totalMemoryBytes": 268435456,
    "uptime": "42d 16:32:05",
    "activeHotspotUsers": 128,
    "boardName": "RB4011iGS+",
    "routerOsVersion": "7.15.2"
  }
  ```

#### 3.5 إعادة تشغيل الراوتر عن بُعد (Reboot)

- **المسار:** `POST /devices/:id/reboot`
- **الصلاحية:** `TENANT_ADMIN`

---

### 4. وحدة باقات الهوتسبوت (HotSpot Profiles — `/hotspot/profiles`)

#### 4.1 استعراض الباقات

- **المسار:** `GET /hotspot/profiles`
- **الاستجابة:** قائمة الباقات، السرعات (Rate Limit)، السعر، والصلاحية.

#### 4.2 إنشاء باقة جديدة

- **المسار:** `POST /hotspot/profiles`
- **جسم الطلب:**
  ```json
  {
    "name": "profile_10gb",
    "displayName": "باقة 10 جيجابايت الشهرية",
    "rateLimit": "4M/1M",
    "validityDurationMinutes": 43200,
    "dataLimitBytes": 10737418240,
    "price": 3000,
    "currency": "YER",
    "sharedUsers": 1
  }
  ```

#### 4.3 مزامنة الباقة مع أجهزة ميكروتك (Sync Profile)

- **المسار:** `POST /hotspot/profiles/:id/sync`
- **الوصف:** إنشاء أو تحديث User Profile داخل `/ip hotspot user profile` في كافة
  موجهات المستأجر النشطة.

---

### 5. وحدة البطاقات والدفعات المشفرة (Cards Module — `/cards`)

#### 5.1 استعراض البطاقات والفلترة

- **المسار:** `GET /cards`
- **معاملات البحث (Query Parameters):**
  - `status`: `AVAILABLE` | `ACTIVE` | `EXPIRED` | `DISABLED`
  - `profileId`: معرّف الباقة
  - `search`: بحث برقم البطاقة
  - `page`, `limit`: الترقيم الصفحي

#### 5.2 توليد دفعة بطاقات جديدة (Generate CSPRNG Batch)

- **المسار:** `POST /cards/batches`
- **الصلاحية:** `TENANT_ADMIN`, `MANAGER`
- **جسم الطلب:**
  ```json
  {
    "profileId": "prf_89d31f0a",
    "quantity": 100,
    "codeLength": 8,
    "prefix": "OFQ",
    "characterSet": "NUMERIC"
  }
  ```

---

### 6. وحدة المبيعات ونقاط البيع والاسترداد (Sales & POS — `/sales`)

#### 6.1 تنفيذ عملية بيع فورية (Checkout Sale)

- **المسار:** `POST /sales/checkout`
- **الصلاحية:** `TENANT_ADMIN`, `MANAGER`, `CASHIER`
- **جسم الطلب:**
  ```json
  {
    "cardId": "crd_1289ab34",
    "paymentMethod": "CASH",
    "buyerPhone": "777123456",
    "notes": "بيع عبر الكاشير رقم 1"
  }
  ```

#### 6.2 استرداد قيمة الفاتورة الذري (Atomic Refund)

- **المسار:** `POST /sales/transactions/:id/refund`
- **الصلاحية:** `TENANT_ADMIN`, `MANAGER`
- **جسم الطلب:**
  ```json
  {
    "reason": "خطأ في اختيار الباقة من قبل العميل"
  }
  ```
- **السلوك التلقائي:** يتم تحديث الفاتورة إلى `REFUNDED`، وإرجاع الرصيد،
  والتواصل فوراً مع راوتر ميكروتك لحذف أو تعطيل حساب المستخدم المقترن بالكرت.

---

### 7. محرك المزامنة غير المتصلة (Offline Sync Module — `/sync`)

#### 7.1 حجز بطاقات للبيع بدون إنترنت (Reserve Cards)

- **المسار:** `POST /sync/reserve-cards`
- **جسم الطلب:**
  ```json
  {
    "profileId": "prf_89d31f0a",
    "quantity": 50,
    "deviceIdentifier": "FLUTTER_POS_TERMINAL_01"
  }
  ```

#### 7.2 الجلب التفاضلي (Delta Pull)

- **المسار:** `GET /sync/pull?lastPulledAt=2026-10-04T12:00:00.000Z`
- **الاستجابة:** قائمة الكيانات (الباقات، الأجهزة، الإعدادات) التي تم إنشاؤها أو
  تعديلها بعد هذا الختم الزمني.

#### 7.3 دفع التغييرات وتسوية التعارضات (Push Mutations)

- **المسار:** `POST /sync/push`
- **جسم الطلب:** مصفوفة من العمليات المحلية غير المتزامنة المنفذة على الهاتف
  للتدقيق والاعتماد النهائي على الخادم.

---

### 8. وحدة التقارير والتحليلات وسجل التدقيق (Reports & Audit Logs)

#### 8.1 تقرير مبيعات الوردية (Cashier Shift Report)

- **المسار:** `GET /reports/shifts?cashierId=usr_c49e7b21&startDate=2026-10-01`

#### 8.2 استعلام سجل التدقيق (Audit Logs Query)

- **المسار:** `GET /audit-logs?action=CARD_GENERATED&entityType=CardBatch`
