import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:intl/intl.dart' as intl;
import '../../../core/models/models.dart';
import '../../../core/services/thermal_printer_service.dart';

class ReceiptDialog extends StatefulWidget {
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
  State<ReceiptDialog> createState() => _ReceiptDialogState();
}

class _ReceiptDialogState extends State<ReceiptDialog> {
  bool _isPrinting = false;
  bool _isExporting = false;

  @override
  Widget build(BuildContext context) {
    final receipt = widget.receipt;
    final dateFormat = intl.DateFormat('yyyy-MM-dd HH:mm');

    return AlertDialog(
      titlePadding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16),
      actionsPadding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      title: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              const Icon(Icons.receipt_long, color: Color(0xFF0D9488), size: 22),
              const SizedBox(width: 8),
              const Text('إيصال البيع الحراري', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            ],
          ),
          if (receipt.isOffline)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: Colors.amber.shade800,
                borderRadius: BorderRadius.circular(6),
              ),
              child: const Text('دون اتصال', style: TextStyle(fontSize: 11, color: Colors.white, fontWeight: FontWeight.bold)),
            ),
        ],
      ),
      content: SizedBox(
        width: 340,
        child: SingleChildScrollView(
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.grey.shade300),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.06),
                  blurRadius: 10,
                  spreadRadius: 2,
                ),
              ],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Store / Network Name
                Text(
                  receipt.tenantName,
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.bold,
                    color: Colors.black87,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 3),
                const Text(
                  'إيصال شحن بطاقة هوتسبوت',
                  style: TextStyle(fontSize: 12, color: Colors.black54),
                ),
                const Divider(color: Colors.black54, thickness: 1, height: 16),

                // Details table
                _receiptRow('رقم الفاتورة:', receipt.invoiceNumber),
                _receiptRow('التاريخ والوقت:', dateFormat.format(receipt.soldAt)),
                _receiptRow('الباقة:', receipt.profileName),
                if (receipt.quantity > 1)
                  _receiptRow('الكمية:', '${receipt.quantity}'),
                _receiptRow(
                  'المبلغ الإجمالي:',
                  '${receipt.amount.toStringAsFixed(0)} ${receipt.currency}',
                  isHighlight: true,
                ),
                _receiptRow('طريقة الدفع:', ThermalPrinterService.formatPaymentMethod(receipt.paymentMethod)),
                _receiptRow('الكاشير:', receipt.cashierName),
                if (receipt.customerPhone != null && receipt.customerPhone!.isNotEmpty)
                  _receiptRow('هاتف العميل:', receipt.customerPhone!),
                if (receipt.customerName != null && receipt.customerName!.isNotEmpty)
                  _receiptRow('اسم العميل:', receipt.customerName!),

                const Divider(color: Colors.black54, thickness: 1, height: 16),

                // Card credentials box
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFFCBD5E1)),
                  ),
                  child: Column(
                    children: [
                      Text(
                        'الرقم التسلسلي: ${receipt.serialNumber}',
                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.black54),
                      ),
                      const SizedBox(height: 6),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Text('المستخدم: ', style: TextStyle(fontSize: 13, color: Colors.black87)),
                          SelectableText(
                            receipt.username,
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: Color(0xFF0284C7)),
                          ),
                        ],
                      ),
                      if (receipt.password != null && receipt.password!.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Text('كلمة المرور: ', style: TextStyle(fontSize: 13, color: Colors.black87)),
                            SelectableText(
                              receipt.password!,
                              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: Color(0xFFE11D48)),
                            ),
                          ],
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
                  size: 130.0,
                  backgroundColor: Colors.white,
                ),
                const SizedBox(height: 4),
                const Text(
                  'امسح الرمز لتسجيل الدخول الفوري',
                  style: TextStyle(fontSize: 10, color: Colors.black54),
                ),

                const Divider(color: Colors.black54, thickness: 0.8, height: 16),
                const Text(
                  'شكراً لزيارتكم! نتمنى لكم تصفحاً ممتعاً',
                  style: TextStyle(fontSize: 11, fontStyle: FontStyle.italic, color: Colors.black87),
                  textAlign: TextAlign.center,
                ),
                if (receipt.tenantPhone != null && receipt.tenantPhone!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      'خدمة المشتركين: ${receipt.tenantPhone}',
                      style: const TextStyle(fontSize: 10, color: Colors.black54),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
      actions: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          alignment: WrapAlignment.end,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            // 1. Share button
            IconButton(
              icon: const Icon(Icons.share_outlined, size: 20),
              tooltip: 'مشاركة الإيصال',
              onPressed: _handleShare,
            ),

            // 2. Export PDF button
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              ),
              icon: _isExporting
                  ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.picture_as_pdf_outlined, size: 16),
              label: const Text('تصدير PDF', style: TextStyle(fontSize: 12)),
              onPressed: _isExporting ? null : _handleExportPdf,
            ),

            // 3. Re-print / Print Again button
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              ),
              icon: const Icon(Icons.replay, size: 16),
              label: const Text('طباعة مرة أخرى', style: TextStyle(fontSize: 12)),
              onPressed: () => _handlePrint(isReprint: true),
            ),

            // 4. Primary Thermal Print button
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF0D9488),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              ),
              icon: _isPrinting
                  ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.print, size: 16),
              label: const Text('طباعة حرارية', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
              onPressed: _isPrinting ? null : () => _handlePrint(),
            ),

            // 5. Return to POS
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('العودة لنقطة البيع', style: TextStyle(fontSize: 12)),
            ),
          ],
        ),
      ],
    );
  }

  Future<void> _handlePrint({bool isReprint = false}) async {
    setState(() => _isPrinting = true);
    try {
      // Show printing options dialog (System print or Network ESC/POS socket)
      final choice = await showDialog<String>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(isReprint ? 'إعادة طباعة الإيصال' : 'خيارات الطباعة الحرارية', style: const TextStyle(fontSize: 15)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.print, color: Color(0xFF0D9488)),
                title: const Text('طباعة النظام (بلوتوث / USB / واي فاي)'),
                subtitle: const Text('تحديد الطابعة عبر نافذة النظام القياسية ومكتبة الطباعة'),
                onTap: () => Navigator.pop(ctx, 'SYSTEM'),
              ),
              const Divider(),
              ListTile(
                leading: const Icon(Icons.wifi_tethering, color: Colors.blueAccent),
                title: const Text('طابعة شبكية مباشرة (Port 9100)'),
                subtitle: const Text('إرسال أوامر ESC/POS مباشرة عبر الشبكة المحلية'),
                onTap: () => Navigator.pop(ctx, 'NETWORK'),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إلغاء')),
          ],
        ),
      );

      if (choice == null || !mounted) return;

      if (choice == 'SYSTEM') {
        final success = await ThermalPrinterService.printReceiptViaSystem(widget.receipt);
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(success ? 'تم إرسال مهمة الطباعة للنظام بنجاح' : 'تم إلغاء عملية الطباعة'),
            backgroundColor: success ? const Color(0xFF0D9488) : Colors.grey.shade700,
          ),
        );
      } else if (choice == 'NETWORK') {
        final ipController = TextEditingController(text: await ThermalPrinterService.getSavedPrinterIp());
        final portController = TextEditingController(text: (await ThermalPrinterService.getSavedPrinterPort()).toString());

        if (!mounted) return;
        final shouldSend = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('إعدادات الطابعة الشبكية', style: TextStyle(fontSize: 14)),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: ipController,
                  decoration: const InputDecoration(labelText: 'عنوان IP للطابعة', border: OutlineInputBorder(), isDense: true),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: portController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'المنفذ (Port الافتراضي 9100)', border: OutlineInputBorder(), isDense: true),
                ),
              ],
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
              ElevatedButton(
                style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF0D9488)),
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('إرسال للطابعة', style: TextStyle(color: Colors.white)),
              ),
            ],
          ),
        );

        if (shouldSend == true && mounted) {
          final ip = ipController.text.trim();
          final port = int.tryParse(portController.text.trim()) ?? 9100;
          await ThermalPrinterService.savePrinterConfig(ip, port);

          final bytes = ThermalPrinterService.buildReceiptEscPos(widget.receipt);
          final result = await ThermalPrinterService.printOverNetwork(bytes: bytes, host: ip, port: port);

          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(result.message),
              backgroundColor: result.isSuccess ? const Color(0xFF0D9488) : Colors.redAccent,
            ),
          );
        }
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('خطأ أثناء الطباعة: $e'), backgroundColor: Colors.redAccent),
      );
    } finally {
      if (mounted) setState(() => _isPrinting = false);
    }
  }

  Future<void> _handleExportPdf() async {
    setState(() => _isExporting = true);
    try {
      final path = await ThermalPrinterService.saveReceiptPdfFile(widget.receipt);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('تم تصدير الإيصال كملف PDF بنجاح:\n$path'),
          backgroundColor: const Color(0xFF0D9488),
          duration: const Duration(seconds: 4),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('فشل تصدير ملف PDF: $e'), backgroundColor: Colors.redAccent),
      );
    } finally {
      if (mounted) setState(() => _isExporting = false);
    }
  }

  Future<void> _handleShare() async {
    try {
      await showModalBottomSheet(
        context: context,
        builder: (ctx) => SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.chat_bubble_outline, color: Colors.green),
                title: const Text('مشاركة كنص منسق (واتساب / تليجرام)'),
                subtitle: const Text('إرسال بيانات الكرت ورابط الدخول برسالة نصية للعميل'),
                onTap: () {
                  Navigator.pop(ctx);
                  ThermalPrinterService.shareReceipt(widget.receipt, asPdf: false);
                },
              ),
              ListTile(
                leading: const Icon(Icons.picture_as_pdf, color: Colors.redAccent),
                title: const Text('مشاركة كملف PDF حراري'),
                subtitle: const Text('إرسال ملف PDF جاهز للطباعة والمراجعة'),
                onTap: () {
                  Navigator.pop(ctx);
                  ThermalPrinterService.shareReceipt(widget.receipt, asPdf: true);
                },
              ),
            ],
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('خطأ أثناء المشاركة: $e'), backgroundColor: Colors.redAccent),
      );
    }
  }

  Widget _receiptRow(String label, String value, {bool isHighlight = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2.5),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(fontSize: 12, color: Colors.black54)),
          Text(
            value,
            style: TextStyle(
              fontSize: isHighlight ? 14 : 12,
              fontWeight: isHighlight ? FontWeight.w900 : FontWeight.bold,
              color: isHighlight ? const Color(0xFF0D9488) : Colors.black87,
            ),
          ),
        ],
      ),
    );
  }
}
