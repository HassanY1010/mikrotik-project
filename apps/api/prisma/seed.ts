import {
  PrismaClient,
  TenantStatus,
  UserStatus,
  SubscriptionStatus,
  BillingCycle,
} from '@prisma/client';
import { RoleName } from '@mikrotik-saas/shared-types';
import { hash } from '@node-rs/argon2';

const prisma = new PrismaClient();

const ARGON2_OPTIONS = {
  memoryCost: 65536,
  timeCost: 3,
  outputLen: 32,
  parallelism: 4,
};

async function main(): Promise<void> {
  console.log('🌱 Starting database seeding...');

  // ===========================================================================
  // 1. PERMISSIONS
  // ===========================================================================
  console.log('1️⃣ Seeding permissions...');

  const permissionsData = [
    // Tenants module (Super Admin)
    {
      code: 'tenants:read',
      name: 'قراءة المستأجرين',
      description: 'عرض قائمة المستأجرين وتفاصيلهم',
      module: 'tenants',
    },
    {
      code: 'tenants:create',
      name: 'إنشاء مستأجر',
      description: 'تسجيل مستأجر جديد في المنصة',
      module: 'tenants',
    },
    {
      code: 'tenants:update',
      name: 'تعديل مستأجر',
      description: 'تعديل بيانات وحالة المستأجر',
      module: 'tenants',
    },
    {
      code: 'tenants:delete',
      name: 'حذف مستأجر',
      description: 'تعطيل أو حذف المستأجر',
      module: 'tenants',
    },

    // Subscriptions module
    {
      code: 'subscriptions:read',
      name: 'عرض الاشتراكات',
      description: 'عرض اشتراكات وباقات المستأجرين',
      module: 'subscriptions',
    },
    {
      code: 'subscriptions:manage',
      name: 'إدارة الاشتراكات',
      description: 'تفعيل وتجديد اشتراكات المستأجرين يدويًا',
      module: 'subscriptions',
    },

    // Devices module
    {
      code: 'devices:read',
      name: 'عرض الأجهزة',
      description: 'عرض أجهزة ميكروتك وحالتها',
      module: 'devices',
    },
    {
      code: 'devices:create',
      name: 'إضافة جهاز',
      description: 'إضافة راوتر ميكروتك جديد',
      module: 'devices',
    },
    {
      code: 'devices:update',
      name: 'تعديل جهاز',
      description: 'تعديل إعدادات وبيانات الاتصال بالجهاز',
      module: 'devices',
    },
    {
      code: 'devices:delete',
      name: 'حذف جهاز',
      description: 'إزالة جهاز ميكروتك',
      module: 'devices',
    },
    {
      code: 'devices:sync',
      name: 'مزامنة الجهاز',
      description: 'تنفيذ مزامنة فورية مع راوتر ميكروتك',
      module: 'devices',
    },

    // HotSpot profiles module
    {
      code: 'hotspot:read',
      name: 'عرض بروفايلات الهوت سبوت',
      description: 'عرض بروفايلات سرعات وتوقيتات الهوت سبوت',
      module: 'hotspot',
    },
    {
      code: 'hotspot:write',
      name: 'إدارة بروفايلات الهوت سبوت',
      description: 'إنشاء وتعديل بروفايلات الهوت سبوت',
      module: 'hotspot',
    },

    // Cards module
    {
      code: 'cards:read',
      name: 'عرض الكروت',
      description: 'عرض وبحث وتصفية كروت الهوت سبوت',
      module: 'cards',
    },
    {
      code: 'cards:generate',
      name: 'توليد كروت',
      description: 'إنشاء دفعات كروت هوت سبوت جديدة',
      module: 'cards',
    },
    {
      code: 'cards:export',
      name: 'تصدير الكروت',
      description: 'تصدير الكروت كملف Excel أو PDF',
      module: 'cards',
    },
    {
      code: 'cards:disable',
      name: 'تعطيل الكروت',
      description: 'تعطيل أو إلغاء تفعيل الكروت في الراوتر',
      module: 'cards',
    },

    // Sales module
    {
      code: 'sales:read',
      name: 'عرض المبيعات',
      description: 'عرض فواتير وسجلات مبيعات الكروت',
      module: 'sales',
    },
    {
      code: 'sales:create',
      name: 'بيع كارت',
      description: 'تسجيل عملية بيع وإصدار الفاتورة',
      module: 'sales',
    },

    // Printing module
    {
      code: 'printing:execute',
      name: 'طباعة الكروت',
      description: 'إرسال أوامر الطباعة للطابعات الحرارية أو A4',
      module: 'printing',
    },
    {
      code: 'printing:templates',
      name: 'إدارة قوالب الطباعة',
      description: 'تصميم وتعديل قوالب وتصاميم الكروت',
      module: 'printing',
    },

    // Users & Roles module
    {
      code: 'users:read',
      name: 'عرض المستخدمين',
      description: 'عرض مستخدمي الحساب وصلاحياتهم',
      module: 'users',
    },
    {
      code: 'users:write',
      name: 'إدارة المستخدمين',
      description: 'إضافة وتعديل صلاحيات المحاسبين والمدراء',
      module: 'users',
    },

    // Reports & Analytics
    {
      code: 'reports:view',
      name: 'عرض التقارير',
      description: 'الاطلاع على التقارير المالية والتحليلية',
      module: 'reports',
    },

    // Audit logs
    {
      code: 'audit:view',
      name: 'عرض سجل التدقيق',
      description: 'مراجعة كافة العمليات وسجلات النظام',
      module: 'audit',
    },
  ];

  const permissionsMap = new Map<string, string>();

  for (const perm of permissionsData) {
    const record = await prisma.permission.upsert({
      where: { code: perm.code },
      update: { name: perm.name, description: perm.description, module: perm.module },
      create: perm,
    });
    permissionsMap.set(record.code, record.id);
  }

  // ===========================================================================
  // 2. SYSTEM ROLES
  // ===========================================================================
  console.log('2️⃣ Seeding system roles...');

  const rolesData = [
    {
      name: RoleName.SUPER_ADMIN,
      description: 'مدير المنصة الشامل (مالك الـ SaaS)',
      isSystem: true,
      permissions: Object.keys(permissionsMap), // All permissions
    },
    {
      name: RoleName.TENANT_ADMIN,
      description: 'مدير الشبكة (مالك حساب المستأجر)',
      isSystem: true,
      permissions: [
        'devices:read',
        'devices:create',
        'devices:update',
        'devices:delete',
        'devices:sync',
        'hotspot:read',
        'hotspot:write',
        'cards:read',
        'cards:generate',
        'cards:export',
        'cards:disable',
        'sales:read',
        'sales:create',
        'printing:execute',
        'printing:templates',
        'users:read',
        'users:write',
        'reports:view',
        'audit:view',
      ],
    },
    {
      name: RoleName.MANAGER,
      description: 'مدير فرع / عمليات',
      isSystem: true,
      permissions: [
        'devices:read',
        'devices:sync',
        'hotspot:read',
        'cards:read',
        'cards:generate',
        'cards:export',
        'sales:read',
        'sales:create',
        'printing:execute',
        'users:read',
        'reports:view',
      ],
    },
    {
      name: RoleName.CASHIER,
      description: 'محاسب / نقطة بيع',
      isSystem: true,
      permissions: ['cards:read', 'sales:read', 'sales:create', 'printing:execute'],
    },
  ];

  const rolesMap = new Map<string, string>();

  for (const roleData of rolesData) {
    // Find or create system role
    let role = await prisma.role.findFirst({
      where: { name: roleData.name, tenantId: null },
    });

    if (!role) {
      role = await prisma.role.create({
        data: {
          name: roleData.name,
          description: roleData.description,
          isSystem: true,
          tenantId: null,
        },
      });
    }

    rolesMap.set(roleData.name, role.id);

    // Assign role permissions
    for (const permCode of roleData.permissions) {
      const permId = permissionsMap.get(permCode);
      if (permId) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permId,
            },
          },
          update: {},
          create: {
            roleId: role.id,
            permissionId: permId,
          },
        });
      }
    }
  }

  // ===========================================================================
  // 3. SUBSCRIPTION PLANS
  // ===========================================================================
  console.log('3️⃣ Seeding subscription plans...');

  const plansData = [
    {
      name: 'BASIC',
      nameAr: 'الباقة الأساسية (راوتر واحد)',
      description: 'مثالية للشبكات الصغيرة والمقاهي مع راوتر ميكروتك واحد',
      maxRouters: 1,
      priceMonthly: 15.0,
      priceYearly: 150.0,
      features: {
        maxRouters: 1,
        cardGenerationLimit: 10000,
        thermalPrinting: true,
        a4Printing: true,
        basicReports: true,
        offlineSales: true,
      },
    },
    {
      name: 'PRO',
      nameAr: 'الباقة الاحترافية (3 راوترات)',
      description: 'مناسبة للشبكات المتوسطة وإدارة حتى 3 أجهزة ميكروتك ونقاط بيع متعددة',
      maxRouters: 3,
      priceMonthly: 30.0,
      priceYearly: 300.0,
      features: {
        maxRouters: 3,
        cardGenerationLimit: 50000,
        thermalPrinting: true,
        a4Printing: true,
        advancedReports: true,
        multiCashier: true,
        customTemplates: true,
        offlineSales: true,
      },
    },
    {
      name: 'BUSINESS',
      nameAr: 'باقة الأعمال (5 راوترات)',
      description: 'حل متكامل للمزودين الكبار وشبكات المدن مع دعم حتى 5 أجهزة ميكروتك وأعلى أداء',
      maxRouters: 5,
      priceMonthly: 50.0,
      priceYearly: 500.0,
      features: {
        maxRouters: 5,
        cardGenerationLimit: 200000,
        thermalPrinting: true,
        a4Printing: true,
        fullAnalytics: true,
        unlimitedCashiers: true,
        customTemplates: true,
        prioritySupport: true,
        offlineSales: true,
      },
    },
  ];

  const plansMap = new Map<string, string>();

  for (const plan of plansData) {
    const record = await prisma.subscriptionPlan.upsert({
      where: { name: plan.name },
      update: {
        nameAr: plan.nameAr,
        description: plan.description,
        maxRouters: plan.maxRouters,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        features: plan.features,
      },
      create: plan,
    });
    plansMap.set(plan.name, record.id);
  }

  // ===========================================================================
  // 4. SUPER ADMIN USER
  // ===========================================================================
  console.log('4️⃣ Seeding Super Admin user...');

  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL ?? 'superadmin@mikrotik-saas.local';
  const superAdminRawPassword = process.env.SUPER_ADMIN_PASSWORD ?? 'SuperAdmin@2026';
  const superAdminPasswordHash = await hash(superAdminRawPassword, ARGON2_OPTIONS);
  const superAdminRoleId = rolesMap.get(RoleName.SUPER_ADMIN)!;

  await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: {
      passwordHash: superAdminPasswordHash,
      roleId: superAdminRoleId,
      status: UserStatus.ACTIVE,
    },
    create: {
      email: superAdminEmail,
      passwordHash: superAdminPasswordHash,
      fullName: 'مدير المنصة العام (Super Admin)',
      phone: '+967770000000',
      roleId: superAdminRoleId,
      status: UserStatus.ACTIVE,
      tenantId: null,
    },
  });

  // ===========================================================================
  // 5. DEMO TENANT, USERS & SUBSCRIPTION
  // ===========================================================================
  console.log('5️⃣ Seeding Demo Tenant (شبكة النور هوت سبوت)...');

  const demoTenant = await prisma.tenant.upsert({
    where: { slug: 'al-noor' },
    update: {
      name: 'شبكة النور هوت سبوت',
      currency: 'YER',
      status: TenantStatus.ACTIVE,
      contactEmail: 'contact@alnoor-wifi.local',
    },
    create: {
      name: 'شبكة النور هوت سبوت',
      slug: 'al-noor',
      status: TenantStatus.ACTIVE,
      currency: 'YER',
      address: 'صنعاء - شارع حدة',
      phone: '+967771234567',
      contactEmail: 'contact@alnoor-wifi.local',
    },
  });

  // Demo Subscription (PRO plan for 1 year)
  const proPlanId = plansMap.get('PRO')!;
  const existingSub = await prisma.subscription.findFirst({
    where: { tenantId: demoTenant.id },
  });

  if (!existingSub) {
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

    await prisma.subscription.create({
      data: {
        tenantId: demoTenant.id,
        planId: proPlanId,
        status: SubscriptionStatus.ACTIVE,
        billingCycle: BillingCycle.YEARLY,
        startsAt: new Date(),
        expiresAt: oneYearFromNow,
        maxRouters: 3,
        price: 300.0,
        notes: 'اشتراك تجريبي مفعل تلقائيًا',
      },
    });
  }

  // Demo Tenant Admin
  const tenantAdminEmail = 'admin@alnoor-wifi.local';
  const tenantAdminHash = await hash('AlNoor@Admin2026', ARGON2_OPTIONS);
  const tenantAdminRoleId = rolesMap.get(RoleName.TENANT_ADMIN)!;

  await prisma.user.upsert({
    where: { email: tenantAdminEmail },
    update: {
      passwordHash: tenantAdminHash,
      roleId: tenantAdminRoleId,
      tenantId: demoTenant.id,
      status: UserStatus.ACTIVE,
    },
    create: {
      email: tenantAdminEmail,
      passwordHash: tenantAdminHash,
      fullName: 'م. أحمد النور (مدير الشبكة)',
      phone: '+967771234568',
      roleId: tenantAdminRoleId,
      tenantId: demoTenant.id,
      status: UserStatus.ACTIVE,
    },
  });

  // Demo Cashier
  const cashierEmail = 'cashier@alnoor-wifi.local';
  const cashierHash = await hash('Cashier@2026', ARGON2_OPTIONS);
  const cashierRoleId = rolesMap.get(RoleName.CASHIER)!;

  await prisma.user.upsert({
    where: { email: cashierEmail },
    update: {
      passwordHash: cashierHash,
      roleId: cashierRoleId,
      tenantId: demoTenant.id,
      status: UserStatus.ACTIVE,
    },
    create: {
      email: cashierEmail,
      passwordHash: cashierHash,
      fullName: 'سالم الكاشير (نقطة بيع 1)',
      phone: '+967771234569',
      roleId: cashierRoleId,
      tenantId: demoTenant.id,
      status: UserStatus.ACTIVE,
    },
  });

  // Demo Default Card Template
  const existingTemplate = await prisma.cardTemplate.findFirst({
    where: { tenantId: demoTenant.id, isDefault: true },
  });

  if (!existingTemplate) {
    await prisma.cardTemplate.create({
      data: {
        tenantId: demoTenant.id,
        name: 'القالب القياسي - كارت حراري 85x54',
        widthMm: 85,
        heightMm: 54,
        orientation: 'landscape',
        isDefault: true,
        layoutConfig: {
          showNetworkName: true,
          networkName: 'شبكة النور هوت سبوت',
          showQrCode: true,
          qrCodeSize: 24,
          showBarcode: false,
          showPin: true,
          pinFontSize: 14,
          pinFontWeight: 'bold',
          showSerialNumber: true,
          showPrice: true,
          showValidity: true,
          footerText: 'خدمة العملاء: 771234567 | نتمنى لكم تصفحاً ممتعاً',
        },
      },
    });
  }

  console.log('✅ Seeding completed successfully!');
  console.log('--------------------------------------------------');
  console.log(`🔑 Super Admin Email:    ${superAdminEmail}`);
  console.log(`🔑 Super Admin Password: ${superAdminRawPassword}`);
  console.log(`🏢 Demo Tenant Admin:    ${tenantAdminEmail} / AlNoor@Admin2026`);
  console.log(`💼 Demo Cashier:         ${cashierEmail} / Cashier@2026`);
  console.log('--------------------------------------------------');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
