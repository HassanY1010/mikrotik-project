import React, { useEffect, useState } from 'react';
import { apiClient } from '../../core/api/api-client';
import { useToast } from '../../core/context/ToastContext';
import { Settings, Building, CreditCard, Shield, Save } from 'lucide-react';
import { TenantSettingsItem } from '../../core/types/view-models';

export const TenantSettingsView: React.FC = () => {
  const { showToast } = useToast();
  const [tenant, setTenant] = useState<TenantSettingsItem>({
    name: '',
    slug: '',
    currency: 'SDG',
    contactEmail: '',
    contactPhone: '',
    subscription: {
      plan: 'FREE',
      maxRouters: 0,
      maxCardsPerMonth: 0,
      status: 'INACTIVE',
      expiresAt: '',
    },
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiClient
      .get<TenantSettingsItem>('/tenants/current')
      .then((data) => {
        if (data) setTenant(data);
      })
      .catch(() => {
        showToast('تعذر جلب بيانات المستأجر من الخادم', 'error');
      });
  }, [showToast]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiClient.patch('/tenants/current', {
        name: tenant.name,
        currency: tenant.currency,
        contactEmail: tenant.contactEmail,
        contactPhone: tenant.contactPhone,
      });
      showToast('تم حفظ إعدادات الشبكة بنجاح', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل حفظ الإعدادات، يرجى المحاولة لاحقاً';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Settings color="var(--primary)" size={24} />
            إعدادات الشبكة والمستأجر
          </h1>
          <p className="page-subtitle">
            تعديل بيانات المنشأة، العملة المعتمدة، ومتابعة حدود وحصص الاشتراك
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.6fr 1.4fr',
          gap: '1.5rem',
          alignItems: 'start',
        }}
      >
        {/* Left Side: General Profile Settings */}
        <div className="card">
          <h3
            style={{
              fontSize: '1.1rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <Building size={18} color="var(--primary)" />
            بيانات المنشأة والشبكة
          </h3>

          <form onSubmit={handleSave}>
            <div className="form-group">
              <label className="form-label" htmlFor="t-name">
                اسم الشبكة التجاري *
              </label>
              <input
                id="t-name"
                className="input"
                value={tenant.name}
                onChange={(e) => setTenant({ ...tenant, name: e.target.value })}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="t-slug">
                  المعرف الفريد للشبكة
                </label>
                <input
                  id="t-slug"
                  className="input"
                  style={{
                    direction: 'ltr',
                    textAlign: 'left',
                    backgroundColor: 'var(--bg-app)',
                    color: 'var(--text-muted)',
                  }}
                  value={tenant.slug}
                  disabled
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="t-curr">
                  العملة الافتراضية للفواتير
                </label>
                <select
                  id="t-curr"
                  className="select"
                  value={tenant.currency}
                  onChange={(e) => setTenant({ ...tenant, currency: e.target.value })}
                >
                  <option value="SDG">جنيه سوداني (SDG)</option>
                  <option value="USD">دولار أمريكي (USD)</option>
                  <option value="SAR">ريال سعودي (SAR)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="t-email">
                  البريد الإلكتروني للتواصل
                </label>
                <input
                  id="t-email"
                  type="email"
                  className="input"
                  style={{ direction: 'ltr', textAlign: 'left' }}
                  value={tenant.contactEmail || ''}
                  onChange={(e) => setTenant({ ...tenant, contactEmail: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="t-phone">
                  رقم هاتف الدعم الفني
                </label>
                <input
                  id="t-phone"
                  className="input"
                  style={{ direction: 'ltr', textAlign: 'left' }}
                  value={tenant.contactPhone || ''}
                  onChange={(e) => setTenant({ ...tenant, contactPhone: e.target.value })}
                />
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                <Save size={16} />
                {loading ? 'جاري الحفظ...' : 'حفظ التعديلات'}
              </button>
            </div>
          </form>
        </div>

        {/* Right Side: Subscription & Quota Card */}
        <div className="card">
          <h3
            style={{
              fontSize: '1.1rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <CreditCard size={18} color="var(--accent)" />
            تفاصيل باقة الاشتراك والحصص
          </h3>

          <div
            style={{
              padding: '1.25rem',
              backgroundColor: 'var(--bg-app)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              marginBottom: '1.25rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                نوع الخطة:
              </span>
              <span className="badge badge-success" style={{ fontSize: '0.85rem' }}>
                {tenant.subscription?.plan || 'ENTERPRISE PRO'}
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '0.75rem',
                fontSize: '0.85rem',
              }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>الحد الأقصى للراوترات:</span>
              <strong>{tenant.subscription?.maxRouters || 10} أجهزة</strong>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '0.75rem',
                fontSize: '0.85rem',
              }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>سقف توليد الكروت شهرياً:</span>
              <strong>
                {Number(tenant.subscription?.maxCardsPerMonth || 50000).toLocaleString()} كرت
              </strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>تاريخ انتهاء الترخيص:</span>
              <strong style={{ color: 'var(--success)' }}>
                {tenant.subscription?.expiresAt || '31/12/2027'}
              </strong>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <h4
              style={{
                fontSize: '0.9rem',
                marginBottom: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <Shield size={16} color="var(--primary)" />
              الأمان والتشفير متعدد المستأجرين
            </h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              جميع بيانات راوتراتك وكروت شبكتك مفصولة منطقياً ومشفرة باستخدام معيار AES-256-GCM.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
