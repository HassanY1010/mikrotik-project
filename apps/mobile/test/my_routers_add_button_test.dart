import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/features/devices/presentation/my_routers_screen.dart';
import 'package:mobile/features/router_setup/presentation/router_setup_screen.dart';

class _StubRoutersNotifier extends RoutersNotifier {
  final List<RouterDeviceModel> items;
  _StubRoutersNotifier(this.items);

  @override
  Future<List<RouterDeviceModel>> build() async => items;
}

class _StubSelectedRouterNotifier extends SelectedRouterNotifier {
  @override
  String? build() => 'r-1';
}

void main() {
  testWidgets('Pressing إضافة راوتر جديد in MyRoutersScreen opens Add Router modal instead of 6-step RouterSetupScreen', (tester) async {
    final router = RouterDeviceModel(
      id: 'r-1',
      name: 'Main Router',
      host: '192.168.88.1',
      username: 'admin',
      apiPort: 8728,
      restPort: 80,
      rosVersion: 'V7',
      isOnline: true,
      status: 'ONLINE',
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          routersProvider.overrideWith(() => _StubRoutersNotifier([router])),
          selectedRouterIdProvider.overrideWith(() => _StubSelectedRouterNotifier()),
        ],
        child: const MaterialApp(
          home: MyRoutersScreen(),
        ),
      ),
    );

    await tester.pumpAndSettle();

    // Existing list features remain intact
    expect(find.text('Main Router'), findsOneWidget);
    expect(find.text('إعادة الاتصال'), findsOneWidget);
    expect(find.text('تعديل البيانات'), findsOneWidget);

    // Tap "إضافة راوتر جديد"
    final addButton = find.text('إضافة راوتر جديد');
    expect(addButton, findsOneWidget);
    await tester.tap(addButton);
    await tester.pumpAndSettle();

    // Verify Quick Add Router form opened (and NOT RouterSetupScreen)
    expect(find.byType(RouterSetupScreen), findsNothing);
    expect(find.text('إضافة راوتر MikroTik'), findsOneWidget);
    expect(find.text('بحث عن الراوترات'), findsOneWidget);
    expect(find.text('عنوان IP'), findsOneWidget);
    expect(find.text('اسم الراوتر'), findsOneWidget);
    expect(find.text('كلمة المرور'), findsOneWidget);
    expect(find.text('فحص الاتصال'), findsOneWidget);
    expect(find.text('حفظ وربط الراوتر'), findsOneWidget);
  });
}
