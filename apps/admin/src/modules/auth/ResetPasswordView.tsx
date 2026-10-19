import React, { useState } from 'react';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Key,
  Sun,
  Moon,
} from 'lucide-react';
import { apiClient } from '../../core/api/api-client';
import { useToast } from '../../core/context/ToastContext';
import { useTheme } from '../../core/context/ThemeContext';

interface ResetPasswordViewProps {
  onBackToLogin: () => void;
  initialEmail?: string;
  initialToken?: string;
  initialCode?: string;
}

export const ResetPasswordView: React.FC<ResetPasswordViewProps> = ({
  onBackToLogin,
  initialEmail = '',
  initialToken = '',
}) => {
  const { showToast } = useToast();
  const { isDark, toggleTheme } = useTheme();
  const [email, setEmail] = useState(initialEmail);
  const [token] = useState(initialToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  const isTokenMode = Boolean(token);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isTokenMode && !email.trim()) {
      setError('يرجى كتابة البريد الإلكتروني');
      return;
    }

    if (newPassword.length < 8) {
      setError('يجب ألا تقل كلمة المرور الجديدة عن 8 أحرف');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('كلمة المرور وتأكيدها غير متطابقين');
      return;
    }

    setLoading(true);

    try {
      const payload: {
        email?: string;
        token?: string;
        newPassword: string;
        confirmPassword?: string;
      } = {
        newPassword,
        confirmPassword,
      };

      if (token) {
        payload.token = token;
      } else {
        payload.email = email.trim();
      }

      await apiClient.post<{ success: boolean; message: string }>(
        '/auth/reset-password',
        payload,
      );

      setCompleted(true);
      showToast('تم تعيين كلمة المرور الجديدة بنجاح!', 'success');
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'تعذر تعيين كلمة المرور الجديدة. يرجى التحقق من صحة البيانات والمحاولة مجدداً';
      setError(msg);
      showToast('تعذر تعيين كلمة المرور', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        background: 'var(--bg-auth-gradient)',
      }}
    >
      {/* Theme Toggle Button */}
      <div style={{ position: 'absolute', top: '1.5rem', left: '1.5rem', zIndex: 10 }}>
        <button
          type="button"
          className="btn btn-outline btn-icon"
          onClick={toggleTheme}
          title={isDark ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'}
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {isDark ? <Sun size={18} color="var(--accent)" /> : <Moon size={18} color="var(--primary)" />}
        </button>
      </div>
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
              background: 'linear-gradient(135deg, rgba(13, 148, 136, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%)',
              border: '1px solid rgba(13, 148, 136, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary)',
            }}
          >
            <Key size={32} />
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
            تعيين كلمة المرور الجديدة
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.35rem' }}>
            أدخل كلمة المرور الجديدة لحسابك وقم بتأكيدها للحفظ
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

        {completed ? (
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
                alignItems: 'center',
              }}
            >
              <CheckCircle2 size={24} style={{ color: 'var(--success)', flexShrink: 0 }} />
              <div>
                <strong style={{ display: 'block', color: 'var(--success)', marginBottom: '0.2rem' }}>
                  تم تحديث كلمة المرور بنجاح
                </strong>
                <span>يمكنك الآن استخدام كلمة المرور الجديدة لتسجيل الدخول إلى حسابك.</span>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem' }}
              onClick={onBackToLogin}
            >
              <span>تسجيل الدخول الآن</span>
              <ArrowLeft size={16} />
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {!isTokenMode && (
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" htmlFor="reset-email">
                  البريد الإلكتروني
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="reset-email"
                    type="email"
                    className="input"
                    style={{ paddingRight: '2.5rem' }}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@network.com"
                    required
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
            )}

            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label" htmlFor="new-password">
                كلمة المرور الجديدة
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  className="input"
                  style={{ paddingRight: '2.5rem', paddingLeft: '2.5rem' }}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="8 أحرف على الأقل"
                  required
                  autoFocus={isTokenMode}
                />
                <Lock
                  size={17}
                  style={{
                    position: 'absolute',
                    right: '0.85rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                  }}
                />
                <button
                  type="button"
                  style={{
                    position: 'absolute',
                    left: '0.85rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label className="form-label" htmlFor="confirm-password">
                تأكيد كلمة المرور الجديدة
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  className="input"
                  style={{ paddingRight: '2.5rem', paddingLeft: '2.5rem' }}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="أعد إدخال كلمة المرور"
                  required
                />
                <Lock
                  size={17}
                  style={{
                    position: 'absolute',
                    right: '0.85rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                  }}
                />
                <button
                  type="button"
                  style={{
                    position: 'absolute',
                    left: '0.85rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem' }}
              disabled={loading}
            >
              {loading ? (
                <span>جاري الحفظ والتحديث...</span>
              ) : (
                <>
                  <span>حفظ كلمة المرور وتعيينها</span>
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
        )}
      </div>
    </div>
  );
};
