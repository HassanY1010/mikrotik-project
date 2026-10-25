import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/models.dart';

void main() {
  group('CardModel Details & Accounting Tests', () {
    test('1. New unused card should correctly identify as NEW', () {
      final card = CardModel(
        id: 'card-1',
        serialNumber: 'SN10001',
        username: 'user01',
        clearPassword: 'pass01',
        profileId: 'prof-1',
        profileName: 'ساعة واحدة',
        price: 500,
        status: 'AVAILABLE',
        createdAt: DateTime.now().subtract(const Duration(days: 2)),
        activatedAt: null,
        expiresAt: null,
      );

      expect(card.isNew, isTrue);
      expect(card.isUsed, isFalse);
      expect(card.isExpired, isFalse);
      expect(card.isDisabled, isFalse);
      expect(card.statusArabic, equals('جديد (غير مستخدم)'));
    });

    test('2. Used active card should identify as USED', () {
      final card = CardModel(
        id: 'card-2',
        serialNumber: 'SN10002',
        username: 'user02',
        profileId: 'prof-1',
        profileName: 'ساعة واحدة',
        price: 500,
        status: 'ACTIVE',
        createdAt: DateTime.now().subtract(const Duration(days: 2)),
        activatedAt: DateTime.now().subtract(const Duration(hours: 1)),
        isOnline: true,
      );

      expect(card.isUsed, isTrue);
      expect(card.isNew, isFalse);
      expect(card.isExpired, isFalse);
      expect(card.statusArabic, equals('مستخدم'));
    });

    test('3. Expired card should identify as EXPIRED regardless of active session', () {
      final pastDate = DateTime.now().subtract(const Duration(hours: 1));
      final card = CardModel(
        id: 'card-3',
        serialNumber: 'SN10003',
        username: 'user03',
        profileId: 'prof-1',
        profileName: 'باقة يومية',
        price: 1500,
        status: 'EXPIRED',
        createdAt: DateTime.now().subtract(const Duration(days: 5)),
        activatedAt: DateTime.now().subtract(const Duration(days: 2)),
        expiresAt: pastDate,
      );

      expect(card.isExpired, isTrue);
      expect(card.statusArabic, equals('منتهي الصلاحية'));
    });

    test('4. Disabled card should identify as DISABLED', () {
      final card = CardModel(
        id: 'card-4',
        serialNumber: 'SN10004',
        username: 'user04',
        profileId: 'prof-1',
        profileName: 'باقة أسبوعية',
        price: 5000,
        status: 'DISABLED',
        createdAt: DateTime.now().subtract(const Duration(days: 1)),
      );

      expect(card.isDisabled, isTrue);
      expect(card.statusArabic, equals('معطّل'));
    });

    test('5. Card with known data quota should format MB and GB accurately', () {
      // 1 GB = 1073741824 bytes
      final card1Gb = CardModel(
        id: 'c-gb',
        serialNumber: 'SN1',
        username: 'u1',
        profileId: 'p1',
        profileName: 'باقة 1GB',
        price: 1000,
        status: 'AVAILABLE',
        createdAt: DateTime.now(),
        dataLimitBytes: 1073741824,
      );
      expect(card1Gb.formattedDataQuota, equals('1 GB'));
      expect(card1Gb.isUnlimitedQuota, isFalse);

      // 500 MB = 524288000 bytes
      final card500Mb = CardModel(
        id: 'c-mb',
        serialNumber: 'SN2',
        username: 'u2',
        profileId: 'p1',
        profileName: 'باقة 500MB',
        price: 600,
        status: 'AVAILABLE',
        createdAt: DateTime.now(),
        dataLimitBytes: 524288000,
      );
      expect(card500Mb.formattedDataQuota, equals('500 MB'));
    });

    test('6. Open unlimited data card should clearly state "مفتوح"', () {
      final openCard = CardModel(
        id: 'c-open',
        serialNumber: 'SN3',
        username: 'u3',
        profileId: 'p1',
        profileName: 'باقة مفتوحة',
        price: 2000,
        status: 'AVAILABLE',
        createdAt: DateTime.now(),
        dataLimitBytes: null,
        profileDataLimitBytes: null,
      );

      expect(openCard.isUnlimitedQuota, isTrue);
      expect(openCard.formattedDataQuota, equals('مفتوح'));
      expect(openCard.formattedRemainingBytes, equals('مفتوح'));
    });

    test('7. Unavailable accounting data should display "غير متاح" rather than false zero', () {
      final card = CardModel(
        id: 'c-no-acc',
        serialNumber: 'SN4',
        username: 'u4',
        profileId: 'p1',
        profileName: 'باقة تجريبية',
        price: 1000,
        status: 'AVAILABLE',
        createdAt: DateTime.now(),
        dataLimitBytes: 1073741824, // 1 GB
        consumedBytes: null,
        hasLiveAccounting: false,
      );

      expect(card.formattedConsumedBytes, equals('غير متاح'));
      expect(card.formattedRemainingBytes, equals('غير متاح'));
    });

    test('8. Speeds should correctly reflect download and upload directions', () {
      final cardWithSpeeds = CardModel(
        id: 'c-spd',
        serialNumber: 'SN5',
        username: 'u5',
        profileId: 'p1',
        profileName: 'باقة سريعة',
        price: 1500,
        status: 'AVAILABLE',
        createdAt: DateTime.now(),
        downloadSpeedLimit: '4 Mbps',
        uploadSpeedLimit: '2 Mbps',
      );

      expect(cardWithSpeeds.formattedSpeedLabel, equals('↓ 4 Mbps / ↑ 2 Mbps'));

      final unlimitedSpeedCard = CardModel(
        id: 'c-unl-spd',
        serialNumber: 'SN6',
        username: 'u6',
        profileId: 'p1',
        profileName: 'سرعة كاملة',
        price: 1500,
        status: 'AVAILABLE',
        createdAt: DateTime.now(),
        isUnlimitedSpeed: true,
      );

      expect(unlimitedSpeedCard.formattedSpeedLabel, equals('مفتوحة'));
    });

    test('9. Custom card quota should override profile default quota', () {
      final customCard = CardModel(
        id: 'c-override',
        serialNumber: 'SN7',
        username: 'u7',
        profileId: 'p1',
        profileName: 'باقة قياسية',
        price: 1200,
        status: 'AVAILABLE',
        createdAt: DateTime.now(),
        profileDataLimitBytes: 1073741824, // 1 GB default in profile
        dataLimitBytes: 2147483648,        // 2 GB custom on card
        isCustomQuota: true,
      );

      expect(customCard.isCustomQuota, isTrue);
      expect(customCard.effectiveDataLimitBytes, equals(2147483648));
      expect(customCard.formattedDataQuota, equals('2 GB'));
    });

    test('10. Distinguishes commercial validity from session timeout', () {
      final card = CardModel(
        id: 'c-val',
        serialNumber: 'SN8',
        username: 'u8',
        profileId: 'p1',
        profileName: 'باقة شهرية محدودة',
        price: 3000,
        status: 'AVAILABLE',
        createdAt: DateTime.now(),
        validityDays: 30,
        effectiveTimeLimit: '02:00:00', // 2 hours session timeout on router
      );

      expect(card.validityDays, equals(30));
      expect(card.effectiveTimeLimit, equals('02:00:00'));
      expect(card.formattedValidity, equals('30 يوم'));
    });

    test('11. Unlinked card with unknown quota must return غير محدد and not false مفتوح', () {
      final unknownCard = CardModel(
        id: 'c-unknown',
        serialNumber: 'SN9',
        username: 'u9',
        profileId: null, // No profile linked!
        profileName: 'غير معروف',
        price: 1000,
        status: 'AVAILABLE',
        createdAt: DateTime.now(),
        dataLimitBytes: null,
        profileDataLimitBytes: null,
      );

      expect(unknownCard.isUnlimitedQuota, isFalse);
      expect(unknownCard.formattedDataQuota, equals('غير محدد'));
    });

    test('12. Router connection state isOnline does not alter commercial card status', () {
      final onlineExpiredCard = CardModel(
        id: 'c-exp',
        serialNumber: 'SN10',
        username: 'u10',
        profileId: 'p1',
        profileName: 'منتهي',
        price: 1000,
        status: 'EXPIRED',
        createdAt: DateTime.now().subtract(const Duration(days: 30)),
        expiresAt: DateTime.now().subtract(const Duration(hours: 2)),
        isOnline: true, // Still connected in TCP session before kick
      );

      expect(onlineExpiredCard.isOnline, isTrue);
      expect(onlineExpiredCard.isExpired, isTrue);
      expect(onlineExpiredCard.statusArabic, equals('منتهي الصلاحية'));

      final offlineValidCard = CardModel(
        id: 'c-off',
        serialNumber: 'SN11',
        username: 'u11',
        profileId: 'p1',
        profileName: 'صالح',
        price: 1000,
        status: 'AVAILABLE',
        createdAt: DateTime.now(),
        isOnline: false, // Disconnected / idle
      );

      expect(offlineValidCard.isOnline, isFalse);
      expect(offlineValidCard.isExpired, isFalse);
      expect(offlineValidCard.statusArabic, equals('جديد (غير مستخدم)'));
    });
  });
}
