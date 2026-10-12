import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/constants/api_endpoints.dart';

void main() {
  group('PPPoE Management Test Suite (Task 4.5)', () {
    test('PppoeProfileModel correctly deserializes backend JSON and defaults', () {
      final jsonMap = {
        'id': 'prof-101',
        'tenantId': 'tenant-sudafi',
        'deviceId': 'router-core-1',
        'name': 'home_vip_20m',
        'rateLimit': '20M/20M',
        'localAddress': '10.100.0.1',
        'remoteAddress': 'pppoe-pool',
        'dnsServers': '8.8.8.8,1.1.1.1',
        'onlyOne': true,
        'price': 12000,
        'description': 'باقة النخبة المنزلية',
        'accountsCount': 15,
        'queuedCommandId': 'cmd-uuid-999',
        'createdAt': '2026-10-12T08:00:00.000Z',
      };

      final profile = PppoeProfileModel.fromJson(jsonMap);

      expect(profile.id, 'prof-101');
      expect(profile.tenantId, 'tenant-sudafi');
      expect(profile.deviceId, 'router-core-1');
      expect(profile.name, 'home_vip_20m');
      expect(profile.rateLimit, '20M/20M');
      expect(profile.localAddress, '10.100.0.1');
      expect(profile.remoteAddress, 'pppoe-pool');
      expect(profile.dnsServers, '8.8.8.8,1.1.1.1');
      expect(profile.onlyOne, true);
      expect(profile.price, 12000.0);
      expect(profile.accountsCount, 15);
      expect(profile.queuedCommandId, 'cmd-uuid-999');
    });

    test('PppoeProfileModel toCreatePayload satisfies backend CreatePppoeProfileDto whitelist', () {
      final profile = PppoeProfileModel(
        id: 'temp-id',
        tenantId: 'temp-tenant',
        deviceId: 'temp-device',
        name: 'student_5m',
        rateLimit: '5M/5M',
        localAddress: '10.100.0.1',
        remoteAddress: 'pppoe-pool',
        dnsServers: '1.1.1.1',
        onlyOne: true,
        price: 3500.0,
        description: 'باقة الطلاب المخفضة',
      );

      final payload = profile.toCreatePayload();

      expect(payload['name'], 'student_5m');
      expect(payload['rateLimit'], '5M/5M');
      expect(payload['localAddress'], '10.100.0.1');
      expect(payload['remoteAddress'], 'pppoe-pool');
      expect(payload['dnsServers'], '1.1.1.1');
      expect(payload['onlyOne'], true);
      expect(payload['price'], 3500.0);
      expect(payload['description'], 'باقة الطلاب المخفضة');
      // ID & timestamps must be strictly omitted from create payload
      expect(payload.containsKey('id'), false);
      expect(payload.containsKey('tenantId'), false);
      expect(payload.containsKey('deviceId'), false);
    });

    test('PppoeAccountModel correctly models subscriber status and metadata', () {
      final jsonMap = {
        'id': 'acc-555',
        'tenantId': 'tenant-1',
        'deviceId': 'router-1',
        'profileId': 'prof-101',
        'profileName': 'home_vip_20m',
        'username': 'ahmed_home',
        'status': 'ACTIVE',
        'callerId': '00:1A:2B:3C:4D:5E',
        'staticIp': '10.100.1.25',
        'customerName': 'أحمد محمد علي',
        'customerPhone': '0912345678',
        'price': 12000,
        'billingCycle': 'MONTHLY',
        'expiresAt': '2026-11-12T00:00:00.000Z',
        'notes': 'الملازمين - شارع الدكاترة',
        'syncStatus': 'SYNCED',
      };

      final account = PppoeAccountModel.fromJson(jsonMap);

      expect(account.id, 'acc-555');
      expect(account.username, 'ahmed_home');
      expect(account.customerName, 'أحمد محمد علي');
      expect(account.customerPhone, '0912345678');
      expect(account.staticIp, '10.100.1.25');
      expect(account.callerId, '00:1A:2B:3C:4D:5E');
      expect(account.isActive, true);
      expect(account.isDisabled, false);
      expect(account.isExpired, false);
      expect(account.syncStatus, 'SYNCED');
      // Security: Password is never in DTO
      expect(account.toJson().containsKey('password'), false);
      expect(account.toJson().containsKey('passwordEncrypted'), false);
    });

    test('PppoeAccountModel status getters report correct states', () {
      final active = PppoeAccountModel(id: '1', tenantId: 't', deviceId: 'd', profileId: 'p', username: 'u1', status: 'ACTIVE');
      final disabled = PppoeAccountModel(id: '2', tenantId: 't', deviceId: 'd', profileId: 'p', username: 'u2', status: 'DISABLED');
      final expired = PppoeAccountModel(id: '3', tenantId: 't', deviceId: 'd', profileId: 'p', username: 'u3', status: 'EXPIRED');
      final suspended = PppoeAccountModel(id: '4', tenantId: 't', deviceId: 'd', profileId: 'p', username: 'u4', status: 'SUSPENDED');

      expect(active.isActive, true);
      expect(disabled.isDisabled, true);
      expect(expired.isExpired, true);
      expect(suspended.isSuspended, true);
    });

    test('PppoeActiveSessionModel calculates human readable uptime and bandwidth', () {
      final session = PppoeActiveSessionModel(
        id: '*1A',
        tenantId: 't1',
        deviceId: 'd1',
        username: 'user_gamer_01',
        ipAddress: '10.100.1.77',
        macAddress: 'AA:BB:CC:DD:EE:FF',
        uptimeSeconds: 90065, // 1 day, 1 hour, 1 minute, 5 seconds
        bytesIn: 104857600, // 100 MB
        bytesOut: 1073741824, // 1 GB
        sessionId: 'sess-p001',
      );

      expect(session.id, '*1A');
      expect(session.username, 'user_gamer_01');
      expect(session.ipAddress, '10.100.1.77');
      expect(session.formattedUptime.contains('1 يوم'), true);
      expect(session.formattedUptime.contains('1 س'), true);
      expect(session.formattedBytesIn, '100.00 MB');
      expect(session.formattedBytesOut, '1.00 GB');
    });

    test('PppoeCommandStatusModel verifies execution states and error message propagation', () {
      final successJson = {
        'id': 'cmd-1',
        'operationId': 'op-uuid-1',
        'deviceId': 'dev-1',
        'agentId': 'agent-1',
        'type': 'pppoe.secret.add',
        'status': 'COMPLETED',
        'payload': {'username': 'test_user'},
        'result': {'success': true, 'routerOsId': '*2B'},
      };

      final successCmd = PppoeCommandStatusModel.fromJson(successJson);
      expect(successCmd.isCompleted, true);
      expect(successCmd.isFailed, false);
      expect(successCmd.result?['routerOsId'], '*2B');

      final failedJson = {
        'id': 'cmd-2',
        'operationId': 'op-uuid-2',
        'deviceId': 'dev-1',
        'agentId': 'agent-1',
        'type': 'pppoe.secret.add',
        'status': 'FAILED',
        'payload': {'username': 'test_duplicate'},
        'errorMessage': 'RouterOS error: secret with such name already exists',
      };

      final failedCmd = PppoeCommandStatusModel.fromJson(failedJson);
      expect(failedCmd.isFailed, true);
      expect(failedCmd.isCompleted, false);
      expect(failedCmd.errorMessage, contains('secret with such name already exists'));
    });

    test('ApiEndpoints helpers construct valid sanitized REST paths', () {
      const devId = 'router-dev-123';
      const profId = 'prof-456';
      const accId = 'acc-789';
      const cmdId = 'cmd-321';

      expect(ApiEndpoints.pppoeProfiles(devId), '/pppoe/devices/router-dev-123/profiles');
      expect(ApiEndpoints.pppoeProfileItem(devId, profId), '/pppoe/devices/router-dev-123/profiles/prof-456');
      expect(ApiEndpoints.pppoeProfileSync(devId, profId), '/pppoe/devices/router-dev-123/profiles/prof-456/sync');
      expect(ApiEndpoints.pppoeAccounts(devId), '/pppoe/devices/router-dev-123/accounts');
      expect(ApiEndpoints.pppoeAccountItem(devId, accId), '/pppoe/devices/router-dev-123/accounts/acc-789');
      expect(ApiEndpoints.pppoeAccountDisable(devId, accId), '/pppoe/devices/router-dev-123/accounts/acc-789/disable');
      expect(ApiEndpoints.pppoeAccountEnable(devId, accId), '/pppoe/devices/router-dev-123/accounts/acc-789/enable');
      expect(ApiEndpoints.pppoeSessions(devId, sync: true), '/pppoe/devices/router-dev-123/sessions?sync=true');
      expect(ApiEndpoints.pppoeSessionDisconnect(devId), '/pppoe/devices/router-dev-123/sessions/disconnect');
      expect(ApiEndpoints.pppoeCommandStatus(devId, cmdId), '/pppoe/devices/router-dev-123/commands/cmd-321');
    });
  });
}
