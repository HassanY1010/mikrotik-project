import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/models.dart';

void main() {
  group('Mobile Models & Offline Sync Logic', () {
    test('OfflineCardModel should correctly serialize and generate hotspot loginUrl', () {
      final card = OfflineCardModel(
        id: 'card-uuid-1',
        serialNumber: 'SN-100234',
        username: 'USER998',
        clearPassword: 'PASS998',
        profileId: 'prof-1',
        profileName: '1-Hour Speed',
        deviceId: 'dev-1',
        price: 500.0,
        currency: 'SDG',
        status: 'AVAILABLE',
      );

      expect(card.status, 'AVAILABLE');
      expect(card.price, 500.0);
      expect(
        card.loginUrl,
        'http://login.hotspot/login?username=USER998&password=PASS998',
      );

      final json = card.toJson();
      expect(json['serialNumber'], 'SN-100234');
      expect(json['status'], 'AVAILABLE');

      final deserialized = OfflineCardModel.fromJson(json);
      expect(deserialized.id, card.id);
      expect(deserialized.username, card.username);
    });

    test('OfflineMutationModel should serialize correctly for push reconciliation', () {
      final now = DateTime.now();
      final mutation = OfflineMutationModel(
        clientMutationId: 'mut-uuid-1234',
        type: 'SALE',
        payload: {
          'cardId': 'card-uuid-1',
          'paymentMethod': 'CASH',
        },
        createdAt: now,
        status: 'PENDING',
      );

      expect(mutation.clientMutationId, 'mut-uuid-1234');
      expect(mutation.status, 'PENDING');

      final json = mutation.toJson();
      expect(json['clientMutationId'], 'mut-uuid-1234');
      expect(json['type'], 'SALE');

      final restored = OfflineMutationModel.fromJson(json);
      expect(restored.clientMutationId, 'mut-uuid-1234');
      expect(restored.payload['cardId'], 'card-uuid-1');
    });

    test('SaleReceiptModel should calculate receipt fields properly', () {
      final receipt = SaleReceiptModel(
        invoiceNumber: 'OFF-109283',
        serialNumber: 'SN-0091',
        username: 'HS_USER',
        password: 'SECRET',
        profileName: 'Daily Unlimited',
        amount: 1500.0,
        currency: 'SDG',
        paymentMethod: 'CASH',
        soldAt: DateTime.now(),
        cashierName: 'Ahmad Cashier',
        isOffline: true,
      );

      expect(receipt.isOffline, isTrue);
      expect(receipt.amount, 1500.0);
      expect(receipt.loginUrl, 'http://login.hotspot/login?username=HS_USER&password=SECRET');
    });

    test('ShiftSummaryModel parses profile breakdown properly', () {
      final json = {
        'totalRevenue': '12500',
        'totalSalesCount': 25,
        'currency': 'SDG',
        'profileBreakdown': [
          {
            'profileName': '1-Hour 500MB',
            'count': 15,
            'totalAmount': 7500,
          },
          {
            'profileName': 'Daily 2GB',
            'count': 10,
            'totalAmount': 5000,
          }
        ],
      };

      final summary = ShiftSummaryModel.fromJson(json);
      expect(summary.totalRevenue, 12500.0);
      expect(summary.totalSalesCount, 25);
      expect(summary.profileBreakdown.length, 2);
      expect(summary.profileBreakdown[0].count, 15);
      expect(summary.profileBreakdown[1].totalAmount, 5000.0);
    });

    test('RouterDeviceModel should correctly parse monitoring, lock, and anti-tethering', () {
      final json = {
        'id': 'dev-1',
        'name': 'الراوتر الرئيسي',
        'host': '192.168.88.1',
        'cpuLoad': 24,
        'memoryFree': 524288000,
        'memoryTotal': 1048576000,
        'diskFree': 268435456,
        'diskTotal': 536870912,
        'isLocked': true,
        'antiTetheringEnabled': true,
        'modelName': 'CCR2004-16G-2S+',
        'status': 'ONLINE',
      };

      final router = RouterDeviceModel.fromJson(json);
      expect(router.name, 'الراوتر الرئيسي');
      expect(router.cpuLoad, 24);
      expect(router.memoryFreeMb, 500);
      expect(router.memoryTotalMb, 1000);
      expect(router.diskFreeMb, 256);
      expect(router.diskTotalMb, 512);
      expect(router.isLocked, isTrue);
      expect(router.antiTetheringEnabled, isTrue);
      expect(router.modelName, 'CCR2004-16G-2S+');
    });

    test('ActiveSessionModel should parse radar metrics and calculate MB usage', () {
      final json = {
        'id': 'sess-1',
        'user': 'hs_user_44',
        'address': '192.168.88.100',
        'macAddress': '00:1A:2B:3C:4D:5E',
        'uptime': '2h 15m',
        'bytesIn': 209715200,
        'bytesOut': 104857600,
      };

      final session = ActiveSessionModel.fromJson(json);
      expect(session.user, 'hs_user_44');
      expect(session.address, '192.168.88.100');
      expect(session.macAddress, '00:1A:2B:3C:4D:5E');
      expect(session.totalMb, closeTo(300.0, 0.5));
    });

    test('FinancialReportModel should parse forecast and period summaries', () {
      final json = {
        'summary': {
          'todayRevenue': 35000,
          'todaySalesCount': 50,
          'weekRevenue': 210000,
          'weekSalesCount': 300,
          'monthRevenue': 850000,
          'monthSalesCount': 1200,
          'allTimeRevenue': 3200000,
          'profitMarginPercent': 20.0,
          'estimatedProfit': 170000,
          'currency': 'SDG',
        },
        'forecast': {
          'next7Days': 225000,
          'next30Days': 910000,
          'trend': 'UP',
        },
        'bestSellingProfiles': [
          {'profileName': 'باقة 3 ساعات', 'count': 600, 'total': 300000}
        ],
        'salesByRouter': [],
        'salesByCashier': [],
        'dailyRevenueLast30Days': [],
      };

      final report = FinancialReportModel.fromJson(json);
      expect(report.todayRevenue, 35000.0);
      expect(report.todaySalesCount, 50);
      expect(report.next7DaysForecast, 225000.0);
      expect(report.next30DaysForecast, 910000.0);
      expect(report.trend, 'UP');
      expect(report.bestSellingProfiles.length, 1);
    });

    test('WalletDataModel should parse balance, points, and admin card switch', () {
      final json = {
        'walletBalance': 50000.75,
        'loyaltyPoints': 450,
        'allowAdminCards': true,
        'currency': 'SDG',
      };

      final wallet = WalletDataModel.fromJson(json);
      expect(wallet.walletBalance, 50000.75);
      expect(wallet.loyaltyPoints, 450);
      expect(wallet.allowAdminCards, isTrue);
      expect(wallet.currency, 'SDG');
    });
  });
}
