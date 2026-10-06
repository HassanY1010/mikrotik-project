import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/models.dart';

class PrinterResult {
  final bool isSuccess;
  final String message;

  const PrinterResult({required this.isSuccess, required this.message});

  factory PrinterResult.success([String message = 'تمت الطباعة بنجاح']) {
    return PrinterResult(isSuccess: true, message: message);
  }

  factory PrinterResult.failure(String message) {
    return PrinterResult(isSuccess: false, message: message);
  }
}

class ThermalPrinterService {
  static const String _prefPrinterIpKey = 'thermal_printer_ip';
  static const String _prefPrinterPortKey = 'thermal_printer_port';
  static const String defaultIp = '192.168.1.100';
  static const int defaultPort = 9100;

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

  static Future<void> savePrinterConfig(String ip, int port) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefPrinterIpKey, ip.trim());
    await prefs.setInt(_prefPrinterPortKey, port);
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
    bytes.add(utf8.encode('MikroTik HotSpot\n'));
    bytes.add(cmdNormalSize);
    bytes.add(cmdBoldOff);
    bytes.add(utf8.encode('Internet Card Receipt\n'));
    bytes.add(utf8.encode('--------------------------------\n'));

    // Left aligned receipt body
    bytes.add(cmdAlignLeft);
    bytes.add(utf8.encode('Invoice : ${receipt.invoiceNumber}\n'));
    bytes.add(utf8.encode('Date    : ${receipt.soldAt.toIso8601String().substring(0, 16)}\n'));
    bytes.add(utf8.encode('Profile : ${receipt.profileName}\n'));
    bytes.add(utf8.encode('Price   : ${receipt.amount.toStringAsFixed(0)} ${receipt.currency}\n'));
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
}
