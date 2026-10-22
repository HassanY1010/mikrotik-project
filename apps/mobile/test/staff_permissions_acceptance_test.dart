import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/features/profile/presentation/tenant_users_screen.dart';

void main() {
  group('Staff & Permissions Acceptance Tests', () {
    test('UserModel correctly parses role object from backend API', () {
      final json = {
        'id': 'u-1',
        'email': 'owner@sudafi.com',
        'fullName': 'Network Owner',
        'phone': '+249912345678',
        'role': {
          'id': 'role-admin',
          'name': 'TENANT_ADMIN',
          'description': 'Owner of the tenant network',
        },
        'status': 'ACTIVE',
        'assignedDevices': [
          {'id': 'dev-1', 'name': 'Main Router', 'host': '192.168.88.1'}
        ],
        'customPermissions': ['finance:view', 'expenses:manage'],
      };

      final user = UserModel.fromJson(json);

      expect(user.id, 'u-1');
      expect(user.role, 'TENANT_ADMIN');
      expect(user.isTenantAdmin, isTrue);
      expect(user.isActive, isTrue);
      expect(user.isSuspended, isFalse);
      expect(user.roleDisplayName, 'مدير الشبكة (المالك)');
      expect(user.assignedDevices.length, 1);
      expect(user.assignedDevices.first.name, 'Main Router');
      expect(user.customPermissions, contains('finance:view'));
      expect(user.customPermissions, contains('expenses:manage'));
    });

    test('UserModel correctly parses legacy string role and suspended status', () {
      final json = {
        'id': 'u-2',
        'email': 'cashier@sudafi.com',
        'fullName': 'Ahmed Cashier',
        'role': 'CASHIER',
        'status': 'SUSPENDED',
        'assignedDevices': <Map<String, dynamic>>[],
        'customPermissions': <String>[],
      };

      final user = UserModel.fromJson(json);

      expect(user.id, 'u-2');
      expect(user.role, 'CASHIER');
      expect(user.isCashier, isTrue);
      expect(user.isTenantAdmin, isFalse);
      expect(user.isActive, isFalse);
      expect(user.isSuspended, isTrue);
      expect(user.roleDisplayName, 'كاشير');
      expect(user.assignedDevices.isEmpty, isTrue);
    });

    test('StaffInvitationModel parses token, expiration and acceptance status', () {
      final now = DateTime.now();
      final expires = now.add(const Duration(days: 7));

      final json = {
        'id': 'inv-123',
        'email': 'new_staff@sudafi.com',
        'fullName': 'Sami Staff',
        'phone': '+249999999999',
        'role': {'name': 'CASHIER'},
        'expiresAt': expires.toIso8601String(),
        'acceptedAt': null,
        'invitationUrl': 'https://sudafi.app/invite/token_secret_123',
        'token': 'token_secret_123',
      };

      final invitation = StaffInvitationModel.fromJson(json);

      expect(invitation.id, 'inv-123');
      expect(invitation.email, 'new_staff@sudafi.com');
      expect(invitation.roleName, 'CASHIER');
      expect(invitation.isAccepted, isFalse);
      expect(invitation.isExpired, isFalse);
      expect(invitation.invitationUrl, 'https://sudafi.app/invite/token_secret_123');
    });

    testWidgets('TenantUsersScreen renders staff tabs, search, and user cards',
        (tester) async {
      final mockUsers = [
        UserModel(
          id: 'admin-1',
          email: 'admin@sudafi.com',
          fullName: 'Malik Admin',
          role: 'TENANT_ADMIN',
          status: 'ACTIVE',
        ),
        UserModel(
          id: 'cashier-1',
          email: 'cashier@sudafi.com',
          fullName: 'Ali Cashier',
          role: 'CASHIER',
          status: 'ACTIVE',
          assignedDevices: [
            const AssignedDeviceSummary(id: 'r-1', name: 'Al-Souq Router', host: '192.168.1.1'),
          ],
          customPermissions: ['finance:view'],
        ),
      ];

      final container = ProviderContainer(
        overrides: [
          tenantUsersProvider.overrideWith(() => _MockTenantUsersNotifier(mockUsers)),
          staffInvitationsProvider.overrideWith(() => _MockStaffInvitationsNotifier([])),
          routersProvider.overrideWith(() => _MockRoutersNotifier([])),
        ],
      );

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(
            home: TenantUsersScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Assert screen elements
      expect(find.text('فريق العمل والصلاحيات'), findsOneWidget);
      expect(find.text('Malik Admin'), findsOneWidget);
      expect(find.text('Ali Cashier'), findsOneWidget);
      expect(find.text('مدير الشبكة (المالك)'), findsOneWidget);
      expect(find.text('كاشير'), findsOneWidget);
      expect(find.text('Al-Souq Router'), findsOneWidget);
      expect(find.text('عرض المالية والأرباح'), findsOneWidget);
      expect(find.text('إضافة موظف مباشر'), findsOneWidget);
      expect(find.text('إرسال رابط دعوة'), findsOneWidget);
    });
  });
}

class _MockTenantUsersNotifier extends TenantUsersNotifier {
  final List<UserModel> _initialUsers;
  _MockTenantUsersNotifier(this._initialUsers);

  @override
  Future<List<UserModel>> build() async {
    return _initialUsers;
  }
}

class _MockStaffInvitationsNotifier extends StaffInvitationsNotifier {
  final List<StaffInvitationModel> _initial;
  _MockStaffInvitationsNotifier(this._initial);

  @override
  Future<List<StaffInvitationModel>> build() async {
    return _initial;
  }
}

class _MockRoutersNotifier extends RoutersNotifier {
  final List<RouterDeviceModel> _initial;
  _MockRoutersNotifier(this._initial);

  @override
  Future<List<RouterDeviceModel>> build() async {
    return _initial;
  }
}
