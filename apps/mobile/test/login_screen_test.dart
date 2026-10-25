import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/core/storage/local_storage.dart';
import 'package:mobile/features/auth/presentation/login_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('LoginScreen password visibility toggle and updated button text test', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final storage = LocalStorage(prefs);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          localStorageProvider.overrideWithValue(storage),
        ],
        child: const MaterialApp(
          home: LoginScreen(),
        ),
      ),
    );

    await tester.pumpAndSettle();

    // 1. Verify Login button text:
    // Should be 'تسجيل الدخول' and NOT contain 'نقطة البيع'
    expect(find.text('تسجيل الدخول'), findsOneWidget);
    expect(find.text('دخول إلى نقطة البيع'), findsNothing);
    expect(find.text('الدخول إلى نقطة الـبيع'), findsNothing);

    // 2. Locate password TextField by labelText:
    final passwordFieldFinder = find.byWidgetPredicate(
      (w) => w is TextField && w.decoration?.labelText == 'كلمة المرور',
    );
    expect(passwordFieldFinder, findsOneWidget);

    TextField pwdField = tester.widget<TextField>(passwordFieldFinder);
    expect(pwdField.obscureText, isTrue, reason: 'Password should initially be obscured');

    // 3. Verify eye icon exists (initially visibility_off)
    expect(find.byIcon(Icons.visibility_off), findsOneWidget);
    expect(find.byIcon(Icons.visibility), findsNothing);

    // 4. Enter password text
    await tester.enterText(passwordFieldFinder, 'SecretPass123');
    await tester.pump();

    // 5. Tap eye icon to toggle visibility
    await tester.tap(find.byIcon(Icons.visibility_off));
    await tester.pumpAndSettle();

    // Field should now NOT be obscured, and icon should be visibility
    pwdField = tester.widget<TextField>(passwordFieldFinder);
    expect(pwdField.obscureText, isFalse, reason: 'Password should now be visible');
    expect(find.byIcon(Icons.visibility), findsOneWidget);
    expect(find.byIcon(Icons.visibility_off), findsNothing);

    // Verify text is preserved
    expect(pwdField.controller?.text, 'SecretPass123');

    // 6. Tap eye icon again to hide
    await tester.tap(find.byIcon(Icons.visibility));
    await tester.pumpAndSettle();

    pwdField = tester.widget<TextField>(passwordFieldFinder);
    expect(pwdField.obscureText, isTrue, reason: 'Password should be obscured again');
    expect(find.byIcon(Icons.visibility_off), findsOneWidget);
    expect(find.byIcon(Icons.visibility), findsNothing);

    // Verify text is still preserved
    expect(pwdField.controller?.text, 'SecretPass123');
  });
}
