import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/storage/local_storage.dart';
import 'package:mobile/core/services/card_template_import_service.dart';
import 'package:mobile/core/services/card_pdf_generator_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late SharedPreferences prefs;
  late LocalStorage storage;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
    storage = LocalStorage(prefs);
  });

  group('Pinned Card Template Persistence in LocalStorage', () {
    test('initially getPinnedTemplate returns null when no templates exist', () {
      expect(storage.getPinnedTemplateId(), isNull);
      expect(storage.getPinnedTemplate(), isNull);
    });

    test('sets and gets pinned template ID', () async {
      await storage.setPinnedTemplateId('tpl-12345');
      expect(storage.getPinnedTemplateId(), 'tpl-12345');

      await storage.setPinnedTemplateId(null);
      expect(storage.getPinnedTemplateId(), isNull);
    });

    test('saveCustomTemplate with isDefault true auto-updates pinned ID', () async {
      final tpl1 = CardTemplateModel(
        id: 'tpl-1',
        name: 'قالب كروت النجوم',
        widthMm: 85,
        heightMm: 54,
        isDefault: true,
        primaryColor: '#0F766E',
        accentColor: '#06B6D4',
      );

      await storage.saveCustomTemplate(tpl1);

      expect(storage.getPinnedTemplateId(), 'tpl-1');
      final pinned = storage.getPinnedTemplate();
      expect(pinned, isNotNull);
      expect(pinned!.id, 'tpl-1');
      expect(pinned.name, 'قالب كروت النجوم');
      expect(pinned.isDefault, isTrue);

      // Save second template with isDefault = true, should unpin first
      final tpl2 = CardTemplateModel(
        id: 'tpl-2',
        name: 'قالب الفيروز الجديد',
        widthMm: 100,
        heightMm: 40,
        isDefault: true,
        primaryColor: '#1E3A8A',
        accentColor: '#F59E0B',
      );

      await storage.saveCustomTemplate(tpl2);

      expect(storage.getPinnedTemplateId(), 'tpl-2');
      final updatedPinned = storage.getPinnedTemplate();
      expect(updatedPinned, isNotNull);
      expect(updatedPinned!.id, 'tpl-2');
      expect(updatedPinned.name, 'قالب الفيروز الجديد');

      final all = storage.getCustomTemplates();
      final firstInList = all.firstWhere((t) => t.id == 'tpl-1');
      expect(firstInList.isDefault, isFalse);
    });

    test('setTemplateAsDefault cleanly switches default flag and pinned id', () async {
      final tplA = CardTemplateModel(id: 'tpl-A', name: 'قالب A', widthMm: 85, heightMm: 54, isDefault: true);
      final tplB = CardTemplateModel(id: 'tpl-B', name: 'قالب B', widthMm: 85, heightMm: 54, isDefault: false);

      await storage.saveCustomTemplate(tplA);
      await storage.saveCustomTemplate(tplB);

      expect(storage.getPinnedTemplate()?.id, 'tpl-A');

      // Pin B
      await storage.setTemplateAsDefault('tpl-B');
      expect(storage.getPinnedTemplate()?.id, 'tpl-B');

      final list = storage.getCustomTemplates();
      expect(list.firstWhere((t) => t.id == 'tpl-A').isDefault, isFalse);
      expect(list.firstWhere((t) => t.id == 'tpl-B').isDefault, isTrue);
    });

    test('deleteCustomTemplate cleans up pinned template ID if deleted', () async {
      final tpl = CardTemplateModel(id: 'tpl-del', name: 'قالب للحذف', widthMm: 85, heightMm: 54, isDefault: true);
      await storage.saveCustomTemplate(tpl);
      expect(storage.getPinnedTemplateId(), 'tpl-del');

      await storage.deleteCustomTemplate('tpl-del');
      expect(storage.getPinnedTemplateId(), isNull);
      expect(storage.getPinnedTemplate(), isNull);
    });
  });

  group('Card Template Import with Default Pinning', () {
    test('createTemplateFromMedia with isDefault true marks template correctly', () {
      final dummyPngBytes = Uint8List.fromList([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      ]);

      final tpl = CardTemplateImportService.createTemplateFromMedia(
        imageBytes: dummyPngBytes,
        name: 'تصميم خلفية تجريبي',
        isDefault: true,
        networkName: 'شبكة السرعة المتقدمة',
      );

      expect(tpl.name, 'تصميم خلفية تجريبي');
      expect(tpl.isDefault, isTrue);
      expect(tpl.isImageBackground, isTrue);
      expect(tpl.networkName, 'شبكة السرعة المتقدمة');
      expect(tpl.hasCustomBackground, isTrue);
      expect(tpl.backgroundImageBase64, isNotNull);
    });
  });

  group('PDF Generation with Custom Pinned Template Attributes', () {
    test('generateCardsPdf renders using custom pinned template parameters', () async {
      final dummyCard = OfflineCardModel(
        id: 'card-1',
        serialNumber: 'SN-90210',
        username: 'user84920',
        clearPassword: 'user84920',
        profileId: 'prof-1',
        profileName: 'باقة اليوم 1 جيجا',
        deviceId: 'dev-1',
        price: 1500,
        currency: 'SDG',
      );

      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: [dummyCard],
        networkName: 'شبكة الكروت المخصصة',
        themePreset: 'CUSTOM_PINNED',
        customPrimaryColor: '#0F766E',
        customAccentColor: '#06B6D4',
        showQr: true,
        showPrice: true,
        showSerial: true,
        instructions: 'سجل الدخول فوراً عبر مسح الكود',
      );

      expect(pdfBytes, isNotNull);
      expect(pdfBytes.length, greaterThan(100));
      // PDF header validation %PDF-
      expect(utf8.decode(pdfBytes.sublist(0, 5)), '%PDF-');
    });
  });
}
