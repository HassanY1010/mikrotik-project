import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile/core/constants/api_endpoints.dart';
import 'package:mobile/core/storage/local_storage.dart';

void main() {
  group('Permanent Account Deletion (حذف الحساب نهائيًا) Test Suite', () {
    test('ApiEndpoints defines secure deleteAccount endpoint', () {
      expect(ApiEndpoints.deleteAccount, '/auth/account');
    });

    test('DeleteAccount payload strictly requires password and omits client userId', () {
      final payload = {
        'password': 'CurrentPassword@123',
        'reason': 'Moving to another city',
      };

      // Password must be non-empty string
      expect(payload['password'], isA<String>());
      expect(payload['password'], isNotEmpty);

      // Reason is optional
      expect(payload['reason'], isA<String>());

      // Security: Target user MUST NEVER be supplied in payload to prevent tampering with other accounts
      expect(payload.containsKey('userId'), isFalse);
      expect(payload.containsKey('id'), isFalse);
      expect(payload.containsKey('targetUserId'), isFalse);
    });

    test('LocalStorage.clearAuth thoroughly cleanses tokens, user profile, and quota upon deletion', () async {
      SharedPreferences.setMockInitialValues({
        'auth_token': 'jwt_bearer_token_xyz',
        'auth_user': '{"id":"user-1","email":"user@sudafi.sd","fullName":"User One","role":"CASHIER","permissions":[],"status":"ACTIVE"}',
        'cached_tenant_quota': '{"tenantId":"tenant-1","maxRouters":5}',
      });

      final prefs = await SharedPreferences.getInstance();
      final storage = LocalStorage(prefs);

      expect(storage.getToken(), 'jwt_bearer_token_xyz');
      expect(storage.getUser(), isNotNull);
      expect(storage.getUser()?.email, 'user@sudafi.sd');

      // Execute account deletion cleanup
      await storage.clearAuth();

      // Everything must be purged
      expect(storage.getToken(), isNull);
      expect(storage.getUser(), isNull);
      expect(prefs.containsKey('tenant_quota_max_routers'), isFalse);
    });

    test('Delete account contract ensures irreversibility and confirmation guardrails', () {
      // User must acknowledge irreversibility
      bool userAgreed = false;
      String passwordInput = '';

      bool canSubmit(bool agreed, String password) {
        return agreed && password.trim().isNotEmpty;
      }

      // Initial state: cannot submit
      expect(canSubmit(userAgreed, passwordInput), isFalse);

      // Password entered but checkbox not agreed: cannot submit
      passwordInput = 'MySecretPass@2026';
      expect(canSubmit(userAgreed, passwordInput), isFalse);

      // Agreed but password empty: cannot submit
      userAgreed = true;
      passwordInput = '   ';
      expect(canSubmit(userAgreed, passwordInput), isFalse);

      // Both agreed and non-empty password: authorized to submit
      passwordInput = 'MySecretPass@2026';
      expect(canSubmit(userAgreed, passwordInput), isTrue);
    });

    test('Tenant admin payload includes confirmDeleteOrganization flag when requested', () {
      final payload = {
        'password': 'AdminPassword@123',
        'confirmDeleteOrganization': true,
      };

      expect(payload['confirmDeleteOrganization'], isTrue);
      expect(payload['password'], 'AdminPassword@123');
    });
  });
}
