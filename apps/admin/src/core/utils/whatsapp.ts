/**
 * Centralized WhatsApp Communication Helper & Constants
 * Unified Technical Support and Subscription Requests
 */

export const SUPPORT_WHATSAPP_NUMBER = '249911264473';
export const SUPPORT_PHONE_DISPLAY = '+249911264473';

export const DEFAULT_MESSAGES = {
  support: 'مرحبًا، أحتاج إلى مساعدة من الدعم الفني. أواجه مشكلة وأرجو منكم مساعدتي. شكرًا لكم.',
  subscription: 'مرحبًا، أرغب في الاشتراك في خدمة SudaFi وتفعيل حسابي. أرجو تزويدي بتفاصيل الباقات المتاحة والأسعار وخطوات تفعيل الاشتراك. شكرًا لكم.',
};

export interface WhatsAppOptions {
  type?: 'support' | 'subscription';
  planName?: string;
  featureName?: string;
  customMessage?: string;
}

export function buildWhatsAppMessage(options: WhatsAppOptions = {}): string {
  if (options.customMessage) {
    return options.customMessage;
  }

  if (options.type === 'subscription') {
    if (options.planName) {
      return `مرحبًا، أرغب في الاشتراك في خدمة SudaFi وتفعيل باقة (${options.planName}) لحسابي. أرجو تزويدي بتفاصيل الباقة وخطوات تفعيل الاشتراك. شكرًا لكم.`;
    }
    if (options.featureName) {
      return `مرحبًا، أرغب في تفعيل ميزة (${options.featureName}) في خدمة SudaFi وتفعيل اشتراك حسابي. أرجو تزويدي بالتفاصيل وخطوات التفعيل. شكرًا لكم.`;
    }
    return DEFAULT_MESSAGES.subscription;
  }

  if (options.featureName) {
    return `مرحبًا، أحتاج إلى مساعدة من الدعم الفني بخصوص ميزة (${options.featureName}). شكرًا لكم.`;
  }

  return DEFAULT_MESSAGES.support;
}

export function buildWhatsAppUrl(options: WhatsAppOptions = {}): string {
  const message = buildWhatsAppMessage(options);
  const encodedText = encodeURIComponent(message);
  return `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodedText}`;
}

export function openWhatsApp(options: WhatsAppOptions = {}): void {
  const url = buildWhatsAppUrl(options);
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
