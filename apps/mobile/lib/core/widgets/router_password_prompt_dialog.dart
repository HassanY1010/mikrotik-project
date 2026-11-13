import 'package:flutter/material.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';

/// Shows a dialog prompting the user for the local router password.
/// Used when executing local commands (Backups, Hotspot Profiles, Portal Uploads, Card Syncs)
/// over the local Wi-Fi network on private LAN routers.
Future<String?> showRouterPasswordPromptDialog({
  required BuildContext context,
  required RouterDeviceModel currentRouter,
  String? operationLabel,
}) async {
  final passCtrl = TextEditingController();
  bool obscure = true;

  final opText = operationLabel != null && operationLabel.isNotEmpty
      ? ' للمتابعة في $operationLabel عبر الشبكة المحلية.'
      : ' للمتابعة عبر الشبكة المحلية.';

  return showDialog<String>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setPromptState) => AlertDialog(
        backgroundColor: ctx.bgCard,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: [
            const Icon(Icons.vpn_key_outlined, color: AppTheme.primary, size: 22),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'كلمة مرور الراوتر (${currentRouter.name})',
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'الراوتر متصل محلياً (${currentRouter.host})؛ يرجى إدخال كلمة مرور اتصال الراوتر$opText',
              style: TextStyle(fontSize: 12, color: ctx.textSecondary),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: passCtrl,
              obscureText: obscure,
              autofocus: true,
              decoration: InputDecoration(
                labelText: 'كلمة مرور الراوتر',
                prefixIcon: const Icon(Icons.lock_outline, size: 18),
                suffixIcon: IconButton(
                  icon: Icon(obscure ? Icons.visibility_off : Icons.visibility, size: 18),
                  onPressed: () => setPromptState(() => obscure = !obscure),
                ),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, null),
            child: const Text('إلغاء'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, passCtrl.text.trim()),
            child: const Text('متابعة'),
          ),
        ],
      ),
    ),
  );
}
