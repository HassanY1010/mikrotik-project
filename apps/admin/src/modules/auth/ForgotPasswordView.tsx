import React, { useState } from 'react';
import { Mail, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import { apiClient } from '../../core/api/api-client';
import { useToast } from '../../core/context/ToastContext';

interface ForgotPasswordViewProps {
  onBackToLogin: () => void;
  onProceedToReset: (email: string) => void;
  initialEmail?: string;
}

export const ForgotPasswordView: React.FC<ForgotPasswordViewProps> = ({
  onBackToLogin,
  onProceedToReset,
  initialEmail = '',
}) => {
  const { showToast } = useToast();
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('يرجى كتابة البريد الإلكتروني');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.post<{ success: boolean; message: string }>(
        '/auth/forgot-password',
        { email: cleanEmail },
      );
      const msg =
        response?.message ||
        'إذا كان البريد الإلكتروني مسجلاً لدينا، فستصلك تعليمات استعادة كلمة المرور خلال لحظات.';
      setSuccessMessage(msg);
      setSubmitted(true);
      showToast('تم إرسال تعليمات الاستعادة بنجاح', 'success');
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'تعذر إرسال طلب الاستعادة، يرجى المحاولة لاحقاً';
      setError(msg);
      showToast('حدث خطأ أثناء إرسال الطلب', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        background: 'radial-gradient(ellipse at top, #1e293b 0%, #0b1120 100%)',
      }}
    >
      <div
        className="card card-glass"
        style={{
          width: '100%',
          maxWidth: '460px',
          padding: '2.5rem',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              width: 64,
              height: 64,
              margin: '0 auto 1.25rem',
              borderRadius: 'var(--radius-xl)',
              background: 'linear-gradient(135deg, rgba(13, 148, 136, 0.2) 0%, rgba(14, 165, 233, 0.2) 100%)',
              border: '1px solid rgba(13, 148, 136, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary)',
            }}
          >
            <ShieldCheck size={32} />
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
            استعادة كلمة المرور
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.35rem' }}>
            أدخل بريدك الإلكتروني المسجل لإرسال رمز التحقق ورابط إعادة التعيين
          </p>
        </div>

        {error && (
          <div
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: 'var(--danger-bg)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--danger)',
              fontSize: '0.85rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {submitted ? (
          <div>
            <div
              style={{
                padding: '1.25rem',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: 'var(--radius-lg)',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
                lineHeight: 1.6,
                marginBottom: '1.75rem',
                display: 'flex',
                gap: '0.75rem',
                alignItems: 'flex-start',
              }}
            >
              <CheckCircle2 size={22} style={{ color: 'var(--success)', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ display: 'block', color: 'var(--success)', marginBottom: '0.25rem' }}>
                  تم إرسال الطلب بنجاح
                </strong>
                <span>{successMessage}</span>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem', marginBottom: 0 }}>
                  يرجى فحص صندوق الوارد (أو مجلد الرسائل غير المرغوب فيها Spam) للحصول على رمز التحقق المكون من 6 أرقام. الرمز صالح لمدة 15 دقيقة.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem' }}
                onClick={() => onProceedToReset(email)}
              >
                <span>إدخال رمز التحقق وتعيين كلمة المرور</span>
                <ArrowLeft size={16} />
              </button>

              <button
                type="button"
                className="btn btn-outline"
                style={{ width: '100%', padding: '0.75rem', fontSize: '0.9rem' }}
                onClick={onBackToLogin}
              >
                <ArrowRight size={16} />
                <span>العودة إلى تسجيل الدخول</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label className="form-label" htmlFor="recovery-email">
                البريد الإلكتروني المسجل
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="recovery-email"
                  type="email"
                  className="input"
                  style={{ paddingRight: '2.5rem' }}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@network.com"
                  required
                  autoFocus
                />
                <Mail
                  size={17}
                  style={{
                    position: 'absolute',
                    right: '0.85rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem' }}
                disabled={loading}
              >
                {loading ? 'جاري إرسال التعليمات...' : 'إرسال رمز الاستعادة'}
                <ArrowLeft size={16} />
              </button>

              <button
                type="button"
                className="btn btn-ghost"
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  fontSize: '0.875rem',
                  color: 'var(--text-secondary)',
                }}
                onClick={() => onProceedToReset(email)}
              >
                <span>لدي رمز تحقق بالفعل؟ تعيين كلمة المرور مباشرة</span>
              </button>

              <button
                type="button"
                className="btn btn-outline"
                style={{ width: '100%', padding: '0.7rem', fontSize: '0.9rem' }}
                onClick={onBackToLogin}
              >
                <ArrowRight size={16} />
                <span>العودة إلى تسجيل الدخول</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
