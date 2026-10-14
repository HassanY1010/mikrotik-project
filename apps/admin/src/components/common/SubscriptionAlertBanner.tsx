import React from 'react';
import { AlertCircle, AlertTriangle, ShieldAlert, CreditCard, ChevronLeft } from 'lucide-react';
import { useSubscription } from '../../core/context/SubscriptionContext';
import { useAuth } from '../../core/context/AuthContext';
import { NavigationTab } from '../layout/Sidebar';
import { WhatsAppButton } from './WhatsAppButton';

interface SubscriptionAlertBannerProps {
  onNavigateTab?: (tab: NavigationTab) => void;
}

export const SubscriptionAlertBanner: React.FC<SubscriptionAlertBannerProps> = ({ onNavigateTab }) => {
  const { user } = useAuth();
  const { subscription, isSubscribed, isExpired, isSuspended, hasNoSubscription } = useSubscription();

  // Platform super admins do not need to see this banner
  if (user?.role === 'SUPER_ADMIN' || isSubscribed) {
    return null;
  }

  if (isSuspended) {
    return (
      <div
        style={{
          margin: '0.75rem 1.25rem 0.5rem',
          padding: '1rem 1.25rem',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ef4444',
              flexShrink: 0,
            }}
          >
            <ShieldAlert size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#f87171' }}>
              تم تعليق اشتراك هذه الشبكة مؤقتاً
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              تم تعليق حساب شبكتك من قِبل إدارة المنصة. يرجى التواصل مع الدعم الفني لإعادة تنشيط الحساب.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <WhatsAppButton
            type="support"
            label="تواصل مع الدعم الفني"
            customMessage="مرحبًا، تم تعليق حساب شبكتي مؤقتاً في خدمة SudaFi، أرجو مساعدتي في مراجعة وتنشيط الحساب. شكرًا لكم."
            size="sm"
          />
        </div>
      </div>
    );
  }

  if (isExpired) {
    const expiryText = subscription?.expiresAt
      ? new Date(subscription.expiresAt).toLocaleDateString('ar-EG', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : '';

    return (
      <div
        style={{
          margin: '0.75rem 1.25rem 0.5rem',
          padding: '1rem 1.25rem',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              backgroundColor: 'rgba(245, 158, 11, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f59e0b',
              flexShrink: 0,
            }}
          >
            <AlertTriangle size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fbbf24' }}>
              تنبيه: انتهت صلاحية اشتراك الشبكة {expiryText ? `بتاريخ ${expiryText}` : ''}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              توقفت إمكانية توليد دفعات الكروت أو إضافة راوترات جديدة. يمكنك الاستمرار في طباعة وبيع الكروت المتوفرة.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <WhatsAppButton
            type="subscription"
            label="تجديد الاشتراك عبر واتساب"
            planName={subscription?.planNameAr || subscription?.plan}
            size="sm"
          />
          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab('settings')}
              className="btn btn-outline"
              style={{
                borderColor: 'rgba(245, 158, 11, 0.4)',
                color: '#fbbf24',
                fontSize: '0.825rem',
                padding: '0.45rem 0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <CreditCard size={15} />
              تفاصيل الاشتراك
              <ChevronLeft size={15} />
            </button>
          )}
        </div>
      </div>
    );
  }

  if (hasNoSubscription) {
    return (
      <div
        style={{
          margin: '0.75rem 1.25rem 0.5rem',
          padding: '1rem 1.25rem',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'rgba(13, 148, 136, 0.1)',
          border: '1px solid rgba(13, 148, 136, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              backgroundColor: 'rgba(13, 148, 136, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary)',
              flexShrink: 0,
            }}
          >
            <AlertCircle size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
              حساب الشبكة قيد الإعداد (لا يوجد اشتراك نشط حالياً)
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              يمكنك استعراض لوحة التحكم وتصميم صفحات الهوتسبوت؛ ولتفعيل ربط موجهات ميكروتك وتوليد كروت جديدة، يرجى تفعيل باقة الاشتراك.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <WhatsAppButton
            type="subscription"
            label="طلب تفعيل الاشتراك عبر واتساب"
            size="sm"
          />
          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab('settings')}
              className="btn btn-outline"
              style={{
                borderColor: 'rgba(13, 148, 136, 0.5)',
                color: 'var(--primary)',
                fontSize: '0.825rem',
                padding: '0.45rem 0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <CreditCard size={15} />
              معاينة الباقات
              <ChevronLeft size={15} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
};
