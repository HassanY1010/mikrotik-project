import 'package:flutter/material.dart';
import '../utils/whatsapp_helper.dart';

class WhatsAppButton extends StatelessWidget {
  final WhatsAppActionType type;
  final String? label;
  final String? planName;
  final String? featureName;
  final String? customMessage;
  final bool showNumber;
  final bool? showPhonePill;
  final bool isOutlined;
  final double? fontSize;
  final EdgeInsetsGeometry? padding;

  const WhatsAppButton({
    super.key,
    this.type = WhatsAppActionType.subscription,
    this.label,
    this.planName,
    this.featureName,
    this.customMessage,
    this.showNumber = true,
    this.showPhonePill,
    this.isOutlined = false,
    this.fontSize,
    this.padding,
  });

  @override
  Widget build(BuildContext context) {
    final title = label ??
        (type == WhatsAppActionType.subscription
            ? 'طلب الاشتراك عبر واتساب'
            : 'تواصل مع الدعم الفني');

    final child = Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        // WhatsApp Chat Icon Indicator
        Container(
          width: 22,
          height: 22,
          decoration: const BoxDecoration(
            color: Color(0xFF25D366),
            shape: BoxShape.circle,
          ),
          child: const Center(
            child: Icon(
              Icons.chat_bubble_rounded,
              color: Colors.white,
              size: 13,
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          title,
          style: TextStyle(
            fontSize: fontSize ?? 13,
            fontWeight: FontWeight.bold,
            color: isOutlined ? const Color(0xFF4ADE80) : Colors.white,
          ),
        ),
        if (showPhonePill ?? showNumber) ...[
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.25),
              borderRadius: BorderRadius.circular(6),
            ),
            child: const Text(
              WhatsAppHelper.supportPhoneDisplay,
              style: TextStyle(
                color: Colors.white,
                fontSize: 10,
                fontWeight: FontWeight.w600,
                letterSpacing: 0.5,
              ),
            ),
          ),
        ],
      ],
    );

    if (isOutlined) {
      return OutlinedButton(
        onPressed: () => WhatsAppHelper.openWhatsApp(
          type: type,
          planName: planName,
          featureName: featureName,
          customMessage: customMessage,
          context: context,
        ),
        style: OutlinedButton.styleFrom(
          side: const BorderSide(color: Color(0xFF22C55E), width: 1.2),
          backgroundColor: const Color(0xFF22C55E).withValues(alpha: 0.1),
          padding: padding ?? const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
        child: child,
      );
    }

    return ElevatedButton(
      onPressed: () => WhatsAppHelper.openWhatsApp(
        type: type,
        planName: planName,
        featureName: featureName,
        customMessage: customMessage,
        context: context,
      ),
      style: ElevatedButton.styleFrom(
        backgroundColor: const Color(0xFF16A34A),
        foregroundColor: Colors.white,
        padding: padding ?? const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        elevation: 2,
      ),
      child: child,
    );
  }
}
