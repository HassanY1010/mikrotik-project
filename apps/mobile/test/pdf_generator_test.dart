import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/models/models.dart';
import 'package:mobile/core/services/card_pdf_generator_service.dart';
import 'package:mobile/core/services/thermal_printer_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Card and Thermal PDF Generation Suite', () {
    final sampleCards = List.generate(24, (i) => OfflineCardModel(
      id: 'card-test-$i',
      serialNumber: 'SN-2026-${(1000 + i)}',
      username: 'HS${10000 + i}',
      clearPassword: 'PIN${8000 + i}',
      profileId: 'prof-golden',
      profileName: 'باقة إنترنت ذهبية 3 ساعات',
      deviceId: 'router-main',
      price: 1500.0,
      currency: 'SDG',
      status: 'AVAILABLE',
    ));

    test('generateCardsPdf renders valid A4 PDF bytes with theme FOOTBALL and mixed Arabic/English', () async {
      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: sampleCards,
        networkName: 'سودافاي | SudaFi Net',
        supportPhone: '+249912345678',
        layout: CardPdfLayout.a4Grid12,
        batchNumber: 'BATCH-2026-TEST',
        themePreset: 'FOOTBALL',
      );

      expect(pdfBytes.isNotEmpty, isTrue);
      // Valid PDF magic header %PDF-
      final header = String.fromCharCodes(pdfBytes.sublist(0, 5));
      expect(header, '%PDF-');

      // Verify file can be written to disk
      final file = File('test_output_football.pdf');
      await file.writeAsBytes(pdfBytes);
      expect(await file.exists(), isTrue);
      await file.delete();
    });

    test('generateCardsPdf handles dense 100-grid format with Arabic profiles without failure', () async {
      final manyCards = List.generate(100, (i) => OfflineCardModel(
        id: 'card-dense-$i',
        serialNumber: 'SN-00$i',
        username: 'U$i',
        clearPassword: 'P$i',
        profileId: 'prof-1',
        profileName: 'باقة يومية',
        deviceId: 'dev-1',
        price: 500.0,
        currency: 'SDG',
        status: 'AVAILABLE',
      ));

      final pdfBytes = await CardPdfGeneratorService.generateCardsPdf(
        cards: manyCards,
        networkName: 'شبكة السرعة الفائقة',
        layout: CardPdfLayout.a4Grid100,
        themePreset: 'TURQUOISE',
      );

      expect(pdfBytes.isNotEmpty, isTrue);
      expect(String.fromCharCodes(pdfBytes.sublist(0, 5)), '%PDF-');
    });

    test('generateReceiptPdf creates thermal receipt PDF with Arabic tenant and invoice details', () async {
      final receipt = SaleReceiptModel(
        invoiceNumber: 'INV-2026-9901',
        serialNumber: 'SN-882910',
        username: 'HS9912',
        password: 'PASS9912',
        profileName: 'باقة 24 ساعة إنترنت مفتوح',
        amount: 2500.0,
        currency: 'SDG',
        paymentMethod: 'MOBILE_WALLET',
        cashierName: 'محمد أحمد',
        tenantName: 'شبكة الأمل للاتصالات',
        soldAt: DateTime(2026, 10, 9, 14, 30),
      );

      final pdfBytes = await ThermalPrinterService.generateReceiptPdf(
        receipt,
        paperWidthMm: 80,
      );

      expect(pdfBytes.isNotEmpty, isTrue);
      expect(String.fromCharCodes(pdfBytes.sublist(0, 5)), '%PDF-');
    });

    test('generateShiftSummaryPdf creates A4 Cashier Shift Report with Arabic RTL reconciliation', () async {
      final pdfBytes = await ThermalPrinterService.generateShiftSummaryPdf(
        tenantName: 'مؤسسة سودافاي للشبكات',
        cashierName: 'أحمد السر',
        periodStart: DateTime(2026, 10, 9, 8, 0),
        periodEnd: DateTime(2026, 10, 9, 16, 0),
        cashInDrawer: 45000.0,
        totalSalesCount: 90,
        cashAmount: 35000.0,
        bankakAmount: 10000.0,
        fawryAmount: 0.0,
        cardAmount: 0.0,
        totalRevenue: 45000.0,
        currency: 'SDG',
        recentTransactions: [
          ShiftTransactionItem(
            id: 't-1',
            invoiceNumber: 'INV-101',
            amount: 500.0,
            currency: 'SDG',
            paymentMethod: 'CASH',
            customerName: 'طارق علي',
            createdAt: DateTime.now(),
            profileName: 'باقة 1 ساعة',
            username: 'USER101',
            serialNumber: 'SN-101',
            isRefunded: false,
          ),
        ],
        isClosed: true,
        closedAt: DateTime(2026, 10, 9, 16, 0),
      );

      expect(pdfBytes.isNotEmpty, isTrue);
      expect(String.fromCharCodes(pdfBytes.sublist(0, 5)), '%PDF-');
    });
  });
}
