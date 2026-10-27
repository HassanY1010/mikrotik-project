import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/features/inventory/presentation/cards_store_screen.dart';
import 'package:mobile/core/storage/local_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late FakeLocalStorage fakeStorage;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    fakeStorage = FakeLocalStorage();
  });

  CardModel makeCard({
    required String id,
    required String username,
    required String status,
    DateTime? expiresAt,
    DateTime? soldAt,
  }) {
    return CardModel(
      id: id,
      serialNumber: 'SN-$id',
      username: username,
      clearPassword: 'pass-$id',
      profileId: 'prof-1',
      profileName: 'باقة تجريبية',
      price: 1000,
      status: status,
      createdAt: DateTime.now().subtract(const Duration(days: 1)),
      expiresAt: expiresAt,
      soldAt: soldAt,
    );
  }

  Widget createWidgetUnderTest({
    required CardsInventoryState initialState,
    CardsInventoryNotifier Function()? notifierBuilder,
  }) {
    return ProviderScope(
      overrides: [
        localStorageProvider.overrideWithValue(fakeStorage),
        cardsInventoryProvider.overrideWith(
          () => notifierBuilder != null ? notifierBuilder() : MockCardsInventoryNotifier(initialState),
        ),
      ],
      child: const MaterialApp(
        home: Scaffold(
          body: CardsStoreScreen(),
        ),
      ),
    );
  }

  group('Cards Store Selection & Bulk Operations Tests', () {
    testWidgets('1. Select All toggles all visible cards and shows action buttons', (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      final cards = [
        makeCard(id: 'c-1', username: 'user01', status: 'AVAILABLE'),
        makeCard(id: 'c-2', username: 'user02', status: 'DISABLED'),
        makeCard(id: 'c-3', username: 'user03', status: 'SOLD', soldAt: DateTime.now()),
      ];

      final state = CardsInventoryState(
        cards: cards,
        totalMatching: 3,
        totalInventory: 3,
        availableCount: 1,
        disabledCount: 1,
        soldCount: 1,
        activeCount: 0,
        isLoading: false,
        page: 1,
        totalPages: 1,
      );

      await tester.pumpWidget(createWidgetUnderTest(initialState: state));
      await tester.pumpAndSettle();

      // Enter selection mode by tapping the selection mode icon in AppBar
      final selectModeBtn = find.byTooltip('تحديد كروت متعددة للعمليات الجماعية');
      expect(selectModeBtn, findsOneWidget);
      await tester.tap(selectModeBtn);
      await tester.pumpAndSettle();

      // Initially no card is selected
      expect(find.textContaining('المحدد:'), findsNothing);

      // Tap Select All icon
      final selectAllBtn = find.byTooltip('تحديد / إلغاء تحديد الكل');
      expect(selectAllBtn, findsOneWidget);
      await tester.tap(selectAllBtn);
      await tester.pumpAndSettle();

      // All 3 cards are now selected
      expect(find.text('المحدد: 3 كرت'), findsOneWidget);
      expect(find.text('تفعيل المحدد'), findsOneWidget);
      expect(find.text('حذف المحدد'), findsOneWidget);

      // Tap Select All again -> deselects all
      await tester.tap(selectAllBtn);
      await tester.pumpAndSettle();
      expect(find.textContaining('المحدد:'), findsNothing);
    });

    testWidgets('2. Single Card Action: Deleting a SOLD card shows accounting protection alert', (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      final cards = [
        makeCard(id: 'c-sold', username: 'userSold', status: 'SOLD', soldAt: DateTime.now()),
      ];

      final state = CardsInventoryState(
        cards: cards,
        totalMatching: 1,
        totalInventory: 1,
        soldCount: 1,
        isLoading: false,
        page: 1,
        totalPages: 1,
      );

      await tester.pumpWidget(createWidgetUnderTest(initialState: state));
      await tester.pumpAndSettle();

      // Enter selection mode
      await tester.tap(find.byTooltip('تحديد كروت متعددة للعمليات الجماعية'));
      await tester.pumpAndSettle();

      // Select the 1 sold card
      await tester.tap(find.byType(Checkbox).first);
      await tester.pumpAndSettle();
      expect(find.text('المحدد: 1 كرت'), findsOneWidget);

      // Tap Delete Selected
      await tester.tap(find.text('حذف المحدد'));
      await tester.pumpAndSettle();

      // Alert dialog explaining accounting protection must appear without deleting
      expect(find.text('حماية السجلات المالية'), findsOneWidget);
      expect(find.textContaining('يمنع حذف الكروت المباعة'), findsOneWidget);

      // Dismiss dialog
      await tester.tap(find.text('حسناً'));
      await tester.pumpAndSettle();
      expect(find.text('حماية السجلات المالية'), findsNothing);
    });

    testWidgets('3. Single Card Action: Activating an EXPIRED card shows subscription rules alert', (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      final cards = [
        makeCard(
          id: 'c-exp',
          username: 'userExp',
          status: 'EXPIRED',
          expiresAt: DateTime.now().subtract(const Duration(days: 1)),
        ),
      ];

      final state = CardsInventoryState(
        cards: cards,
        totalMatching: 1,
        totalInventory: 1,
        isLoading: false,
        page: 1,
        totalPages: 1,
      );

      await tester.pumpWidget(createWidgetUnderTest(initialState: state));
      await tester.pumpAndSettle();

      // Enter selection mode
      await tester.tap(find.byTooltip('تحديد كروت متعددة للعمليات الجماعية'));
      await tester.pumpAndSettle();

      // Select the expired card
      await tester.tap(find.byType(Checkbox).first);
      await tester.pumpAndSettle();

      // Tap Activate Selected
      await tester.tap(find.text('تفعيل المحدد'));
      await tester.pumpAndSettle();

      // Explanatory alert must appear
      expect(find.text('تعذر التفعيل'), findsOneWidget);
      expect(find.textContaining('منتهية الصلاحية'), findsOneWidget);

      await tester.tap(find.text('حسناً'));
      await tester.pumpAndSettle();
      expect(find.text('تعذر التفعيل'), findsNothing);
    });

    testWidgets('4. Multiple Cards: Deleting mixed cards filters sold and deletes available cleanly', (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      final cards = [
        makeCard(id: 'c-avail-1', username: 'avail1', status: 'AVAILABLE'),
        makeCard(id: 'c-avail-2', username: 'avail2', status: 'AVAILABLE'),
        makeCard(id: 'c-sold-1', username: 'sold1', status: 'SOLD', soldAt: DateTime.now()),
      ];

      final mockState = CardsInventoryState(
        cards: cards,
        totalMatching: 3,
        totalInventory: 3,
        availableCount: 2,
        soldCount: 1,
        isLoading: false,
        page: 1,
        totalPages: 1,
      );
      final mockNotifier = MockCardsInventoryNotifier(mockState);

      await tester.pumpWidget(createWidgetUnderTest(
        initialState: mockState,
        notifierBuilder: () => mockNotifier,
      ));
      await tester.pumpAndSettle();

      // Select all 3 cards
      await tester.tap(find.byTooltip('تحديد كروت متعددة للعمليات الجماعية'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('تحديد / إلغاء تحديد الكل'));
      await tester.pumpAndSettle();

      expect(find.text('المحدد: 3 كرت'), findsOneWidget);

      // Tap Delete Selected
      await tester.tap(find.text('حذف المحدد'));
      await tester.pumpAndSettle();

      // Dialog confirms 2 deletable cards and warns about 1 sold card being excluded
      expect(find.text('تأكيد الحذف الجماعي'), findsOneWidget);
      expect(find.textContaining('عددها 2 كرت'), findsOneWidget);
      expect(find.textContaining('استثناء 1 كرت مباع'), findsOneWidget);

      // Confirm deletion
      await tester.tap(find.text('نعم، حذف 2 كرت'));
      await tester.pumpAndSettle();

      // Mock notifier must have received only the 2 available card IDs
      expect(mockNotifier.lastDeletedCardIds, equals(['c-avail-1', 'c-avail-2']));
      expect(mockNotifier.lastDeletedCardIds.contains('c-sold-1'), isFalse);
    });

    testWidgets('5. Multiple Cards: Activating mixed cards filters expired and activates valid cleanly', (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      final cards = [
        makeCard(id: 'c-dis-1', username: 'dis1', status: 'DISABLED'),
        makeCard(id: 'c-dis-2', username: 'dis2', status: 'DISABLED'),
        makeCard(
          id: 'c-exp-1',
          username: 'exp1',
          status: 'EXPIRED',
          expiresAt: DateTime.now().subtract(const Duration(days: 2)),
        ),
      ];

      final mockState = CardsInventoryState(
        cards: cards,
        totalMatching: 3,
        totalInventory: 3,
        disabledCount: 2,
        isLoading: false,
        page: 1,
        totalPages: 1,
      );
      final mockNotifier = MockCardsInventoryNotifier(mockState);

      await tester.pumpWidget(createWidgetUnderTest(
        initialState: mockState,
        notifierBuilder: () => mockNotifier,
      ));
      await tester.pumpAndSettle();

      // Select all 3 cards
      await tester.tap(find.byTooltip('تحديد كروت متعددة للعمليات الجماعية'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('تحديد / إلغاء تحديد الكل'));
      await tester.pumpAndSettle();

      expect(find.text('المحدد: 3 كرت'), findsOneWidget);

      // Tap Activate Selected
      await tester.tap(find.text('تفعيل المحدد'));
      await tester.pumpAndSettle();

      // Dialog confirms 2 activatable cards and notes 1 expired card is excluded
      expect(find.text('تأكيد التفعيل الجماعي'), findsOneWidget);
      expect(find.textContaining('عددها 2 كرت'), findsOneWidget);
      expect(find.textContaining('استثناء 1 كرت منتهي الصلاحية'), findsOneWidget);

      // Confirm activation
      await tester.tap(find.text('نعم، تفعيل 2 كرت'));
      await tester.pumpAndSettle();

      // Mock notifier must have received only the 2 disabled card IDs
      expect(mockNotifier.lastActivatedCardIds, equals(['c-dis-1', 'c-dis-2']));
      expect(mockNotifier.lastActivatedCardIds.contains('c-exp-1'), isFalse);
    });

    testWidgets('6. Long Press on Card Tile enters selection mode and selects card', (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      final cards = [
        makeCard(id: 'c-single', username: 'singleUser', status: 'AVAILABLE'),
      ];

      final state = CardsInventoryState(
        cards: cards,
        totalMatching: 1,
        totalInventory: 1,
        isLoading: false,
        page: 1,
        totalPages: 1,
      );

      await tester.pumpWidget(createWidgetUnderTest(initialState: state));
      await tester.pumpAndSettle();

      // Long press card tile
      await tester.longPress(find.text('singleUser'));
      await tester.pumpAndSettle();

      // Selection mode should be active and card selected
      expect(find.text('المحدد: 1 كرت'), findsOneWidget);
    });
  });
}

class MockCardsInventoryNotifier extends CardsInventoryNotifier {
  final CardsInventoryState fixedState;
  List<String> lastDeletedCardIds = [];
  List<String> lastActivatedCardIds = [];

  MockCardsInventoryNotifier(this.fixedState);

  @override
  CardsInventoryState build() => fixedState;

  @override
  Future<void> loadInventory({
    int? page,
    String? status,
    String? search,
    String? profileId,
    String? deviceId,
    String? batchId,
    bool isRefresh = false,
  }) async {}

  @override
  Future<Map<String, dynamic>> bulkDeleteCards(List<String> cardIds) async {
    lastDeletedCardIds = List.from(cardIds);
    return {
      'success': true,
      'deletedCount': cardIds.length,
      'message': 'تم حذف ${cardIds.length} كرت بنجاح من قاعدة البيانات والراوتر',
    };
  }

  @override
  Future<Map<String, dynamic>> bulkActivateCards(List<String> cardIds) async {
    lastActivatedCardIds = List.from(cardIds);
    return {
      'success': true,
      'activatedCount': cardIds.length,
      'message': 'تم تفعيل ${cardIds.length} كرت بنجاح على النظام والراوتر',
    };
  }
}

class FakeLocalStorage implements LocalStorage {
  @override
  dynamic noSuchMethod(Invocation invocation) => null;

  @override
  String getThemeMode() => 'dark';
}
