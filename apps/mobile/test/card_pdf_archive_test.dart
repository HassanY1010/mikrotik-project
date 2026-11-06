import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/services/card_pdf_archive_service.dart';
import 'package:mobile/core/providers.dart';
import 'package:mobile/features/studio/presentation/pdf_history_screen.dart';

class MockCardPdfArchiveService extends CardPdfArchiveService {
  MockCardPdfArchiveService() : super.mock();

  @override
  Future<List<Map<String, dynamic>>> getPendingUploads() async => [];

  final List<CardPdfArchiveModel> mockList = [
    CardPdfArchiveModel(
      id: 'arch-1',
      tenantId: 'tenant-1',
      fileName: 'SudaFi_Batch_100_Cards.pdf',
      storagePath: 'tenant-1/arch-1.pdf',
      fileSize: 245000,
      cardCount: 100,
      templateType: 'FOOTBALL',
      networkName: 'سودافاي هوتسبوت',
      profileName: 'HR (يوم واحد)',
      createdAt: DateTime(2026, 11, 6, 10, 30),
      signedUrl: 'https://supabase.co/signed/arch-1.pdf',
    ),
    CardPdfArchiveModel(
      id: 'arch-2',
      tenantId: 'tenant-1',
      fileName: 'SudaFi_Batch_50_Cards.pdf',
      storagePath: 'tenant-1/arch-2.pdf',
      fileSize: 1250000,
      cardCount: 50,
      templateType: 'LUXURY_ROYAL',
      networkName: 'سودافاي VIP',
      profileName: '3 Days Uncapped',
      createdAt: DateTime(2026, 11, 5, 14, 15),
      signedUrl: 'https://supabase.co/signed/arch-2.pdf',
    ),
  ];

  @override
  Future<CardPdfArchiveModel?> uploadPdfArchive({
    required Uint8List pdfBytes,
    required String fileName,
    required int cardCount,
    String? templateType,
    String? networkName,
    String? profileName,
    String? batchId,
    Map<String, dynamic>? metadata,
  }) async {
    final newModel = CardPdfArchiveModel(
      id: 'arch-${mockList.length + 1}',
      tenantId: 'tenant-1',
      fileName: fileName,
      storagePath: 'tenant-1/new.pdf',
      fileSize: pdfBytes.length,
      cardCount: cardCount,
      templateType: templateType,
      networkName: networkName,
      profileName: profileName,
      batchId: batchId,
      metadata: metadata,
      createdAt: DateTime.now(),
    );
    mockList.insert(0, newModel);
    return newModel;
  }

  @override
  Future<Map<String, dynamic>> getArchives({
    String? search,
    DateTime? startDate,
    DateTime? endDate,
    bool sortAsc = false,
    int page = 1,
    int limit = 20,
  }) async {
    var filtered = List<CardPdfArchiveModel>.from(mockList);
    if (search != null && search.isNotEmpty) {
      filtered = filtered.where((a) => a.fileName.contains(search) || (a.networkName?.contains(search) ?? false)).toList();
    }
    return {
      'data': filtered,
      'total': filtered.length,
      'page': page,
      'totalPages': 1,
    };
  }

  @override
  Future<Uint8List> downloadArchivePdf(String id, {String? signedUrl}) async {
    return Uint8List.fromList(utf8.encode('%PDF-1.4 mock content'));
  }

  @override
  Future<bool> deleteArchive(String id) async {
    mockList.removeWhere((a) => a.id == id);
    return true;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('CardPdfArchiveModel Tests', () {
    test('JSON serialization & deserialization', () {
      final json = {
        'id': 'test-id',
        'tenantId': 'tenant-xyz',
        'fileName': 'Batch.pdf',
        'storagePath': 'tenant-xyz/test-id.pdf',
        'fileSize': 1048576, // 1 MB
        'cardCount': 100,
        'templateType': 'MINIMALIST',
        'networkName': 'SudaFi Net',
        'profileName': '1 Hour',
        'batchId': 'b-123',
        'metadata': {'cols': 5, 'rows': 20},
        'createdAt': '2026-11-06T12:00:00.000Z',
        'signedUrl': 'https://supabase.co/signed',
      };

      final model = CardPdfArchiveModel.fromJson(json);
      expect(model.id, equals('test-id'));
      expect(model.fileSize, equals(1048576));
      expect(model.formattedFileSize, equals('1.00 م.ب'));
      expect(model.formattedDate, equals('2026/11/06'));
      expect(model.signedUrl, equals('https://supabase.co/signed'));

      final outJson = model.toJson();
      expect(outJson['fileName'], equals('Batch.pdf'));
      expect(outJson['cardCount'], equals(100));
    });

    test('File size formatting (Bytes, KB, MB)', () {
      final mBytes = CardPdfArchiveModel(
        id: '1',
        tenantId: 't',
        fileName: 'f',
        storagePath: 's',
        fileSize: 850,
        cardCount: 1,
        createdAt: DateTime.now(),
      );
      expect(mBytes.formattedFileSize, equals('850 بايت'));

      final mKb = mBytes.copyWith(fileSize: 52400);
      expect(mKb.formattedFileSize, contains('ك.ب'));

      final mMb = mBytes.copyWith(fileSize: 2621440);
      expect(mMb.formattedFileSize, contains('م.ب'));
    });
  });

  group('PdfHistoryScreen Widget Tests', () {
    setUp(() {
      SharedPreferences.setMockInitialValues({});
    });

    testWidgets('Renders archives list with metadata badges and action buttons', (tester) async {
      final mockService = MockCardPdfArchiveService();

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            cardPdfArchiveServiceProvider.overrideWithValue(mockService),
          ],
          child: const MaterialApp(
            home: PdfHistoryScreen(),
          ),
        ),
      );

      // Wait for initial load
      await tester.pumpAndSettle();

      // Verify AppBar title
      expect(find.text('الملفات السابقة'), findsOneWidget);
      expect(find.textContaining('أرشيف ملفات PDF السحابي للعميل'), findsOneWidget);

      // Verify items from mock list
      expect(find.text('SudaFi_Batch_100_Cards.pdf'), findsOneWidget);
      expect(find.text('100 كرت'), findsOneWidget);
      expect(find.text('SudaFi_Batch_50_Cards.pdf'), findsOneWidget);
      expect(find.text('50 كرت'), findsOneWidget);

      // Verify action buttons
      expect(find.text('عرض'), findsNWidgets(2));
      expect(find.text('مشاركة'), findsNWidgets(2));
      expect(find.byIcon(Icons.delete_outline), findsNWidgets(2));
    });

    testWidgets('Search input filters archives correctly', (tester) async {
      final mockService = MockCardPdfArchiveService();

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            cardPdfArchiveServiceProvider.overrideWithValue(mockService),
          ],
          child: const MaterialApp(
            home: PdfHistoryScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Enter search term
      await tester.enterText(find.byType(TextField), '100');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();

      // Should only show the 100 cards file
      expect(find.text('SudaFi_Batch_100_Cards.pdf'), findsOneWidget);
      expect(find.text('SudaFi_Batch_50_Cards.pdf'), findsNothing);
    });

    testWidgets('Delete item shows confirmation dialog and removes item upon confirmation', (tester) async {
      final mockService = MockCardPdfArchiveService();

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            cardPdfArchiveServiceProvider.overrideWithValue(mockService),
          ],
          child: const MaterialApp(
            home: PdfHistoryScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Tap delete on first card
      await tester.tap(find.byIcon(Icons.delete_outline).first);
      await tester.pumpAndSettle();

      // Verify confirmation dialog
      expect(find.text('حذف ملف من الأرشيف'), findsOneWidget);
      expect(find.text('تأكيد الحذف'), findsOneWidget);

      // Tap confirm delete
      await tester.tap(find.text('تأكيد الحذف'));
      await tester.pumpAndSettle();

      // Item should be removed
      expect(find.text('SudaFi_Batch_100_Cards.pdf'), findsNothing);
      expect(find.text('SudaFi_Batch_50_Cards.pdf'), findsOneWidget);
    });
  });
}
