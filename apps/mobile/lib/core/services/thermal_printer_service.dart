import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:intl/intl.dart' as intl;
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/models.dart';
import 'pdf_font_service.dart';

class PrinterResult {
  final bool isSuccess;
  final String message;

  const PrinterResult({required this.isSuccess, required this.message});

  factory PrinterResult.success([String message = 'تمت إرسال مهمة الطباعة بنجاح']) {
    return PrinterResult(isSuccess: true, message: message);
  }

  factory PrinterResult.failure(String message) {
    return PrinterResult(isSuccess: false, message: message);
  }
}

class ThermalPrinterService {
  static const String _prefPrinterIpKey = 'thermal_printer_ip';
  static const String _prefPrinterPortKey = 'thermal_printer_port';
  static const String _prefPaperWidthKey = 'thermal_paper_width_mm';
  static const String defaultIp = '192.168.1.100';
  static const int defaultPort = 9100;
  static const int defaultPaperWidth = 58; // 58mm or 80mm

  // ESC/POS Commands
  static const List<int> cmdInit = [0x1B, 0x40]; // ESC @ (Initialize)
  static const List<int> cmdAlignLeft = [0x1B, 0x61, 0x00]; // ESC a 0
  static const List<int> cmdAlignCenter = [0x1B, 0x61, 0x01]; // ESC a 1
  static const List<int> cmdAlignRight = [0x1B, 0x61, 0x02]; // ESC a 2
  static const List<int> cmdBoldOn = [0x1B, 0x45, 0x01]; // ESC E 1
  static const List<int> cmdBoldOff = [0x1B, 0x45, 0x00]; // ESC E 0
  static const List<int> cmdDoubleSize = [0x1D, 0x21, 0x11]; // GS ! 0x11
  static const List<int> cmdNormalSize = [0x1D, 0x21, 0x00]; // GS ! 0x00
  static const List<int> cmdCut = [0x1D, 0x56, 0x42, 0x00]; // GS V 66 0 (Cut paper)

  static Future<String> getSavedPrinterIp() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_prefPrinterIpKey) ?? defaultIp;
  }

  static Future<int> getSavedPrinterPort() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getInt(_prefPrinterPortKey) ?? defaultPort;
  }

  static Future<int> getSavedPaperWidth() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getInt(_prefPaperWidthKey) ?? defaultPaperWidth;
  }

  static Future<void> savePrinterConfig(String ip, int port, [int paperWidth = 58]) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefPrinterIpKey, ip.trim());
    await prefs.setInt(_prefPrinterPortKey, port);
    await prefs.setInt(_prefPaperWidthKey, paperWidth);
  }

  /// Format payment method label in Arabic
  static String formatPaymentMethod(String method) {
    switch (method.toUpperCase()) {
      case 'CASH':
        return 'نقداً (كاش)';
      case 'BANK':
      case 'TRANSFER':
        return 'بنك (تحويل بنكي / بنكك)';
      case 'CASH_FAWRI':
      case 'FAWRI':
      case 'MOBILE_WALLET':
        return 'كاش فوري / أوكاش';
      case 'CARD':
        return 'بطاقة بنكية';
      default:
        return method;
    }
  }

  /// Generates a high-quality thermal receipt PDF formatted for 58mm or 80mm roll with Arabic typography
  static Future<Uint8List> generateReceiptPdf(
    SaleReceiptModel receipt, {
    int paperWidthMm = 58,
  }) async {
    final pdf = pw.Document(
      title: 'إيصال بيع كرت - ${receipt.invoiceNumber}',
      author: receipt.tenantName,
    );

    // Load reliable Arabic TrueType fonts
    final fontBundle = await PdfFontService.loadArabicFonts();
    final fontRegular = fontBundle.regular;
    final fontBold = fontBundle.bold;

    final double widthPt = paperWidthMm * (72 / 25.4); // Convert mm to pt
    final rollFormat = PdfPageFormat(
      widthPt,
      double.infinity,
      marginLeft: 4 * PdfPageFormat.mm,
      marginRight: 4 * PdfPageFormat.mm,
      marginTop: 4 * PdfPageFormat.mm,
      marginBottom: 6 * PdfPageFormat.mm,
    );

    final dateFormat = intl.DateFormat('yyyy-MM-dd HH:mm');

    pdf.addPage(
      pw.Page(
        pageFormat: rollFormat,
        theme: pw.ThemeData.withFont(
          base: fontRegular,
          bold: fontBold,
        ),
        build: (pw.Context context) {
          return pw.Directionality(
            textDirection: pw.TextDirection.rtl,
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.center,
              mainAxisSize: pw.MainAxisSize.min,
              children: [
                // Header: Network / Store Name
                pw.Text(
                  receipt.tenantName,
                  style: pw.TextStyle(
                    font: fontBold,
                    fontSize: paperWidthMm >= 80 ? 15 : 12,
                    fontWeight: pw.FontWeight.bold,
                  ),
                  textAlign: pw.TextAlign.center,
                ),
                pw.SizedBox(height: 2),
                pw.Text(
                  'إيصال شحن بطاقة هوتسبوت',
                  style: pw.TextStyle(
                    font: fontRegular,
                    fontSize: paperWidthMm >= 80 ? 10 : 8.5,
                    color: PdfColors.grey700,
                  ),
                  textAlign: pw.TextAlign.center,
                ),
                if (receipt.isOffline) ...[
                  pw.SizedBox(height: 2),
                  pw.Container(
                    padding: const pw.EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                    decoration: pw.BoxDecoration(
                      border: pw.Border.all(color: PdfColors.amber800, width: 0.5),
                      borderRadius: const pw.BorderRadius.all(pw.Radius.circular(3)),
                    ),
                    child: pw.Text(
                      '(تم الإصدار دون اتصال بالخادم)',
                      style: pw.TextStyle(
                        font: fontRegular,
                        fontSize: 7.5,
                        color: PdfColors.amber800,
                      ),
                    ),
                  ),
                ],
                pw.SizedBox(height: 4),
                pw.Divider(thickness: 0.75, color: PdfColors.black),
                pw.SizedBox(height: 3),

                // Transaction meta
                _buildPdfRow('رقم الفاتورة:', receipt.invoiceNumber, fontBold, fontRegular),
                _buildPdfRow('التاريخ والوقت:', dateFormat.format(receipt.soldAt), fontBold, fontRegular),
                _buildPdfRow('الباقة:', receipt.profileName, fontBold, fontRegular),
                if (receipt.quantity > 1)
                  _buildPdfRow('الكمية:', '${receipt.quantity}', fontBold, fontRegular),
                _buildPdfRow(
                  'الإجمالي:',
                  '${receipt.amount.toStringAsFixed(0)} ${receipt.currency}',
                  fontBold,
                  fontBold,
                  isHighlight: true,
                ),
                _buildPdfRow('طريقة الدفع:', formatPaymentMethod(receipt.paymentMethod), fontBold, fontRegular),
                _buildPdfRow('الكاشير:', receipt.cashierName, fontBold, fontRegular),
                if (receipt.customerPhone != null && receipt.customerPhone!.isNotEmpty)
                  _buildPdfRow('هاتف العميل:', receipt.customerPhone!, fontBold, fontRegular),
                if (receipt.customerName != null && receipt.customerName!.isNotEmpty)
                  _buildPdfRow('اسم العميل:', receipt.customerName!, fontBold, fontRegular),

                pw.SizedBox(height: 3),
                pw.Divider(thickness: 0.75, color: PdfColors.black),
                pw.SizedBox(height: 4),

                // Card Credentials Box
                pw.Container(
                  width: double.infinity,
                  padding: const pw.EdgeInsets.all(5),
                  decoration: pw.BoxDecoration(
                    border: pw.Border.all(color: PdfColors.black, width: 0.75),
                    borderRadius: const pw.BorderRadius.all(pw.Radius.circular(4)),
                  ),
                  child: pw.Column(
                    children: [
                      pw.Text(
                        'بيانات تسجيل الدخول للشبكة',
                        style: pw.TextStyle(
                          font: fontBold,
                          fontSize: 9,
                          fontWeight: pw.FontWeight.bold,
                        ),
                        textAlign: pw.TextAlign.center,
                      ),
                      pw.SizedBox(height: 2),
                      pw.Text(
                        'الرقم التسلسلي: ${receipt.serialNumber}',
                        style: pw.TextStyle(
                          font: fontRegular,
                          fontSize: 7.5,
                          color: PdfColors.grey800,
                        ),
                      ),
                      pw.SizedBox(height: 4),
                      pw.Row(
                        mainAxisAlignment: pw.MainAxisAlignment.center,
                        children: [
                          pw.Text(
                            'اسم المستخدم: ',
                            style: pw.TextStyle(font: fontRegular, fontSize: 9),
                          ),
                          pw.Directionality(
                            textDirection: pw.TextDirection.ltr,
                            child: pw.Text(
                              receipt.username,
                              style: pw.TextStyle(
                                font: fontBold,
                                fontSize: paperWidthMm >= 80 ? 14 : 12,
                                fontWeight: pw.FontWeight.bold,
                              ),
                            ),
                          ),
                        ],
                      ),
                      if (receipt.password != null && receipt.password!.isNotEmpty) ...[
                        pw.SizedBox(height: 2),
                        pw.Row(
                          mainAxisAlignment: pw.MainAxisAlignment.center,
                          children: [
                            pw.Text(
                              'كلمة المرور: ',
                              style: pw.TextStyle(font: fontRegular, fontSize: 9),
                            ),
                            pw.Directionality(
                              textDirection: pw.TextDirection.ltr,
                              child: pw.Text(
                                receipt.password!,
                                style: pw.TextStyle(
                                  font: fontBold,
                                  fontSize: paperWidthMm >= 80 ? 14 : 12,
                                  fontWeight: pw.FontWeight.bold,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),

                pw.SizedBox(height: 6),

                // QR Code
                pw.BarcodeWidget(
                  barcode: pw.Barcode.qrCode(),
                  data: receipt.loginUrl,
                  width: paperWidthMm >= 80 ? 95 : 78,
                  height: paperWidthMm >= 80 ? 95 : 78,
                  drawText: false,
                ),
                pw.SizedBox(height: 3),
                pw.Text(
                  'امسح الرمز للدخول الفوري للشبكة',
                  style: pw.TextStyle(font: fontRegular, fontSize: 7.5, color: PdfColors.grey700),
                ),

                pw.SizedBox(height: 5),
                pw.Divider(thickness: 0.5, color: PdfColors.grey600),
                pw.SizedBox(height: 2),
                pw.Text(
                  'شكراً لاختياركم شبكتنا! نتمنى لكم تصفحاً ممتعاً',
                  style: pw.TextStyle(font: fontRegular, fontSize: 8),
                  textAlign: pw.TextAlign.center,
                ),
                if (receipt.tenantPhone != null && receipt.tenantPhone!.isNotEmpty)
                  pw.Text(
                    'خدمة العملاء: ${receipt.tenantPhone}',
                    style: pw.TextStyle(font: fontRegular, fontSize: 7.5, color: PdfColors.grey800),
                  ),
                pw.SizedBox(height: 6),
              ],
            ),
          );
        },
      ),
    );

    return pdf.save();
  }

  static pw.Widget _buildPdfRow(
    String label,
    String value,
    pw.Font? fontBold,
    pw.Font? fontRegular, {
    bool isHighlight = false,
  }) {
    return pw.Padding(
      padding: const pw.EdgeInsets.symmetric(vertical: 1.2),
      child: pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          pw.Text(
            label,
            style: pw.TextStyle(
              font: fontRegular,
              fontSize: 8.5,
              color: PdfColors.grey800,
            ),
          ),
          pw.Text(
            value,
            style: pw.TextStyle(
              font: fontBold,
              fontSize: isHighlight ? 10.5 : 8.5,
              fontWeight: isHighlight ? pw.FontWeight.bold : pw.FontWeight.normal,
            ),
          ),
        ],
      ),
    );
  }

  /// Sends thermal receipt to device default/selected printer via system layout
  static Future<bool> printReceiptViaSystem(
    SaleReceiptModel receipt, {
    int paperWidthMm = 58,
  }) async {
    final pdfBytes = await generateReceiptPdf(receipt, paperWidthMm: paperWidthMm);
    return Printing.layoutPdf(
      onLayout: (PdfPageFormat format) async => pdfBytes,
      name: 'Receipt_${receipt.invoiceNumber}',
    );
  }

  /// Saves receipt PDF to device documents folder and returns file path
  static Future<String> saveReceiptPdfFile(SaleReceiptModel receipt) async {
    final pdfBytes = await generateReceiptPdf(receipt);
    final dir = await getApplicationDocumentsDirectory();
    final file = File('${dir.path}/receipt_${receipt.invoiceNumber}.pdf');
    await file.writeAsBytes(pdfBytes, flush: true);
    return file.path;
  }

  /// Shares receipt PDF or text to customer via WhatsApp or system share dialog
  static Future<void> shareReceipt(
    SaleReceiptModel receipt, {
    bool asPdf = false,
  }) async {
    if (asPdf) {
      final filePath = await saveReceiptPdfFile(receipt);
      await Share.shareXFiles(
        [XFile(filePath)],
        text: 'إيصال شحن إنترنت - ${receipt.profileName}',
      );
    } else {
      final text = '''
🌐 *${receipt.tenantName}*
🧾 *إيصال شحن بطاقة إنترنت*
----------------------------
• رقم الفاتورة: ${receipt.invoiceNumber}
• الباقة: ${receipt.profileName}
• الإجمالي: ${receipt.amount.toStringAsFixed(0)} ${receipt.currency}
• طريقة الدفع: ${formatPaymentMethod(receipt.paymentMethod)}
• التاريخ: ${intl.DateFormat('yyyy-MM-dd HH:mm').format(receipt.soldAt)}
----------------------------
🔑 *بيانات الدخول:*
• المستخدم: ${receipt.username}
• كلمة المرور: ${receipt.password ?? receipt.username}
• الرقم التسلسلي: ${receipt.serialNumber}
----------------------------
🌐 رابط تسجيل الدخول المباشر:
${receipt.loginUrl}

نتمنى لكم تصفحاً ممتعاً!
''';
      await Share.share(text);
    }
  }

  /// Sends raw ESC/POS bytes to network/Wi-Fi thermal printer (Port 9100)
  static Future<PrinterResult> printOverNetwork({
    required List<int> bytes,
    String? host,
    int? port,
  }) async {
    final targetHost = host ?? await getSavedPrinterIp();
    final targetPort = port ?? await getSavedPrinterPort();

    Socket? socket;
    try {
      socket = await Socket.connect(
        targetHost,
        targetPort,
        timeout: const Duration(seconds: 4),
      );

      socket.add(bytes);
      await socket.flush();
      await socket.close();

      return PrinterResult.success(
        'تم إرسال أمر الطباعة بنجاح إلى $targetHost:$targetPort',
      );
    } on SocketException catch (e) {
      return PrinterResult.failure(
        'تعذر الاتصال بالطابعة الحرارية ($targetHost:$targetPort): ${e.osError?.message ?? e.message}. تأكد من عنوان IP وتشغيل الطابعة.',
      );
    } catch (e) {
      return PrinterResult.failure('خطأ أثناء الطباعة: $e');
    } finally {
      socket?.destroy();
    }
  }

  /// Generates ESC/POS byte sequence for Sale Receipt
  static List<int> buildReceiptEscPos(SaleReceiptModel receipt) {
    final bytes = BytesBuilder();

    // Init
    bytes.add(cmdInit);

    // Center header
    bytes.add(cmdAlignCenter);
    bytes.add(cmdDoubleSize);
    bytes.add(cmdBoldOn);
    bytes.add(utf8.encode('${receipt.tenantName}\n'));
    bytes.add(cmdNormalSize);
    bytes.add(cmdBoldOff);
    bytes.add(utf8.encode('Internet Card Receipt\n'));
    bytes.add(utf8.encode('--------------------------------\n'));

    // Left aligned receipt body
    bytes.add(cmdAlignLeft);
    bytes.add(utf8.encode('Invoice : ${receipt.invoiceNumber}\n'));
    bytes.add(utf8.encode('Date    : ${receipt.soldAt.toIso8601String().substring(0, 16)}\n'));
    bytes.add(utf8.encode('Profile : ${receipt.profileName}\n'));
    if (receipt.quantity > 1) {
      bytes.add(utf8.encode('Qty     : ${receipt.quantity}\n'));
    }
    bytes.add(utf8.encode('Price   : ${receipt.amount.toStringAsFixed(0)} ${receipt.currency}\n'));
    bytes.add(utf8.encode('Method  : ${receipt.paymentMethod}\n'));
    bytes.add(utf8.encode('Cashier : ${receipt.cashierName}\n'));
    if (receipt.customerPhone != null && receipt.customerPhone!.isNotEmpty) {
      bytes.add(utf8.encode('Phone   : ${receipt.customerPhone}\n'));
    }
    bytes.add(utf8.encode('--------------------------------\n'));

    // Card details
    bytes.add(cmdAlignCenter);
    bytes.add(cmdBoldOn);
    bytes.add(utf8.encode('--- CARD CREDENTIALS ---\n'));
    bytes.add(cmdBoldOff);
    bytes.add(cmdAlignLeft);
    bytes.add(utf8.encode('Serial  : ${receipt.serialNumber}\n'));
    bytes.add(cmdBoldOn);
    bytes.add(utf8.encode('User    : ${receipt.username}\n'));
    if (receipt.password != null && receipt.password!.isNotEmpty) {
      bytes.add(utf8.encode('Password: ${receipt.password}\n'));
    }
    bytes.add(cmdBoldOff);
    bytes.add(utf8.encode('--------------------------------\n'));

    // Footer
    bytes.add(cmdAlignCenter);
    bytes.add(utf8.encode('Login: ${receipt.loginUrl}\n'));
    bytes.add(utf8.encode('Thank you for choosing us!\n\n\n\n'));

    // Cut
    bytes.add(cmdCut);

    return bytes.toBytes();
  }

  /// Generates ESC/POS byte sequence for Shift Closing Summary
  static List<int> buildShiftSummaryEscPos({
    required double totalRevenue,
    required int totalSalesCount,
    required String currency,
    required String cashierName,
  }) {
    final bytes = BytesBuilder();

    bytes.add(cmdInit);
    bytes.add(cmdAlignCenter);
    bytes.add(cmdDoubleSize);
    bytes.add(cmdBoldOn);
    bytes.add(utf8.encode('SHIFT SUMMARY REPORT\n'));
    bytes.add(cmdNormalSize);
    bytes.add(cmdBoldOff);
    bytes.add(utf8.encode('--------------------------------\n'));

    bytes.add(cmdAlignLeft);
    bytes.add(utf8.encode('Cashier   : $cashierName\n'));
    bytes.add(utf8.encode('Date/Time : ${DateTime.now().toIso8601String().substring(0, 16)}\n'));
    bytes.add(utf8.encode('Cards Sold: $totalSalesCount\n'));
    bytes.add(cmdBoldOn);
    bytes.add(utf8.encode('Total Rev : ${totalRevenue.toStringAsFixed(0)} $currency\n'));
    bytes.add(cmdBoldOff);
    bytes.add(utf8.encode('--------------------------------\n'));

    bytes.add(cmdAlignCenter);
    bytes.add(utf8.encode('End of Shift Report\n\n\n\n'));
    bytes.add(cmdCut);

    return bytes.toBytes();
  }

  /// Generates a comprehensive Arabic PDF document for Cashier Shift Closing
  static Future<Uint8List> generateShiftSummaryPdf({
    required String tenantName,
    required String cashierName,
    required DateTime periodStart,
    required DateTime periodEnd,
    required double cashInDrawer,
    required int totalSalesCount,
    required double cashAmount,
    required double bankakAmount,
    required double fawryAmount,
    required double cardAmount,
    required double totalRevenue,
    required String currency,
    required List<ShiftTransactionItem> recentTransactions,
    bool isClosed = false,
    DateTime? closedAt,
  }) async {
    final pdf = pw.Document(
      title: 'تقرير إغلاق وردية - $cashierName',
      author: tenantName,
    );

    final fontBundle = await PdfFontService.loadArabicFonts();
    final fontRegular = fontBundle.regular;
    final fontBold = fontBundle.bold;

    final dateFormat = intl.DateFormat('yyyy-MM-dd HH:mm');

    pdf.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(24),
        theme: pw.ThemeData.withFont(
          base: fontRegular,
          bold: fontBold,
        ),
        build: (pw.Context context) {
          return pw.Directionality(
            textDirection: pw.TextDirection.rtl,
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.stretch,
              children: [
                // Header
                pw.Container(
                  padding: const pw.EdgeInsets.all(12),
                  decoration: pw.BoxDecoration(
                    color: PdfColors.blueGrey900,
                    borderRadius: const pw.BorderRadius.all(pw.Radius.circular(8)),
                  ),
                  child: pw.Row(
                    mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                    children: [
                      pw.Column(
                        crossAxisAlignment: pw.CrossAxisAlignment.start,
                        children: [
                          pw.Text(
                            tenantName,
                            style: pw.TextStyle(
                              font: fontBold,
                              fontSize: 16,
                              fontWeight: pw.FontWeight.bold,
                              color: PdfColors.white,
                            ),
                          ),
                          pw.SizedBox(height: 3),
                          pw.Text(
                            'تقرير إغلاق وردية الكاشير المالية',
                            style: pw.TextStyle(
                              font: fontRegular,
                              fontSize: 12,
                              color: PdfColors.teal100,
                            ),
                          ),
                        ],
                      ),
                      pw.Column(
                        crossAxisAlignment: pw.CrossAxisAlignment.end,
                        children: [
                          pw.Text(
                            isClosed ? 'الحالة: مغلقة ومعتمدة' : 'الحالة: وردية جارية',
                            style: pw.TextStyle(
                              font: fontBold,
                              fontSize: 11,
                              color: isClosed ? PdfColors.green300 : PdfColors.amber300,
                            ),
                          ),
                          pw.Text(
                            'تاريخ التقرير: ${dateFormat.format(DateTime.now())}',
                            style: pw.TextStyle(
                              font: fontRegular,
                              fontSize: 9,
                              color: PdfColors.grey300,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                pw.SizedBox(height: 14),

                // Cashier & Time Info Grid
                pw.Container(
                  padding: const pw.EdgeInsets.all(10),
                  decoration: pw.BoxDecoration(
                    border: pw.Border.all(color: PdfColors.grey300),
                    borderRadius: const pw.BorderRadius.all(pw.Radius.circular(6)),
                  ),
                  child: pw.Row(
                    mainAxisAlignment: pw.MainAxisAlignment.spaceAround,
                    children: [
                      pw.Column(
                        crossAxisAlignment: pw.CrossAxisAlignment.start,
                        children: [
                          pw.Text('الكاشير المسؤول:', style: pw.TextStyle(font: fontBold, fontSize: 10, color: PdfColors.grey700)),
                          pw.Text(cashierName, style: pw.TextStyle(font: fontBold, fontSize: 11)),
                        ],
                      ),
                      pw.Column(
                        crossAxisAlignment: pw.CrossAxisAlignment.start,
                        children: [
                          pw.Text('بداية الوردية:', style: pw.TextStyle(font: fontBold, fontSize: 10, color: PdfColors.grey700)),
                          pw.Text(dateFormat.format(periodStart), style: pw.TextStyle(font: fontRegular, fontSize: 10)),
                        ],
                      ),
                      pw.Column(
                        crossAxisAlignment: pw.CrossAxisAlignment.start,
                        children: [
                          pw.Text('وقت الإغلاق / التقرير:', style: pw.TextStyle(font: fontBold, fontSize: 10, color: PdfColors.grey700)),
                          pw.Text(dateFormat.format(closedAt ?? periodEnd), style: pw.TextStyle(font: fontRegular, fontSize: 10)),
                        ],
                      ),
                    ],
                  ),
                ),
                pw.SizedBox(height: 14),

                // Key Financial Metrics (Three KPI boxes)
                pw.Row(
                  children: [
                    pw.Expanded(
                      child: pw.Container(
                        padding: const pw.EdgeInsets.all(10),
                        decoration: pw.BoxDecoration(
                          color: PdfColors.teal50,
                          border: pw.Border.all(color: PdfColors.teal700, width: 1),
                          borderRadius: const pw.BorderRadius.all(pw.Radius.circular(6)),
                        ),
                        child: pw.Column(
                          crossAxisAlignment: pw.CrossAxisAlignment.center,
                          children: [
                            pw.Text('النقدية في الدرج (Cash)', style: pw.TextStyle(font: fontBold, fontSize: 10, color: PdfColors.teal900)),
                            pw.SizedBox(height: 4),
                            pw.Text(
                              '${cashInDrawer.toStringAsFixed(0)} $currency',
                              style: pw.TextStyle(font: fontBold, fontSize: 15, color: PdfColors.teal900),
                            ),
                          ],
                        ),
                      ),
                    ),
                    pw.SizedBox(width: 8),
                    pw.Expanded(
                      child: pw.Container(
                        padding: const pw.EdgeInsets.all(10),
                        decoration: pw.BoxDecoration(
                          color: PdfColors.amber50,
                          border: pw.Border.all(color: PdfColors.amber800, width: 1),
                          borderRadius: const pw.BorderRadius.all(pw.Radius.circular(6)),
                        ),
                        child: pw.Column(
                          crossAxisAlignment: pw.CrossAxisAlignment.center,
                          children: [
                            pw.Text('الكروت المباعة', style: pw.TextStyle(font: fontBold, fontSize: 10, color: PdfColors.amber900)),
                            pw.SizedBox(height: 4),
                            pw.Text(
                              '$totalSalesCount كرت',
                              style: pw.TextStyle(font: fontBold, fontSize: 15, color: PdfColors.amber900),
                            ),
                          ],
                        ),
                      ),
                    ),
                    pw.SizedBox(width: 8),
                    pw.Expanded(
                      child: pw.Container(
                        padding: const pw.EdgeInsets.all(10),
                        decoration: pw.BoxDecoration(
                          color: PdfColors.blue50,
                          border: pw.Border.all(color: PdfColors.blue800, width: 1),
                          borderRadius: const pw.BorderRadius.all(pw.Radius.circular(6)),
                        ),
                        child: pw.Column(
                          crossAxisAlignment: pw.CrossAxisAlignment.center,
                          children: [
                            pw.Text('إجمالي المبيعات', style: pw.TextStyle(font: fontBold, fontSize: 10, color: PdfColors.blue900)),
                            pw.SizedBox(height: 4),
                            pw.Text(
                              '${totalRevenue.toStringAsFixed(0)} $currency',
                              style: pw.TextStyle(font: fontBold, fontSize: 15, color: PdfColors.blue900),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
                pw.SizedBox(height: 14),

                // Payment Breakdown Table
                pw.Text('توزيع الإيراد حسب طريقة الدفع:', style: pw.TextStyle(font: fontBold, fontSize: 11)),
                pw.SizedBox(height: 6),
                pw.Table(
                  border: pw.TableBorder.all(color: PdfColors.grey300, width: 0.5),
                  columnWidths: {
                    0: const pw.FlexColumnWidth(2),
                    1: const pw.FlexColumnWidth(1.5),
                    2: const pw.FlexColumnWidth(1.5),
                  },
                  children: [
                    pw.TableRow(
                      decoration: const pw.BoxDecoration(color: PdfColors.grey100),
                      children: [
                        pw.Padding(
                          padding: const pw.EdgeInsets.all(6),
                          child: pw.Text('طريقة الدفع', style: pw.TextStyle(font: fontBold, fontSize: 10)),
                        ),
                        pw.Padding(
                          padding: const pw.EdgeInsets.all(6),
                          child: pw.Text('المبلغ المسجل', style: pw.TextStyle(font: fontBold, fontSize: 10)),
                        ),
                        pw.Padding(
                          padding: const pw.EdgeInsets.all(6),
                          child: pw.Text('النسبة من الإجمالي', style: pw.TextStyle(font: fontBold, fontSize: 10)),
                        ),
                      ],
                    ),
                    pw.TableRow(
                      children: [
                        pw.Padding(
                          padding: const pw.EdgeInsets.all(6),
                          child: pw.Text('كاش (نقداً بالدرج)', style: pw.TextStyle(font: fontRegular, fontSize: 10)),
                        ),
                        pw.Padding(
                          padding: const pw.EdgeInsets.all(6),
                          child: pw.Text('${cashAmount.toStringAsFixed(0)} $currency', style: pw.TextStyle(font: fontBold, fontSize: 10)),
                        ),
                        pw.Padding(
                          padding: const pw.EdgeInsets.all(6),
                          child: pw.Text(
                            totalRevenue > 0 ? '${((cashAmount / totalRevenue) * 100).toStringAsFixed(1)}%' : '0%',
                            style: pw.TextStyle(font: fontRegular, fontSize: 10),
                          ),
                        ),
                      ],
                    ),
                    pw.TableRow(
                      children: [
                        pw.Padding(
                          padding: const pw.EdgeInsets.all(6),
                          child: pw.Text('بنكك (محفظة هاتف)', style: pw.TextStyle(font: fontRegular, fontSize: 10)),
                        ),
                        pw.Padding(
                          padding: const pw.EdgeInsets.all(6),
                          child: pw.Text('${bankakAmount.toStringAsFixed(0)} $currency', style: pw.TextStyle(font: fontBold, fontSize: 10)),
                        ),
                        pw.Padding(
                          padding: const pw.EdgeInsets.all(6),
                          child: pw.Text(
                            totalRevenue > 0 ? '${((bankakAmount / totalRevenue) * 100).toStringAsFixed(1)}%' : '0%',
                            style: pw.TextStyle(font: fontRegular, fontSize: 10),
                          ),
                        ),
                      ],
                    ),
                    pw.TableRow(
                      children: [
                        pw.Padding(
                          padding: const pw.EdgeInsets.all(6),
                          child: pw.Text('أوكاش / فوري (تحويل)', style: pw.TextStyle(font: fontRegular, fontSize: 10)),
                        ),
                        pw.Padding(
                          padding: const pw.EdgeInsets.all(6),
                          child: pw.Text('${fawryAmount.toStringAsFixed(0)} $currency', style: pw.TextStyle(font: fontBold, fontSize: 10)),
                        ),
                        pw.Padding(
                          padding: const pw.EdgeInsets.all(6),
                          child: pw.Text(
                            totalRevenue > 0 ? '${((fawryAmount / totalRevenue) * 100).toStringAsFixed(1)}%' : '0%',
                            style: pw.TextStyle(font: fontRegular, fontSize: 10),
                          ),
                        ),
                      ],
                    ),
                    if (cardAmount > 0)
                      pw.TableRow(
                        children: [
                          pw.Padding(
                            padding: const pw.EdgeInsets.all(6),
                            child: pw.Text('بطاقات دفع بنكية', style: pw.TextStyle(font: fontRegular, fontSize: 10)),
                          ),
                          pw.Padding(
                            padding: const pw.EdgeInsets.all(6),
                            child: pw.Text('${cardAmount.toStringAsFixed(0)} $currency', style: pw.TextStyle(font: fontBold, fontSize: 10)),
                          ),
                          pw.Padding(
                            padding: const pw.EdgeInsets.all(6),
                            child: pw.Text(
                              totalRevenue > 0 ? '${((cardAmount / totalRevenue) * 100).toStringAsFixed(1)}%' : '0%',
                              style: pw.TextStyle(font: fontRegular, fontSize: 10),
                            ),
                          ),
                        ],
                      ),
                  ],
                ),
                pw.SizedBox(height: 14),

                // Recent Shift Sales Table
                if (recentTransactions.isNotEmpty) ...[
                  pw.Text('سجل مبيعات الوردية (أحدث العمليات):', style: pw.TextStyle(font: fontBold, fontSize: 11)),
                  pw.SizedBox(height: 6),
                  pw.Table(
                    border: pw.TableBorder.all(color: PdfColors.grey300, width: 0.5),
                    columnWidths: {
                      0: const pw.FlexColumnWidth(2),
                      1: const pw.FlexColumnWidth(1.5),
                      2: const pw.FlexColumnWidth(1.2),
                      3: const pw.FlexColumnWidth(1.2),
                      4: const pw.FlexColumnWidth(1.5),
                    },
                    children: [
                      pw.TableRow(
                        decoration: const pw.BoxDecoration(color: PdfColors.grey100),
                        children: [
                          pw.Padding(
                            padding: const pw.EdgeInsets.all(5),
                            child: pw.Text('رقم الفاتورة', style: pw.TextStyle(font: fontBold, fontSize: 9)),
                          ),
                          pw.Padding(
                            padding: const pw.EdgeInsets.all(5),
                            child: pw.Text('الباقة', style: pw.TextStyle(font: fontBold, fontSize: 9)),
                          ),
                          pw.Padding(
                            padding: const pw.EdgeInsets.all(5),
                            child: pw.Text('المبلغ', style: pw.TextStyle(font: fontBold, fontSize: 9)),
                          ),
                          pw.Padding(
                            padding: const pw.EdgeInsets.all(5),
                            child: pw.Text('طريقة الدفع', style: pw.TextStyle(font: fontBold, fontSize: 9)),
                          ),
                          pw.Padding(
                            padding: const pw.EdgeInsets.all(5),
                            child: pw.Text('الوقت', style: pw.TextStyle(font: fontBold, fontSize: 9)),
                          ),
                        ],
                      ),
                      ...recentTransactions.take(15).map((tx) {
                        return pw.TableRow(
                          children: [
                            pw.Padding(
                              padding: const pw.EdgeInsets.all(5),
                              child: pw.Text(tx.invoiceNumber, style: pw.TextStyle(font: fontRegular, fontSize: 8.5)),
                            ),
                            pw.Padding(
                              padding: const pw.EdgeInsets.all(5),
                              child: pw.Text(tx.profileName, style: pw.TextStyle(font: fontRegular, fontSize: 8.5)),
                            ),
                            pw.Padding(
                              padding: const pw.EdgeInsets.all(5),
                              child: pw.Text('${tx.amount.toStringAsFixed(0)} $currency', style: pw.TextStyle(font: fontBold, fontSize: 8.5)),
                            ),
                            pw.Padding(
                              padding: const pw.EdgeInsets.all(5),
                              child: pw.Text(formatPaymentMethod(tx.paymentMethod), style: pw.TextStyle(font: fontRegular, fontSize: 8.5)),
                            ),
                            pw.Padding(
                              padding: const pw.EdgeInsets.all(5),
                              child: pw.Text(dateFormat.format(tx.createdAt), style: pw.TextStyle(font: fontRegular, fontSize: 8)),
                            ),
                          ],
                        );
                      }),
                    ],
                  ),
                ],

                pw.Spacer(),

                // Signature section
                pw.Container(
                  padding: const pw.EdgeInsets.only(top: 10),
                  child: pw.Row(
                    mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                    children: [
                      pw.Column(
                        crossAxisAlignment: pw.CrossAxisAlignment.center,
                        children: [
                          pw.Text('توقيع الكاشير المسلم:', style: pw.TextStyle(font: fontBold, fontSize: 9)),
                          pw.SizedBox(height: 25),
                          pw.Text('................................', style: pw.TextStyle(font: fontRegular, fontSize: 9)),
                        ],
                      ),
                      pw.Column(
                        crossAxisAlignment: pw.CrossAxisAlignment.center,
                        children: [
                          pw.Text('توقيع المشرف المستلم:', style: pw.TextStyle(font: fontBold, fontSize: 9)),
                          pw.SizedBox(height: 25),
                          pw.Text('................................', style: pw.TextStyle(font: fontRegular, fontSize: 9)),
                        ],
                      ),
                    ],
                  ),
                ),
                pw.SizedBox(height: 6),
                pw.Center(
                  child: pw.Text(
                    'تم إنشاء وتوثيق هذا التقرير آلياً عبر نظام ميكروتك السحابي للأوفلاين والـ POS',
                    style: pw.TextStyle(font: fontRegular, fontSize: 8, color: PdfColors.grey600),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );

    return pdf.save();
  }
}
