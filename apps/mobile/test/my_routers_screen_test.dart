import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/core/storage/local_storage.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/features/devices/presentation/my_routers_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

class MockRoutersNotifier extends RoutersNotifier {
  final List<RouterDeviceModel> _routers;
  MockRoutersNotifier(this._routers);

  @override
  Future<List<RouterDeviceModel>> build() async {
    return _routers;
  }
}

class MockSelectedRouterNotifier extends SelectedRouterNotifier {
  final String? _initial;
  MockSelectedRouterNotifier([this._initial]);

  @override
  String? build() => _initial;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late LocalStorage storage;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    storage = LocalStorage(prefs);
  });

  final testRouters = [
    RouterDeviceModel(
      id: 'router-1',
      name: 'راوتر الفرع الرئيسي',
      host: '192.168.88.1',
      apiPort: 8728,
      restPort: 80,
      username: 'admin',
      isOnline: true,
      status: 'ONLINE',
      connectivityState: 'ONLINE',
      modelName: 'RB4011iGS+',
      rosVersion: 'V7',
    ),
    RouterDeviceModel(
      id: 'router-2',
      name: 'راوتر الفرع الثاني',
      host: '192.168.10.1',
      apiPort: 8728,
      restPort: 80,
      username: 'admin',
      isOnline: false,
      status: 'OFFLINE',
      connectivityState: 'OFFLINE',
      modelName: 'hAP ac2',
      rosVersion: 'V6',
    ),
    RouterDeviceModel(
      id: 'router-3',
      name: 'راوتر المستودع',
      host: '10.0.0.1',
      apiPort: 8728,
      restPort: 80,
      username: 'admin',
      isOnline: true,
      status: 'ONLINE',
      connectivityState: 'ONLINE',
      modelName: 'hEX S',
      rosVersion: 'V7',
    ),
  ];

  testWidgets('يعرض قسم راوتري إحصائيات الأجهزة وبطاقات الراوترات بدقة مطابقة للتصميم', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          localStorageProvider.overrideWithValue(storage),
          routersProvider.overrideWith(() => MockRoutersNotifier(testRouters)),
          selectedRouterIdProvider.overrideWith(() => MockSelectedRouterNotifier('router-1')),
        ],
        child: MaterialApp(
          theme: AppTheme.lightTheme,
          locale: const Locale('ar'),
          home: const Directionality(
            textDirection: TextDirection.rtl,
            child: MyRoutersScreen(),
          ),
        ),
      ),
    );

    await tester.pumpAndSettle();

    // 1. العنوان والشارات
    expect(find.text('الراوترات'), findsOneWidget);
    expect(find.text('إدارة الأجهزة'), findsOneWidget);

    // 2. بطاقات الإحصائيات (الإجمالي 03، متصل 02، غير متصل 01)
    expect(find.text('إجمالي الراوترات'), findsOneWidget);
    expect(find.text('03'), findsOneWidget);
    expect(find.text('متصل'), findsWidgets);
    expect(find.text('02'), findsOneWidget);
    expect(find.text('غير متصل'), findsWidgets);
    expect(find.text('01'), findsOneWidget);

    // 3. أسماء الراوترات وعناوين الآيبي
    expect(find.text('راوتر الفرع الرئيسي'), findsOneWidget);
    expect(find.text('IP: 192.168.88.1'), findsOneWidget);

    expect(find.text('راوتر الفرع الثاني'), findsOneWidget);
    expect(find.text('IP: 192.168.10.1'), findsOneWidget);

    expect(find.text('راوتر المستودع'), findsOneWidget);
    expect(find.text('IP: 10.0.0.1'), findsOneWidget);

    // 4. أزرار الإجراءات لكل كرت
    expect(find.text('الراوتر المحدد ✓'), findsOneWidget); // للراوتر النشط الأول
    expect(find.text('اختيار الراوتر'), findsNWidgets(2)); // للراوترين الآخرين
    expect(find.text('تعديل البيانات'), findsNWidgets(3));
    expect(find.text('إعادة الاتصال'), findsNWidgets(3));

    // 5. زر الإضافة السفلي
    expect(find.text('إضافة راوتر جديد'), findsOneWidget);
  });

  testWidgets('اختيار راوتر يغير الراوتر النشط ويحدث الحالة', (tester) async {
    final container = ProviderContainer(
      overrides: [
        localStorageProvider.overrideWithValue(storage),
        routersProvider.overrideWith(() => MockRoutersNotifier(testRouters)),
      ],
    );

    // Initial state: router-1
    container.read(selectedRouterIdProvider.notifier).select('router-1');
    expect(container.read(selectedRouterIdProvider), 'router-1');

    // Switch to router-2
    container.read(selectedRouterIdProvider.notifier).select('router-2');
    expect(container.read(selectedRouterIdProvider), 'router-2');
    expect(storage.getSelectedRouterId(), 'router-2');

    // Switch to router-3
    container.read(selectedRouterIdProvider.notifier).select('router-3');
    expect(container.read(selectedRouterIdProvider), 'router-3');
    expect(storage.getSelectedRouterId(), 'router-3');
  });
}
