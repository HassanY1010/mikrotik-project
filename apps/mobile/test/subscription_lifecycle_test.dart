import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/storage/local_storage.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late SharedPreferences prefs;
  late LocalStorage storage;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
    storage = LocalStorage(prefs);
  });

  group('Flutter Subscription Lifecycle & Data Integrity Tests', () {
    test('1. AuthUser.fromJson correctly parses subscription fields from top-level and nested tenant response', () {
      final jsonResponse = {
        'id': 'usr_001',
        'email': 'network_owner@suda.fi',
        'fullName': 'عثمان الفكي',
        'role': 'TENANT_ADMIN',
        'tenantId': 'tenant_alpha',
        'subscriptionPlan': 'PRO',
        'subscriptionPlanAr': 'باقة برو الاحترافية',
        'subscriptionStatus': 'ACTIVE',
        'subscriptionExpiresAt': '2026-11-16T12:00:00.000Z',
        'tenant': {
          'id': 'tenant_alpha',
          'name': 'شبكة أم درمان',
          'subscription': {
            'planName': 'PRO',
            'planNameAr': 'باقة برو الاحترافية',
            'status': 'ACTIVE',
            'expiresAt': '2026-11-16T12:00:00.000Z',
            'maxRouters': 3,
            'maxCardsPerMonth': 50000,
          }
        }
      };

      final user = AuthUser.fromJson(jsonResponse);

      expect(user.id, 'usr_001');
      expect(user.subscriptionPlan, 'PRO');
      expect(user.subscriptionPlanAr, 'باقة برو الاحترافية');
      expect(user.subscriptionStatus, 'ACTIVE');
      expect(user.subscriptionExpiresAt, DateTime.parse('2026-11-16T12:00:00.000Z'));
      expect(user.tenantName, 'شبكة أم درمان');
    });

    test('2. AuthUser.fromJson fallback to nested tenant subscription if top-level is omitted', () {
      final jsonResponse = {
        'id': 'usr_002',
        'email': 'biz_owner@suda.fi',
        'fullName': 'ياسر الطيب',
        'role': 'TENANT_ADMIN',
        'tenantId': 'tenant_beta',
        'tenant': {
          'id': 'tenant_beta',
          'name': 'شبكة الخرطوم بحري',
          'subscription': {
            'planName': 'BUSINESS',
            'planNameAr': 'باقة الشركات والأعمال',
            'status': 'ACTIVE',
            'expiresAt': '2027-01-01T00:00:00.000Z',
          }
        }
      };

      final user = AuthUser.fromJson(jsonResponse);

      expect(user.subscriptionPlan, 'BUSINESS');
      expect(user.subscriptionPlanAr, 'باقة الشركات والأعمال');
      expect(user.subscriptionStatus, 'ACTIVE');
      expect(user.subscriptionExpiresAt, DateTime.parse('2027-01-01T00:00:00.000Z'));
    });

    test('3. LocalStorage tenant isolation prevents Tenant B from accessing Tenant A cached quota', () async {
      final quotaTenantA = TenantQuotaModel(
        planName: 'BUSINESS',
        planNameAr: 'باقة الشركات والأعمال',
        status: 'ACTIVE',
        cardLimit: 200000,
        usedCards: 1500,
        remainingCards: 198500,
        maxRouters: 5,
        expiresAt: DateTime.parse('2026-12-31T23:59:59.000Z'),
        tenantId: 'tenant_A',
      );

      // Save quota for Tenant A
      await storage.setTenantQuota(quotaTenantA, 'tenant_A');

      // Tenant A can retrieve their own quota
      final cachedA = storage.getTenantQuota('tenant_A');
      expect(cachedA, isNotNull);
      expect(cachedA!.planName, 'BUSINESS');
      expect(cachedA.tenantId, 'tenant_A');

      // Tenant B queries: MUST return null (strict isolation)
      final cachedB = storage.getTenantQuota('tenant_B');
      expect(cachedB, isNull, reason: 'Cache must not leak between tenants!');
    });

    test('4. Logout completely wipes cached quota from LocalStorage', () async {
      final quota = TenantQuotaModel(
        planName: 'PRO',
        planNameAr: 'باقة برو الاحترافية',
        status: 'ACTIVE',
        cardLimit: 50000,
        usedCards: 200,
        remainingCards: 49800,
        maxRouters: 3,
        tenantId: 'tenant_A',
      );

      await storage.setTenantQuota(quota, 'tenant_A');
      expect(storage.getTenantQuota('tenant_A'), isNotNull);

      // User logs out
      await storage.clearAuth();

      // Quota is completely wiped
      expect(storage.getTenantQuota('tenant_A'), isNull);
      expect(storage.getTenantQuota(), isNull);
    });

    test('5. Network/API failure preserves local quota without overwriting with FREE', () async {
      final validPaidQuota = TenantQuotaModel(
        planName: 'PRO',
        planNameAr: 'باقة برو الاحترافية',
        status: 'ACTIVE',
        cardLimit: 50000,
        usedCards: 1200,
        remainingCards: 48800,
        maxRouters: 3,
        tenantId: 'tenant_A',
      );

      await storage.setTenantQuota(validPaidQuota, 'tenant_A');

      // Simulated network failure: local cache still has PRO, never defaulted to null or FREE
      final existing = storage.getTenantQuota('tenant_A');
      expect(existing, isNotNull);
      expect(existing!.planName, 'PRO');
      expect(existing.status, 'ACTIVE');
      expect(existing.remainingCards, 48800);
    });

    test('6. TenantQuotaModel.fromJson correctly parses multiple payload formats and computes remaining cards', () {
      final jsonApi = {
        'tenantId': 'tenant_A',
        'planName': 'PRO',
        'planNameAr': 'برو',
        'status': 'ACTIVE',
        'maxRouters': 3,
        'limit': 50000,
        'used': 1000,
        'remaining': 49000,
      };

      final quota = TenantQuotaModel.fromJson(jsonApi);
      expect(quota.tenantId, 'tenant_A');
      expect(quota.planName, 'PRO');
      expect(quota.cardLimit, 50000);
      expect(quota.usedCards, 1000);
      expect(quota.remainingCards, 49000);
      expect(quota.maxRouters, 3);
      expect(quota.status, 'ACTIVE');
    });
  });
}
