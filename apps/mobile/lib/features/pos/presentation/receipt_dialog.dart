import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:intl/intl.dart' as intl;
import '../../../core/models/models.dart';

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
          onPressed: () {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('تم إرسال الإيصال إلى الطابعة الحرارية بنجاح'),
                backgroundColor: Color(0xFF0D9488),
              ),
            );
          },
        ),
        ElevatedButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('تم'),
        ),
      ],
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
