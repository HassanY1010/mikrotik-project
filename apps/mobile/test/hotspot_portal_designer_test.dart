import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:archive/archive.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile/core/constants/api_endpoints.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/core/storage/local_storage.dart';
import 'package:mobile/features/portal/presentation/hotspot_portal_designer_screen.dart';
import 'package:mobile/features/portal/services/hotspot_portal_validator.dart';

void main() {
  group('HotspotPortalValidator Unit Tests', () {
    test('should validate single HTML and detect missing login form variables', () {
      const sampleHtml = '''
<!DOCTYPE html>
<html>
<head>
  <title>Test Portal</title>
  <link rel="stylesheet" href="css/style.css">
  <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
</head>
<body>
  <h1>Welcome to Hotspot</h1>
  <img src="images/logo.png">
</body>
</html>
''';

      final bundle = HotspotPortalValidator.processSingleHtml(
        filename: 'login.html',
        bytes: Uint8List.fromList(utf8.encode(sampleHtml)),
      );

      expect(bundle.files.length, 1);
      expect(bundle.mainHtmlPath, 'login.html');
      expect(bundle.report.isValid, true); // It has an HTML file

      // Detected missing local files
      expect(bundle.report.missingLocalFiles, contains('css/style.css'));
      expect(bundle.report.missingLocalFiles, contains('images/logo.png'));

      // Detected external CDNs
      expect(
        bundle.report.externalUrls,
        contains('https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js'),
      );

      // Warning generated for missing files and CDNs
      expect(bundle.report.warnings.length, greaterThanOrEqualTo(2));
      expect(bundle.report.hotspotFeatures['hasLoginForm'], false);
    });

    test('should extract ZIP archive and preserve relative directory hierarchy', () {
      final archive = Archive();

      // Add login.html
      const loginHtml = '''
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="assets/theme.css">
</head>
<body>
  <form action="\$(link-login-only)" method="post">
    <input type="text" name="username">
    <input type="password" name="password">
    <span>\$(error)</span>
  </form>
</body>
</html>
''';
      archive.addFile(ArchiveFile('login.html', loginHtml.length, utf8.encode(loginHtml)));

      // Add assets/theme.css
      const cssContent = 'body { background: #000; }';
      archive.addFile(ArchiveFile('assets/theme.css', cssContent.length, utf8.encode(cssContent)));

      // Encode to ZIP bytes
      final zipEncoder = ZipEncoder();
      final zipBytes = zipEncoder.encode(archive);
      expect(zipBytes, isNotNull);

      final bundle = HotspotPortalValidator.processZipArchive(
        zipFilename: 'my_hotspot_pack.zip',
        zipBytes: Uint8List.fromList(zipBytes!),
      );

      expect(bundle.files.length, 2);
      expect(bundle.files.map((f) => f.path), containsAll(['login.html', 'assets/theme.css']));
      expect(bundle.report.isValid, true);
      expect(bundle.report.missingLocalFiles, isEmpty); // theme.css was present!
      expect(bundle.report.hotspotFeatures['hasLoginForm'], true);
      expect(bundle.report.hotspotFeatures['hasUsername'], true);
      expect(bundle.report.hotspotFeatures['hasErrorVariable'], true);
    });

    test('should reject dangerous executable files and path traversal in ZIP', () {
      final archive = Archive();
      archive.addFile(ArchiveFile('login.html', 10, utf8.encode('<html></html>')));
      archive.addFile(ArchiveFile('../escaped.txt', 5, utf8.encode('hack')));
      archive.addFile(ArchiveFile('scripts/trojan.exe', 10, utf8.encode('binary')));

      final zipEncoder = ZipEncoder();
      final zipBytes = zipEncoder.encode(archive);

      final bundle = HotspotPortalValidator.processZipArchive(
        zipFilename: 'trap.zip',
        zipBytes: Uint8List.fromList(zipBytes!),
      );

      // Dangerous files must be rejected during extraction
      expect(bundle.files.any((f) => f.path.contains('trojan.exe')), false);
      expect(bundle.files.any((f) => f.path.contains('..')), false);
      expect(bundle.report.errors.length, greaterThanOrEqualTo(2));
      expect(bundle.report.isValid, false);
    });

    test('should reject bundle if missing HTML file', () {
      final archive = Archive();
      archive.addFile(ArchiveFile('style.css', 10, utf8.encode('body {}')));
      archive.addFile(ArchiveFile('logo.png', 10, utf8.encode('fake-png')));

      final zipEncoder = ZipEncoder();
      final zipBytes = zipEncoder.encode(archive);

      final bundle = HotspotPortalValidator.processZipArchive(
        zipFilename: 'no_html.zip',
        zipBytes: Uint8List.fromList(zipBytes!),
      );

      expect(bundle.report.isValid, false);
      expect(bundle.report.errors.first, contains('HTML رئيسي'));
    });
  });

  group('HotspotPortalDesignerScreen UI & Widget Tests', () {
    test('ApiEndpoints includes portal routes', () {
      expect(ApiEndpoints.portalPublish('dev1'), '/portal/devices/dev1/publish');
      expect(ApiEndpoints.portalInspectHotspot('dev1'), '/portal/devices/dev1/inspect-hotspot');
    });

    testWidgets('should display ONLY the two primary choices on initial screen', (WidgetTester tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: HotspotPortalDesignerScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Check header
      expect(find.text('مصمم صفحات الهوتسبوت'), findsOneWidget);
      expect(find.text('بوابة تسجيل دخول MikroTik'), findsOneWidget);

      // Verify Choice 1 is displayed directly
      expect(find.text('إضافة صفحة من الصفحات الجاهزة'), findsOneWidget);
      expect(find.text('استعراض الصفحات الجاهزة ←'), findsOneWidget);

      // Verify Choice 2 is displayed directly
      expect(find.text('استيراد صفحة من الهاتف'), findsOneWidget);
      expect(find.text('استيراد صفحة من الهاتف ←'), findsOneWidget);
    });

    testWidgets('should transition to ready-made viewer when option 1 is clicked', (WidgetTester tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: HotspotPortalDesignerScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Tap on Option 1 button
      await tester.tap(find.text('استعراض الصفحات الجاهزة ←'));
      await tester.pumpAndSettle();

      // Should now be on ready-made viewer
      expect(find.text('الصفحات الجاهزة'), findsOneWidget);
      expect(find.text('اختر نموذج الصفحة الجاهزة:'), findsOneWidget);
      expect(find.text('معاينة حية لتصميم الصفحة:'), findsOneWidget);
      expect(find.text('إضافة الصفحة إلى الراوتر المحدد'), findsOneWidget);

      // Tap back button
      await tester.tap(find.byIcon(Icons.arrow_back_ios_new_rounded));
      await tester.pumpAndSettle();

      // Returns to the two options screen cleanly
      expect(find.text('إضافة صفحة من الصفحات الجاهزة'), findsOneWidget);
      expect(find.text('استيراد صفحة من الهاتف'), findsOneWidget);
    });

    testWidgets('should allow modifying network name and updating live preview', (WidgetTester tester) async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final storage = LocalStorage(prefs);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
          ],
          child: const MaterialApp(
            home: HotspotPortalDesignerScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();
      await tester.tap(find.text('استعراض الصفحات الجاهزة ←'));
      await tester.pumpAndSettle();

      // Verify the customization title
      expect(find.text('تعديل بيانات صفحة الدخول:'), findsOneWidget);
      expect(find.text('1. اسم الشبكة داخل صفحة الدخول (SSID):'), findsOneWidget);

      // Enter a custom network name in the TextField
      final networkField = find.byType(TextField).first;
      await tester.enterText(networkField, 'شبكة الأمل الفضائية');
      await tester.pumpAndSettle();

      // Verify live preview now displays the customized network name
      expect(find.text('شبكة الأمل الفضائية'), findsAtLeastNWidgets(1));

      // Verify storage was updated
      expect(storage.getHotspotNetworkName(), 'شبكة الأمل الفضائية');
    });

    testWidgets('should toggle login method and update live preview fields', (WidgetTester tester) async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final storage = LocalStorage(prefs);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            localStorageProvider.overrideWithValue(storage),
          ],
          child: const MaterialApp(
            home: HotspotPortalDesignerScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();
      await tester.tap(find.text('استعراض الصفحات الجاهزة ←'));
      await tester.pumpAndSettle();

      // Initially VOUCHER is selected -> single voucher field in preview
      expect(find.text('اسم مستخدم فقط (كود الكرت / PIN)'), findsOneWidget);
      expect(find.text('اسم مستخدم وكلمة مرور منفصلين'), findsOneWidget);
      expect(find.text('الوضع المزدوج الذكي (يدعم النوعين معاً)'), findsOneWidget);
      expect(find.text('أدخل كود كرت الإنترنت (PIN)'), findsOneWidget);
      expect(find.text('اسم المستخدم (المطبوع على الكرت)'), findsNothing);

      // Tap on "اسم مستخدم وكلمة مرور منفصلين"
      await tester.tap(find.text('اسم مستخدم وكلمة مرور منفصلين'));
      await tester.pumpAndSettle();

      // Verify preview now shows username and password fields
      expect(find.text('اسم المستخدم (المطبوع على الكرت)'), findsOneWidget);
      expect(find.text('كلمة المرور (••••••••)'), findsOneWidget);
      expect(find.text('أدخل كود كرت الإنترنت (PIN)'), findsNothing);
      expect(storage.getHotspotLoginMethod(), 'USER_PASS');

      // Tap on "الوضع المزدوج الذكي (يدعم النوعين معاً)"
      await tester.tap(find.text('الوضع المزدوج الذكي (يدعم النوعين معاً)'));
      await tester.pumpAndSettle();
      expect(find.text('اسم المستخدم أو كود الكرت'), findsOneWidget);
      expect(find.text('كلمة المرور (اتركها فارغة لكروت الـ PIN)'), findsOneWidget);
      expect(storage.getHotspotLoginMethod(), 'BOTH');

      // Tap back to "اسم مستخدم فقط (كود الكرت / PIN)"
      await tester.tap(find.text('اسم مستخدم فقط (كود الكرت / PIN)'));
      await tester.pumpAndSettle();

      // Verify preview returns to voucher single field
      expect(find.text('أدخل كود كرت الإنترنت (PIN)'), findsOneWidget);
      expect(find.text('اسم المستخدم (المطبوع على الكرت)'), findsNothing);
      expect(storage.getHotspotLoginMethod(), 'VOUCHER');
    });
  });
}
