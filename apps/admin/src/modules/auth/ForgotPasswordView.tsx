import React, { useState } from 'react';
import { Mail, ArrowRight, ArrowLeft, AlertCircle, ShieldCheck } from 'lucide-react';
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
      await apiClient.post<{ success: boolean; message: string }>(
        '/auth/forgot-password',
        { email: cleanEmail },
      );
      showToast('البريد الإلكتروني مسجل، جاري الانتقال لتعيين كلمة المرور الجديدة', 'success');
      onProceedToReset(cleanEmail);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'البريد الإلكتروني غير مسجل في النظام، يرجى التحقق من صحة البريد';
      setError(msg);
      showToast(msg, 'error');
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
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.35rem', lineHeight: 1.5 }}>
            أدخل بريدك الإلكتروني المسجل في المنظومة للتحقق منه والانتقال مباشرة لكتابة كلمة المرور الجديدة
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
                placeholder="admin@network.com"
                required
                autoFocus
              />
              <Mail
                size={18}
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

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem' }}
            disabled={loading}
          >
            {loading ? (
              <span>جاري التحقق من البريد...</span>
            ) : (
              <>
                <span>متابعة تعيين كلمة المرور</span>
                <ArrowLeft size={16} />
              </>
            )}
          </button>

          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}
              onClick={onBackToLogin}
            >
              <ArrowRight size={15} />
              <span>العودة إلى تسجيل الدخول</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
