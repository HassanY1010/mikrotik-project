import React, { useState } from 'react';
import { useAuth } from '../../core/context/AuthContext';
import { useToast } from '../../core/context/ToastContext';
import { Lock, Mail, ArrowLeft } from 'lucide-react';

export const LoginView: React.FC = () => {
  const { login } = useAuth();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('يرجى ملء جميع الحقول');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await login(email, password);
      showToast('تم تسجيل الدخول بنجاح! مرحباً بك في لوحة الإدارة', 'success');
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'فشل تسجيل الدخول. يرجى التأكد من صحة البريد وكلمة المرور';
      setError(msg);
      showToast('تعذر تسجيل الدخول', 'error');
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
          maxWidth: '440px',
          padding: '2.5rem',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              position: 'relative',
              width: 80,
              height: 80,
              margin: '0 auto 1.25rem',
            }}
          >
            <img
              src="/sudafi_hero.jpg"
              alt="SudaFi Logo"
              style={{
                width: '100%',
                height: '100%',
                borderRadius: 'var(--radius-xl)',
                objectFit: 'cover',
                boxShadow: 'var(--shadow-glow)',
                border: '2px solid rgba(13, 148, 136, 0.6)',
              }}
            />
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
            سودافاي | SudaFi
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.35rem' }}>
            منظومة إدارة شبكات ميكروتك والهوتسبوت الذكية
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
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="email">
              البريد الإلكتروني
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="email"
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

          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label className="form-label" htmlFor="password">
              كلمة المرور
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type="password"
                className="input"
                style={{ paddingRight: '2.5rem' }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
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
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem' }}
            disabled={loading}
          >
            {loading ? 'جاري التحقق...' : 'تسجيل الدخول إلى النظام'}
            <ArrowLeft size={16} />
          </button>
        </form>

      </div>
    </div>
  );
};
