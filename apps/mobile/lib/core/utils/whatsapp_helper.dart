import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../theme/app_theme.dart';

enum WhatsAppActionType {
  support,
  subscription,
}

class WhatsAppHelper {
  static const String supportPhoneNumber = '249911264473';
  static const String supportPhoneDisplay = '+249911264473';

  static const String defaultSupportMessage =
      'مرحبًا، أحتاج إلى مساعدة من الدعم الفني. أواجه مشكلة وأرجو منكم مساعدتي. شكرًا لكم.';

  static const String defaultSubscriptionMessage =
      'مرحبًا، أرغب في الاشتراك في خدمة SudaFi وتفعيل حسابي. أرجو تزويدي بتفاصيل الباقات المتاحة والأسعار وخطوات تفعيل الاشتراك. شكرًا لكم.';

  static String buildMessage({
    WhatsAppActionType type = WhatsAppActionType.subscription,
    String? planName,
    String? featureName,
    String? customMessage,
  }) {
    if (customMessage != null && customMessage.isNotEmpty) {
      return customMessage;
    }

    if (type == WhatsAppActionType.subscription) {
      if (planName != null && planName.isNotEmpty) {
        return 'مرحبًا، أرغب في الاشتراك في خدمة SudaFi وتفعيل باقة ($planName) لحسابي. أرجو تزويدي بتفاصيل الباقة وخطوات تفعيل الاشتراك. شكرًا لكم.';
      }
      if (featureName != null && featureName.isNotEmpty) {
        return 'مرحبًا، أرغب في تفعيل ميزة ($featureName) في خدمة SudaFi وتفعيل اشتراك حسابي. أرجو تزويدي بالتفاصيل وخطوات التفعيل. شكرًا لكم.';
      }
      return defaultSubscriptionMessage;
    }

    if (featureName != null && featureName.isNotEmpty) {
      return 'مرحبًا، أحتاج إلى مساعدة من الدعم الفني بخصوص ميزة ($featureName). شكرًا لكم.';
    }

    return defaultSupportMessage;
  }

  static Uri buildUri({
    WhatsAppActionType type = WhatsAppActionType.subscription,
    String? planName,
    String? featureName,
    String? customMessage,
  }) {
    final message = buildMessage(
      type: type,
      planName: planName,
      featureName: featureName,
      customMessage: customMessage,
    );
    final encoded = Uri.encodeComponent(message);
    return Uri.parse('https://wa.me/$supportPhoneNumber?text=$encoded');
  }

  static Future<bool> openWhatsApp({
    WhatsAppActionType type = WhatsAppActionType.subscription,
    String? planName,
    String? featureName,
    String? customMessage,
    BuildContext? context,
  }) async {
    final message = buildMessage(
      type: type,
      planName: planName,
      featureName: featureName,
      customMessage: customMessage,
    );
    final encoded = Uri.encodeComponent(message);
    final nativeUri = Uri.parse('whatsapp://send?phone=$supportPhoneNumber&text=$encoded');
    final webUri = Uri.parse('https://wa.me/$supportPhoneNumber?text=$encoded');

    try {
      // 1. Try launching via native whatsapp:// scheme if supported
      if (await canLaunchUrl(nativeUri)) {
        final launchedNative = await launchUrl(nativeUri, mode: LaunchMode.externalApplication);
        if (launchedNative) return true;
      }
    } catch (_) {}

    try {
      // 2. Try launching via universal link https://wa.me/
      final launchedApp = await launchUrl(webUri, mode: LaunchMode.externalApplication);
      if (launchedApp) return true;
    } catch (_) {}

    try {
      // 3. Fallback: try opening in default system browser
      final launchedBrowser = await launchUrl(webUri, mode: LaunchMode.platformDefault);
      if (launchedBrowser) return true;
    } catch (_) {}

    // 3. Fallback: if WhatsApp is not available or link opening failed, provide helpful feedback
    if (context != null && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: [
              Icon(Icons.info_outline, color: context.textPrimary, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'رقم الدعم الفني عبر واتساب: $supportPhoneDisplay',
                  style: TextStyle(color: context.textPrimary),
                ),
              ),
              TextButton(
                onPressed: () {
                  Clipboard.setData(const ClipboardData(text: supportPhoneDisplay));
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('تم نسخ رقم الواتساب إلى الحافظة')),
                  );
                },
                child: const Text('نسخ الرقم', style: TextStyle(color: Color(0xFF38BDF8))),
              ),
            ],
          ),
          backgroundColor: context.bgCard,
          duration: const Duration(seconds: 5),
        ),
      );
    }

    return false;
  }
}
