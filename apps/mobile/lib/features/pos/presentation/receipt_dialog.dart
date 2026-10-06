import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:intl/intl.dart' as intl;
import '../../../core/models/models.dart';
import '../../../core/services/thermal_printer_service.dart';

class ReceiptDialog extends StatelessWidget {
  final SaleReceiptModel receipt;

  const ReceiptDialog({super.key, required this.receipt});

  static Future<void> show(BuildContext context, SaleReceiptModel receipt) {
    return showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => ReceiptDialog(receipt: receipt),
    );
  }

  @override
  Widget build(BuildContext context) {
    final dateFormat = intl.DateFormat('yyyy-MM-dd HH:mm');

    return AlertDialog(
      title: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          const Text('إيصال البيع الحراري', style: TextStyle(fontSize: 16)),
          if (receipt.isOffline)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: Colors.amber.shade700,
                borderRadius: BorderRadius.circular(6),
              ),
              child: const Text('دون اتصال', style: TextStyle(fontSize: 11, color: Colors.white)),
            ),
        ],
      ),
      content: SingleChildScrollView(
        child: Container(
          width: 320,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Colors.grey.shade300),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.05),
                blurRadius: 10,
                spreadRadius: 2,
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'شبكة ميكروتيك هوتسبوت',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Colors.black87,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'إيصال شحن بطاقة إنترنت',
                style: TextStyle(fontSize: 12, color: Colors.black54),
              ),
              const Divider(color: Colors.black45, thickness: 1),
              const SizedBox(height: 8),

              // Details table
              _receiptRow('رقم الفاتورة:', receipt.invoiceNumber),
              _receiptRow('التاريخ:', dateFormat.format(receipt.soldAt)),
              _receiptRow('الباقة:', receipt.profileName),
              _receiptRow('السعر:', '${receipt.amount.toStringAsFixed(0)} ${receipt.currency}'),
              _receiptRow('طريقة الدفع:', receipt.paymentMethod == 'CASH' ? 'نقداً' : receipt.paymentMethod),
              _receiptRow('الكاشير:', receipt.cashierName),
              if (receipt.customerPhone != null)
                _receiptRow('العميل:', receipt.customerPhone!),

              const Divider(color: Colors.black45, thickness: 1),
              const SizedBox(height: 8),

              // Card credentials box
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.grey.shade400),
                ),
                child: Column(
                  children: [
                    Text(
                      'الرقم التسلسلي: ${receipt.serialNumber}',
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.black87),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'اسم المستخدم: ${receipt.username}',
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.blueAccent),
                    ),
                    if (receipt.password != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        'كلمة المرور: ${receipt.password}',
                        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.redAccent),
                      ),
                    ],
                  ],
                ),
              ),

              const SizedBox(height: 12),

              // QR Code
              QrImageView(
                data: receipt.loginUrl,
                version: QrVersions.auto,
                size: 140.0,
                backgroundColor: Colors.white,
              ),
              const SizedBox(height: 4),
              const Text(
                'امسح الرمز لتسجيل الدخول الفوري',
                style: TextStyle(fontSize: 10, color: Colors.black54),
              ),

              const Divider(color: Colors.black45, thickness: 1),
              const SizedBox(height: 4),
              const Text(
                'شكراً لزيارتكم! نتمنى لكم تصفحاً ممتعاً',
                style: TextStyle(fontSize: 11, fontStyle: FontStyle.italic, color: Colors.black87),
              ),
            ],
          ),
        ),
      ),
      actions: [
        OutlinedButton.icon(
          icon: const Icon(Icons.print),
          label: const Text('طباعة حرارية'),
          onPressed: () => _handleThermalPrint(context),
        ),
        ElevatedButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('تم'),
        ),
      ],
    );
  }

  Future<void> _handleThermalPrint(BuildContext context) async {
    final ipController = TextEditingController(text: await ThermalPrinterService.getSavedPrinterIp());
    final portController = TextEditingController(text: (await ThermalPrinterService.getSavedPrinterPort()).toString());

    if (!context.mounted) return;

    final shouldPrint = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('إعدادات الطابعة الحرارية (ESC/POS)', style: TextStyle(fontSize: 15)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'أدخل عنوان IP لطابعة الإيصالات الحرارية المتصلة بالشبكة (المنفذ الافتراضي 9100):',
              style: TextStyle(fontSize: 12, color: Colors.black87),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: ipController,
              decoration: const InputDecoration(
                labelText: 'عنوان IP للطابعة',
                hintText: 'مثال: 192.168.1.100',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: portController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'المنفذ (Port)',
                hintText: '9100',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('إلغاء'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF0D9488)),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('طباعة الآن', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (shouldPrint != true || !context.mounted) return;

    final ip = ipController.text.trim();
    final port = int.tryParse(portController.text.trim()) ?? 9100;
    await ThermalPrinterService.savePrinterConfig(ip, port);

    final bytes = ThermalPrinterService.buildReceiptEscPos(receipt);
    final result = await ThermalPrinterService.printOverNetwork(
      bytes: bytes,
      host: ip,
      port: port,
    );

    if (!context.mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(result.message),
        backgroundColor: result.isSuccess ? const Color(0xFF0D9488) : Colors.redAccent,
        duration: const Duration(seconds: 4),
      ),
    );
  }

  Widget _receiptRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(fontSize: 12, color: Colors.black54)),
          Text(
            value,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.black87),
          ),
        ],
      ),
    );
  }
}
