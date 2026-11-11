import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
import '../models/auto_provisioning_models.dart';

class ProvisioningThemeColors {
  static const Color primary = Color(0xFF136D6F);
  static const Color gold = Color(0xFFC9A46A);
  static const Color creamBg = Color(0xFFF8F6F0);
}

class ProvisioningStepHeader extends StatelessWidget {
  final int currentStep;
  final ValueChanged<int>? onStepTap;
  final bool hasDiscovery;
  final bool hasPreview;
  final bool hasOperation;

  const ProvisioningStepHeader({
    super.key,
    required this.currentStep,
    this.onStepTap,
    required this.hasDiscovery,
    required this.hasPreview,
    required this.hasOperation,
  });

  static const List<({String label, IconData icon})> steps = [
    (label: 'الاكتشاف', icon: Icons.radar_rounded),
    (label: 'الإعدادات', icon: Icons.tune_rounded),
    (label: 'المعاينة', icon: Icons.fact_check_outlined),
    (label: 'التنفيذ', icon: Icons.play_circle_outline_rounded),
    (label: 'النتيجة', icon: Icons.verified_user_outlined),
    (label: 'السجل', icon: Icons.history_rounded),
  ];

  bool _canTap(int idx) {
    if (idx == 0 || idx == 5) return true;
    if (idx == 1) return hasDiscovery;
    if (idx == 2) return hasPreview;
    if (idx == 3 || idx == 4) return hasOperation;
    return false;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
      decoration: BoxDecoration(
        color: context.bgCard,
        border: Border(bottom: BorderSide(color: context.borderColor)),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: List.generate(steps.length, (idx) {
            final step = steps[idx];
            final active = idx == currentStep;
            final completed = idx < currentStep && idx != 5;
            final tappable = _canTap(idx) && onStepTap != null;

            final Color badgeColor = active
                ? ProvisioningThemeColors.primary
                : completed
                    ? context.emeraldColor
                    : context.bgCardAlt;
            final Color fgColor = active || completed
                ? Colors.white
                : context.textSecondary;

            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: InkWell(
                borderRadius: BorderRadius.circular(20),
                onTap: tappable ? () => onStepTap!(idx) : null,
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                  decoration: BoxDecoration(
                    color: badgeColor,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: active
                          ? ProvisioningThemeColors.gold
                          : context.borderColor,
                      width: active ? 1.5 : 1,
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(step.icon, size: 15, color: fgColor),
                      const SizedBox(width: 6),
                      Text(
                        '${idx + 1}. ${step.label}',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: active ? FontWeight.bold : FontWeight.w600,
                          color: fgColor,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          }),
        ),
      ),
    );
  }
}

class ProvisioningSectionCard extends StatelessWidget {
  final String title;
  final String? subtitle;
  final IconData icon;
  final Color? accentColor;
  final Widget child;
  final Widget? trailing;

  const ProvisioningSectionCard({
    super.key,
    required this.title,
    this.subtitle,
    required this.icon,
    this.accentColor,
    required this.child,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    final tint = accentColor ?? ProvisioningThemeColors.primary;
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.borderColor),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: context.isDarkMode ? 0.18 : 0.04),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: tint.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, size: 18, color: tint),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: context.textPrimary,
                      ),
                    ),
                    if (subtitle != null && subtitle!.isNotEmpty)
                      Text(
                        subtitle!,
                        style: TextStyle(fontSize: 11.5, color: context.textSecondary),
                      ),
                  ],
                ),
              ),
              if (trailing != null) trailing!,
            ],
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

class ProvisioningStatusPill extends StatelessWidget {
  final String label;
  final Color color;
  final IconData? icon;

  const ProvisioningStatusPill({
    super.key,
    required this.label,
    required this.color,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 13, color: color),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

class ProvisioningAlertBanner extends StatelessWidget {
  final String title;
  final String message;
  final Color color;
  final IconData icon;

  const ProvisioningAlertBanner({
    super.key,
    required this.title,
    required this.message,
    required this.color,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.45)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: color,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  message,
                  style: TextStyle(fontSize: 12, color: context.textPrimary, height: 1.4),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

String translateProvisionStatus(String status) {
  switch (status.toUpperCase()) {
    case 'COMPLETED':
      return 'مكتملة بنجاح';
    case 'RUNNING':
      return 'قيد التنفيذ';
    case 'BACKING_UP':
      return 'أخذ نسخة احتياطية';
    case 'FAILED':
      return 'فشلت (مع محاولة التراجع)';
    case 'ROLLED_BACK':
      return 'تم التراجع بالكامل بعد الفشل';
    case 'DEGRADED':
      return 'يعمل بأداء منخفض (يحتاج مراجعة)';
    case 'CANCELLED':
      return 'تم الإيقاف والتراجع';
    case 'SKIPPED':
    case 'SKIPPED_EXISTING':
    case 'SKIPPED_UNSUPPORTED':
      return 'تم التخطي';
    case 'PLANNED':
    case 'PENDING':
      return 'في الانتظار';
    case 'SUCCESS':
      return 'نجح';
    default:
      return status;
  }
}

Color statusColorForProvision(BuildContext context, String status) {
  switch (status.toUpperCase()) {
    case 'COMPLETED':
    case 'SUCCESS':
    case 'VERIFIED_READY':
      return context.emeraldColor;
    case 'RUNNING':
    case 'BACKING_UP':
      return ProvisioningThemeColors.primary;
    case 'FAILED':
    case 'VERIFICATION_FAILED':
      return context.roseColor;
    case 'CANCELLED':
    case 'PARTIALLY_VERIFIED':
    case 'DEGRADED':
    case 'ROLLED_BACK':
      return context.amberColor;
    default:
      return context.textSecondary;
  }
}

String formatBytesReadable(int bytes) {
  if (bytes <= 0) return '0 B';
  if (bytes >= 1024 * 1024) {
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
  if (bytes >= 1024) {
    return '${(bytes / 1024).toStringAsFixed(1)} KB';
  }
  return '$bytes B';
}

Future<bool?> showRestoreConfirmationDialog({
  required BuildContext context,
  required AutoProvisionBackupItem backup,
  String? currentModel,
  String? currentVersion,
}) {
  bool confirmOverwrite = false;
  bool confirmReboot = false;
  bool confirmDisconnect = false;
  bool confirmCompatibility = false;

  final bool mismatch =
      (backup.routerModel != null &&
          currentModel != null &&
          backup.routerModel!.toLowerCase() != currentModel.toLowerCase()) ||
      (backup.routerOsVersion != null &&
          currentVersion != null &&
          backup.routerOsVersion!.split('.').first != currentVersion.split('.').first);

  return showDialog<bool>(
    context: context,
    builder: (ctx) {
      return StatefulBuilder(
        builder: (ctx, setState) {
          final canSubmit = confirmOverwrite &&
              confirmReboot &&
              confirmDisconnect &&
              (!mismatch || confirmCompatibility);

          return AlertDialog(
            title: const Row(
              children: [
                Icon(Icons.restore_page_rounded, color: ProvisioningThemeColors.gold),
                SizedBox(width: 8),
                Expanded(child: Text('تأكيد استعادة النسخة الاحتياطية')),
              ],
            ),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'الملف: ${backup.fileName}',
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                  ),
                  if (mismatch) ...[
                    const SizedBox(height: 8),
                    ProvisioningAlertBanner(
                      title: 'تحذير توافق الموديل أو الإصدار',
                      message:
                          'النسخة أُخذت من (${backup.routerModel ?? '-'} / ${backup.routerOsVersion ?? '-'}) بينما الجهاز الحالي (${currentModel ?? '-'} / ${currentVersion ?? '-'}).',
                      color: ctx.amberColor,
                      icon: Icons.warning_amber_rounded,
                    ),
                  ],
                  CheckboxListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    value: confirmOverwrite,
                    onChanged: (v) => setState(() => confirmOverwrite = v ?? false),
                    title: const Text('أؤكد استبدال إعدادات الراوتر الحالية بهذه النسخة', style: TextStyle(fontSize: 12.5)),
                  ),
                  CheckboxListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    value: confirmReboot,
                    onChanged: (v) => setState(() => confirmReboot = v ?? false),
                    title: const Text('أدرك أن الراوتر سيعيد التشغيل فوراً', style: TextStyle(fontSize: 12.5)),
                  ),
                  CheckboxListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    value: confirmDisconnect,
                    onChanged: (v) => setState(() => confirmDisconnect = v ?? false),
                    title: const Text('أدرك أن الاتصال سينقطع مؤقتاً (30-90 ثانية)', style: TextStyle(fontSize: 12.5)),
                  ),
                  if (mismatch)
                    CheckboxListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      value: confirmCompatibility,
                      onChanged: (v) => setState(() => confirmCompatibility = v ?? false),
                      title: const Text('أتحمل مسؤولية الاستعادة رغم اختلاف الإصدار/الموديل', style: TextStyle(fontSize: 12.5)),
                    ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('إلغاء'),
              ),
              ElevatedButton(
                onPressed: canSubmit ? () => Navigator.pop(ctx, true) : null,
                style: ElevatedButton.styleFrom(backgroundColor: ctx.roseColor),
                child: const Text('تأكيد الاستعادة الآن'),
              ),
            ],
          );
        },
      );
    },
  );
}
