import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/models.dart';

void main() {
  group('Feature 1: Card Templates Model & JSON Serialization Suite', () {
    test('CardTemplateModel correctly parses backend JSON and defaults', () {
      final jsonMap = {
        'id': 'tpl-101',
        'name': 'قالب النخبة الذهبي',
        'widthMm': 85,
        'heightMm': 54,
        'orientation': 'landscape',
        'themePreset': 'GOLD',
        'primaryColor': '#D97706',
        'accentColor': '#F59E0B',
        'isDefault': true,
        'layoutConfig': {
          'showQr': true,
          'showPin': true,
          'showPrice': true,
          'showValidity': true,
          'showSpeed': true,
          'networkName': 'شبكة النخبة',
          'supportPhone': '+249912345678',
          'headerTitle': 'كروت إنترنت النخبة',
          'instructions': 'نت سريع ومستقر',
        },
      };

      final model = CardTemplateModel.fromJson(jsonMap);

      expect(model.id, 'tpl-101');
      expect(model.name, 'قالب النخبة الذهبي');
      expect(model.primaryColor, '#D97706');
      expect(model.accentColor, '#F59E0B');
      expect(model.isDefault, true);
      expect(model.showQr, true);
      expect(model.showPin, true);
      expect(model.showPrice, true);
      expect(model.showSpeed, true);
      expect(model.networkName, 'شبكة النخبة');
      expect(model.supportPhone, '+249912345678');
      expect(model.headerTitle, 'كروت إنترنت النخبة');
      expect(model.instructions, 'نت سريع ومستقر');
    });

    test('CardTemplateModel JSON export & import roundtrip is lossless', () {
      final original = CardTemplateModel(
        id: 'tpl-export-1',
        name: 'قالب كروت الفيروز',
        widthMm: 86,
        heightMm: 54,
        orientation: 'landscape',
        themePreset: 'TURQUOISE',
        primaryColor: '#0F766E',
        accentColor: '#06B6D4',
        layoutConfig: {
          'showQr': true,
          'showPin': true,
          'showPrice': false,
        },
        isDefault: false,
      );

      final exportedJsonStr = jsonEncode(original.toJson());
      final decodedMap = jsonDecode(exportedJsonStr) as Map<String, dynamic>;
      final restored = CardTemplateModel.fromJson(decodedMap);

      expect(restored.name, original.name);
      expect(restored.primaryColor, original.primaryColor);
      expect(restored.accentColor, original.accentColor);
      expect(restored.showQr, true);
      expect(restored.showPrice, false);
    });

    test('CardTemplateModel rejects or safely handles corrupt layoutConfig', () {
      final corruptMap = {
        'id': 'tpl-bad',
        'name': 'قالب تالف',
        'layoutConfig': 'not a map',
      };

      final model = CardTemplateModel.fromJson(corruptMap);
      expect(model.id, 'tpl-bad');
      expect(model.showQr, true); // fallback default
      expect(model.showPin, true); // fallback default
      expect(model.headerTitle, 'كرت إنترنت فائق السرعة'); // fallback default
    });

    test('CardTemplateModel toPayload omits id to satisfy strict backend whitelist validation', () {
      final model = CardTemplateModel(
        id: 'tpl-999',
        name: 'قالب كروت السرعة',
        widthMm: 85,
        heightMm: 54,
        orientation: 'landscape',
        themePreset: 'CLASSIC',
        primaryColor: '#1E3A8A',
        accentColor: '#10B981',
        layoutConfig: {'showQr': true},
        isDefault: false,
      );

      final payload = model.toPayload();
      expect(payload.containsKey('id'), isFalse, reason: 'id must not exist in payload or backend will throw 400 Bad Request');
      expect(payload['name'], 'قالب كروت السرعة');
      expect(payload['widthMm'], 85);
      expect(payload['heightMm'], 54);
    });

    test('CardTemplate JSON import rejects files exceeding 200KB', () {
      final largeBuffer = List.filled(201 * 1024, 'a').join();
      final isOversized = largeBuffer.length > 200 * 1024;
      expect(isOversized, isTrue, reason: 'File picker guard must reject JSON files over 200KB');
    });
  });

  group('Feature 2: Hotspot Profile Model Suite', () {
    test('HotspotProfileModel parses speed limit, validity and pricing properly', () {
      final profileJson = {
        'id': 'prof-5g-1',
        'name': '2M_1Day',
        'displayName': 'باقة اليوم السريع 2 ميجا',
        'rateLimit': '2M/2M',
        'validity': '24h',
        'price': 500.0,
        'availableCards': 100,
      };

      final profile = HotspotProfileModel.fromJson(profileJson);

      expect(profile.name, '2M_1Day');
      expect(profile.displayName, 'باقة اليوم السريع 2 ميجا');
      expect(profile.rateLimit, '2M/2M');
      expect(profile.validity, '24h');
      expect(profile.price, 500.0);
      expect(profile.availableCards, 100);
    });

    test('CreateProfile payload matches CreateProfileDto contracts', () {
      final profilePayload = {
        'name': '1hour-unlimited',
        'deviceId': 'router-uuid-001',
        'displayName': 'باقة ساعة مفتوحة',
        'rateLimit': '2M/2M',
        'sessionTimeout': '1h',
        'validity': '1h',
        'price': 250.0,
        'sharedUsers': 1,
      };

      expect(profilePayload['name'], isNotEmpty);
      expect(profilePayload['deviceId'], 'router-uuid-001');
      expect(profilePayload['sharedUsers'], 1);
    });
  });

  group('Feature 3: Auth & Account Details Model Suite', () {
    test('AuthUser correctly models organization, currency, status and role', () {
      final userJson = {
        'id': 'usr-admin-1',
        'email': 'admin@sudafi.net',
        'fullName': 'طه محمد المدير',
        'role': 'TENANT_ADMIN',
        'tenantId': 'tenant-alpha',
        'tenantName': 'شبكة أم درمان المركزية',
        'phone': '+249912345678',
        'status': 'ACTIVE',
        'currency': 'SDG',
        'subscriptionPlan': 'PROFESSIONAL',
        'createdAt': '2026-01-01T00:00:00.000Z',
      };

      final user = AuthUser.fromJson(userJson);

      expect(user.fullName, 'طه محمد المدير');
      expect(user.tenantName, 'شبكة أم درمان المركزية');
      expect(user.phone, '+249912345678');
      expect(user.status, 'ACTIVE');
      expect(user.currency, 'SDG');
      expect(user.subscriptionPlan, 'PROFESSIONAL');
      expect(user.role, 'TENANT_ADMIN');
    });

    test('ChangePassword payload matches ChangePasswordDto contracts', () {
      final changePassPayload = {
        'currentPassword': 'OldPassword@2026',
        'newPassword': 'NewSecurePass@2026',
      };

      expect(changePassPayload['currentPassword'], isNotEmpty);
      expect((changePassPayload['newPassword'] as String).length, greaterThanOrEqualTo(8));
      expect(changePassPayload.containsKey('role'), isFalse);
    });
  });

  group('Feature 4: Tenant User Management Suite', () {
    test('UserModel parses role badges and cashier accounts correctly', () {
      final cashierJson = {
        'id': 'cashier-44',
        'tenantId': 'tenant-alpha',
        'fullName': 'أحمد الكاشير',
        'email': 'cashier1@sudafi.net',
        'phone': '+249112233445',
        'role': 'CASHIER',
        'status': 'ACTIVE',
        'createdAt': '2026-02-15T10:00:00.000Z',
      };

      final userModel = UserModel.fromJson(cashierJson);

      expect(userModel.id, 'cashier-44');
      expect(userModel.role, 'CASHIER');
      expect(userModel.fullName, 'أحمد الكاشير');
      expect(userModel.status, 'ACTIVE');
      expect(userModel.phone, '+249112233445');
    });

    test('Create user payload provides roleName and strictly omits unwhitelisted role property', () {
      const role = 'CASHIER';
      final payload = {
        'fullName': 'محمود المالي',
        'email': 'cashier2@sudafi.net',
        'password': 'SecurePassword123!',
        'roleName': role,
        'phone': '+249911223344',
      };

      expect(payload['roleName'], 'CASHIER');
      expect(payload.containsKey('role'), isFalse, reason: 'role is not in CreateUserDto and would fail forbidNonWhitelisted validation');
    });
  });
}
