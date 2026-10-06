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
  });
}
