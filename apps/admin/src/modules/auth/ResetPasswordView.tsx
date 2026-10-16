import React, { useState } from 'react';
import {
  Lock,
  Mail,
  KeyRound,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Key,
} from 'lucide-react';
import { apiClient } from '../../core/api/api-client';
import { useToast } from '../../core/context/ToastContext';

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
  initialCode = '',
}) => {
  const { showToast } = useToast();
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState(initialCode);
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

    if (!isTokenMode && (!code.trim() || code.trim().length < 6)) {
      setError('يرجى إدخال رمز التحقق المكون من 6 أرقام كاملاً');
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
        code?: string;
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
        payload.code = code.trim();
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
          : 'تعذر تعيين كلمة المرور الجديدة. تأكد من صحة الرمز وصلاحيته';
      setError(msg);
      showToast('تعذر تعيين كلمة المرور', 'error');
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
            {isTokenMode
              ? 'تم التحقق من رابط الاستعادة، اختر كلمة مرور جديدة وقوية لحسابك'
              : 'أدخل رمز التحقق المرسل إلى بريدك ثم عيّن كلمة المرور الجديدة'}
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
                padding: '1.5rem',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: 'var(--radius-lg)',
                color: 'var(--text-primary)',
                textAlign: 'center',
                marginBottom: '1.75rem',
              }}
            >
              <CheckCircle2
                size={48}
                style={{ color: 'var(--success)', margin: '0 auto 1rem' }}
              />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                تم تغيير كلمة المرور بنجاح!
              </h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                تم تحديث كلمة المرور وتأمين حسابك وإبطال الجلسات السابقة. يمكنك الآن تسجيل الدخول مباشرة بكلمة المرور الجديدة.
              </p>
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
              <>
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

                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label className="form-label" htmlFor="reset-code">
                    رمز التحقق (6 أرقام)
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="reset-code"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      className="input"
                      style={{
                        paddingRight: '2.5rem',
                        letterSpacing: '0.25em',
                        fontWeight: 700,
                        fontSize: '1.1rem',
                        direction: 'ltr',
                        textAlign: 'center',
                      }}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      required
                    />
                    <KeyRound
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
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                    الرمز مكون من 6 أرقام وصلك عبر البريد، وصالح لمدة 15 دقيقة
                  </span>
                </div>
              </>
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
                  onClick={() => setShowPassword(!showPassword)}
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
                    display: 'flex',
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label className="form-label" htmlFor="confirm-new-password">
                تأكيد كلمة المرور الجديدة
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="confirm-new-password"
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
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
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
                    display: 'flex',
                  }}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {newPassword && confirmPassword && (
                <div style={{ marginTop: '0.4rem', fontSize: '0.8rem' }}>
                  {newPassword === confirmPassword ? (
                    <span style={{ color: 'var(--success)' }}>✔ كلمتا المرور متطابقتان</span>
                  ) : (
                    <span style={{ color: 'var(--danger)' }}>✖ كلمتا المرور غير متطابقتين</span>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem' }}
                disabled={loading}
              >
                {loading ? 'جاري تعيين كلمة المرور...' : 'حفظ وتعيين كلمة المرور الجديدة'}
                <ArrowLeft size={16} />
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
