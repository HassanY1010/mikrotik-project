import React, { useEffect, useState, useCallback } from 'react';
import { apiClient } from '../../core/api/api-client';
import { useToast } from '../../core/context/ToastContext';
import { Modal } from '../../components/common/Modal';
import { WhatsAppButton } from '../../components/common/WhatsAppButton';
import {
  Settings,
  Building,
  CreditCard,
  Shield,
  Save,
  Users,
  UserPlus,
  Edit,
  Trash2,
  RefreshCw,
  Sun,
  Moon,
} from 'lucide-react';
import { TenantSettingsItem, UserItem } from '../../core/types/view-models';
import { useTheme } from '../../core/context/ThemeContext';

export const TenantSettingsView: React.FC = () => {
  const { showToast } = useToast();
  const { theme, setTheme } = useTheme();
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

  // Staff & Users State
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [savingUser, setSavingUser] = useState(false);

  const [addUserForm, setAddUserForm] = useState({
    fullName: '',
    email: '',
    password: '',
    roleName: 'CASHIER',
    phone: '',
  });

  const [editUserForm, setEditUserForm] = useState({
    fullName: '',
    roleName: 'CASHIER',
    phone: '',
    status: 'ACTIVE',
  });

  const fetchUsers = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setLoadingUsers(true);
    }
    try {
      const data = await apiClient.get<UserItem[]>('/users');
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      if (isInitial) {
        setUsers([]);
      }
    } finally {
      if (isInitial) {
        setLoadingUsers(false);
      }
    }
  }, []);

  useEffect(() => {
    apiClient
      .get<TenantSettingsItem>('/tenants/current')
      .then((data) => {
        if (data) setTenant(data);
      })
      .catch(() => {
        showToast('تعذر جلب بيانات المستأجر من الخادم', 'error');
      });

    fetchUsers(true);
  }, [showToast, fetchUsers]);

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

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingUser(true);
    try {
      await apiClient.post('/users', addUserForm);
      showToast('تمت إضافة المستخدم بنجاح', 'success');
      setIsAddUserOpen(false);
      setAddUserForm({
        fullName: '',
        email: '',
        password: '',
        roleName: 'CASHIER',
        phone: '',
      });
      fetchUsers(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل إضافة المستخدم';
      showToast(msg, 'error');
    } finally {
      setSavingUser(false);
    }
  };

  const handleOpenEditUser = (u: UserItem) => {
    setEditingUser(u);
    setEditUserForm({
      fullName: u.fullName || '',
      roleName: u.role?.name || 'CASHIER',
      phone: u.phone || '',
      status: u.status || 'ACTIVE',
    });
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    const targetId = editingUser.id;
    const previousUsers = [...users];

    // Optimistic UI: update immediately in 0ms
    setUsers((prev) =>
      prev.map((x) =>
        x.id === targetId
          ? {
              ...x,
              fullName: editUserForm.fullName,
              phone: editUserForm.phone,
              status: editUserForm.status,
              role: x.role ? { ...x.role, name: editUserForm.roleName } : undefined,
            }
          : x,
      ),
    );
    setEditingUser(null);
    showToast('تم تحديث بيانات المستخدم بنجاح', 'success');

    try {
      await apiClient.patch(`/users/${targetId}`, editUserForm);
      fetchUsers(false);
    } catch (err: unknown) {
      // Revert on error
      setUsers(previousUsers);
      const msg = err instanceof Error ? err.message : 'فشل تحديث بيانات المستخدم';
      showToast(msg, 'error');
    } finally {
      setSavingUser(false);
    }
  };

  const handleDeleteUser = async (u: UserItem) => {
    if (!window.confirm(`هل أنت متأكد من حذف المستخدم "${u.fullName}"؟`)) return;
    const userToDelete = u;

    // Optimistic UI: remove immediately in 0ms
    setUsers((prev) => prev.filter((x) => x.id !== userToDelete.id));
    showToast('تم حذف المستخدم بنجاح', 'success');

    try {
      await apiClient.delete(`/users/${userToDelete.id}`);
      fetchUsers(false);
    } catch (err: unknown) {
      // Revert on error
      setUsers((prev) => [...prev, userToDelete]);
      const msg = err instanceof Error ? err.message : 'فشل حذف المستخدم';
      showToast(msg, 'error');
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
            تعديل بيانات المنشأة، العملة المعتمدة، متابعة الحصص، وإدارة طاقم العمل (كاشير ومدراء)
          </p>
        </div>
      </div>

      <div
        className="settings-layout-grid"
        style={{
          display: 'grid',
          alignItems: 'start',
          marginBottom: '2rem',
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

            <div className="form-grid-2" style={{ display: 'grid' }}>
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

            <div className="form-grid-2" style={{ display: 'grid' }}>
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
                نوع الخطة الحالية:
              </span>
              <span
                className={`badge ${
                  tenant.subscription?.status === 'ACTIVE'
                    ? 'badge-success'
                    : tenant.subscription?.status === 'EXPIRED' || tenant.subscription?.status === 'SUSPENDED'
                    ? 'badge-danger'
                    : 'badge-warning'
                }`}
                style={{ fontSize: '0.85rem' }}
              >
                {tenant.subscription?.status === 'ACTIVE'
                  ? (tenant.subscription?.planNameAr || tenant.subscription?.plan)
                  : tenant.subscription?.status === 'EXPIRED'
                  ? `منتهي الصلاحية (${tenant.subscription?.planNameAr || tenant.subscription?.plan})`
                  : tenant.subscription?.status === 'SUSPENDED'
                  ? 'معلق'
                  : 'غير مشترك (لا توجد باقة نشطة)'}
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
              <span style={{ color: 'var(--text-secondary)' }}>أجهزة الراوتر المسموحة:</span>
              <strong>
                {tenant.subscription?.status === 'ACTIVE'
                  ? `${tenant.subscription?.maxRouters || 1} أجهزة`
                  : '0 أجهزة (يتطلب اشتراك نشط)'}
              </strong>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '0.75rem',
                fontSize: '0.85rem',
              }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>سقف توليد الكروت (شهرياً):</span>
              <strong>
                {tenant.subscription?.status === 'ACTIVE'
                  ? tenant.subscription?.isUnlimited || !tenant.subscription?.maxCardsPerMonth
                    ? 'غير محدود (Unlimited)'
                    : `${Number(tenant.subscription.maxCardsPerMonth).toLocaleString()} كرت`
                  : '0 كرت (يتطلب اشتراك نشط)'}
              </strong>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '0.75rem',
                fontSize: '0.85rem',
              }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>الكروت المستهلكة في الدورة:</span>
              <strong style={{ color: 'var(--accent)' }}>
                {Number(tenant.subscription?.usedCards || 0).toLocaleString()} كرت
              </strong>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '0.75rem',
                fontSize: '0.85rem',
              }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>الرصيد المتبقي:</span>
              <strong style={{ color: 'var(--success)' }}>
                {tenant.subscription?.isUnlimited || tenant.subscription?.maxCardsPerMonth === null
                  ? 'مفتوح'
                  : `${Number(tenant.subscription?.remainingCards ?? Math.max(0, (tenant.subscription?.maxCardsPerMonth ?? 0) - (tenant.subscription?.usedCards || 0))).toLocaleString()} كرت`}
              </strong>
            </div>

            {/* Quota Progress Bar */}
            {!tenant.subscription?.isUnlimited && tenant.subscription?.maxCardsPerMonth && (
              <div style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
                <div
                  style={{
                    height: '6px',
                    width: '100%',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '3px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(
                        100,
                        Math.round(((tenant.subscription.usedCards || 0) / tenant.subscription.maxCardsPerMonth) * 100),
                      )}%`,
                      backgroundColor:
                        (tenant.subscription.usedCards || 0) / tenant.subscription.maxCardsPerMonth > 0.9
                          ? 'var(--danger)'
                          : 'var(--primary)',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    marginTop: '4px',
                  }}
                >
                  <span>
                    نسبة الاستهلاك:{' '}
                    {Math.round(((tenant.subscription.usedCards || 0) / tenant.subscription.maxCardsPerMonth) * 100)}%
                  </span>
                  {tenant.subscription.cycleEnd && (
                    <span>
                      تجديد الحصة:{' '}
                      {new Date(tenant.subscription.cycleEnd).toLocaleDateString('ar-EG', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>صلاحية الترخيص:</span>
              <strong style={{ color: 'var(--success)' }}>
                {tenant.subscription?.expiresAt
                  ? new Date(tenant.subscription.expiresAt).toLocaleDateString('ar-EG', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : 'غير محدد'}
              </strong>
            </div>

            {/* Direct WhatsApp Subscription & Support Actions */}
            <div
              style={{
                marginTop: '1.25rem',
                paddingTop: '1rem',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem',
              }}
            >
              <WhatsAppButton
                type="subscription"
                planName={tenant.subscription?.planNameAr || tenant.subscription?.plan}
                label={
                  tenant.subscription?.status === 'ACTIVE'
                    ? 'تجديد أو ترقية الباقة عبر واتساب'
                    : 'طلب تفعيل الاشتراك عبر واتساب'
                }
                size="md"
              />
              <WhatsAppButton
                type="support"
                label="محادثة الدعم الفني عبر واتساب"
                variant="outline"
                size="md"
              />
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

      {/* Theme & Appearance Section */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sun size={18} color="var(--primary)" />
              مظهر المنصة والسمة (Theme & Appearance)
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', marginTop: '0.25rem' }}>
              اختر الوضع اللوني المفضل لديك، يتم حفظ تفضيلك محلياً ويسري على جميع شاشات المنصة فورياً
            </p>
          </div>
          <span className="badge badge-info">
            {theme === 'dark' ? 'الوضع النشط: الداكن الافتراضي' : 'الوضع النشط: الفاتح العصري'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
          {/* Dark Mode Card */}
          <div
            onClick={() => setTheme('dark')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setTheme('dark'); }}
            style={{
              cursor: 'pointer',
              padding: '1.25rem',
              borderRadius: 'var(--radius-lg)',
              border: `2px solid ${theme === 'dark' ? 'var(--primary)' : 'var(--border)'}`,
              backgroundColor: '#0f172a',
              color: '#f8fafc',
              transition: 'all 0.2s ease',
              boxShadow: theme === 'dark' ? '0 0 0 1px var(--primary), var(--shadow-md)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.95rem' }}>
                <Moon size={18} color="#38bdf8" />
                الوضع الداكن (Dark Mode)
              </div>
              <input
                type="radio"
                name="themeSelect"
                checked={theme === 'dark'}
                onChange={() => setTheme('dark')}
                style={{ cursor: 'pointer' }}
              />
            </div>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>
              المظهر الأزرق الداكن الكلاسيكي مع درجات كحلية عميقة وتناسق عالي التباين للإضاءة المنخفضة
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.5rem' }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: '#0b1120', border: '1px solid #334155' }} />
              <span style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: '#0d9488' }} />
              <span style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: '#38bdf8' }} />
            </div>
          </div>

          {/* Light Mode Card */}
          <div
            onClick={() => setTheme('light')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setTheme('light'); }}
            style={{
              cursor: 'pointer',
              padding: '1.25rem',
              borderRadius: 'var(--radius-lg)',
              border: `2px solid ${theme === 'light' ? 'var(--primary)' : 'var(--border)'}`,
              backgroundColor: '#f8fafc',
              color: '#0f172a',
              transition: 'all 0.2s ease',
              boxShadow: theme === 'light' ? '0 0 0 1px var(--primary), var(--shadow-md)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.95rem' }}>
                <Sun size={18} color="#0d9488" />
                الوضع الفاتح (Light Mode)
              </div>
              <input
                type="radio"
                name="themeSelect"
                checked={theme === 'light'}
                onChange={() => setTheme('light')}
                style={{ cursor: 'pointer' }}
              />
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>
              مظهر فاتح ناصع ومريح للعين، بخلفيات هادئة وتباين فائق الوضوح للقراءة في الأماكن المضاءة
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.5rem' }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: '#ffffff', border: '1px solid #cbd5e1' }} />
              <span style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: '#0d9488' }} />
              <span style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: '#0284c7' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Staff Management Section */}
      <div className="card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.25rem',
          }}
        >
          <div>
            <h3
              style={{
                fontSize: '1.15rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.25rem',
              }}
            >
              <Users size={20} color="var(--primary)" />
              إدارة مستخدمي الشبكة وطاقم العمل
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              إضافة وتعديل وحذف حسابات الكاشير ومدراء الفروع وصلاحياتهم
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => fetchUsers(false)}
              disabled={loadingUsers}
            >
              <RefreshCw size={14} className={loadingUsers ? 'spin' : ''} />
              تحديث
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setIsAddUserOpen(true)}
            >
              <UserPlus size={16} />
              إضافة موظف جديد
            </button>
          </div>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>اسم الموظف</th>
                <th>البريد الإلكتروني</th>
                <th>الدور الوظيفي</th>
                <th>رقم الهاتف</th>
                <th>الحالة</th>
                <th style={{ textAlign: 'left' }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loadingUsers ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                    جاري تحميل قائمة الموظفين...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    لا يوجد موظفون إضافيون حالياً. اضغط على «إضافة موظف جديد» لإضافة كاشير أو مدير فرع.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const roleName = u.role?.name || 'CASHIER';
                  const isManager = roleName === 'MANAGER';
                  const isTenantAdmin = roleName === 'TENANT_ADMIN';
                  const isActive = u.status === 'ACTIVE';

                  return (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 600 }}>{u.fullName}</td>
                      <td style={{ direction: 'ltr', textAlign: 'right', fontFamily: 'monospace' }}>
                        {u.email}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            isTenantAdmin
                              ? 'badge-primary'
                              : isManager
                              ? 'badge-warning'
                              : 'badge-outline'
                          }`}
                        >
                          {isTenantAdmin ? 'مسؤول المنشأة' : isManager ? 'مدير فرع' : 'كاشير مبيعات'}
                        </span>
                      </td>
                      <td style={{ direction: 'ltr', textAlign: 'right' }}>
                        {u.phone || '—'}
                      </td>
                      <td>
                        <span className={`badge ${isActive ? 'badge-success' : 'badge-danger'}`}>
                          {isActive ? 'نشط' : 'معطل'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        {!isTenantAdmin && (
                          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => handleOpenEditUser(u)}
                              title="تعديل بيانات الموظف"
                            >
                              <Edit size={14} />
                              تعديل
                            </button>
                            <button
                              className="btn btn-outline btn-sm"
                              style={{ color: 'var(--danger)', borderColor: 'var(--border)' }}
                              onClick={() => handleDeleteUser(u)}
                              title="حذف الموظف"
                            >
                              <Trash2 size={14} />
                              حذف
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      <Modal
        isOpen={isAddUserOpen}
        onClose={() => setIsAddUserOpen(false)}
        title="إضافة موظف جديد (كاشير / مدير)"
      >
        <form onSubmit={handleCreateUser}>
          <div className="form-group">
            <label className="form-label" htmlFor="u-fullname">
              اسم الموظف الكامل *
            </label>
            <input
              id="u-fullname"
              className="input"
              required
              minLength={3}
              placeholder="مثال: أحمد محمد عثمان"
              value={addUserForm.fullName}
              onChange={(e) => setAddUserForm({ ...addUserForm, fullName: e.target.value })}
            />
          </div>

          <div className="form-grid-2" style={{ display: 'grid' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="u-email">
                البريد الإلكتروني لتسجيل الدخول *
              </label>
              <input
                id="u-email"
                type="email"
                className="input"
                style={{ direction: 'ltr', textAlign: 'left' }}
                required
                placeholder="cashier@network.local"
                value={addUserForm.email}
                onChange={(e) => setAddUserForm({ ...addUserForm, email: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="u-phone">
                رقم هاتف الموظف
              </label>
              <input
                id="u-phone"
                className="input"
                style={{ direction: 'ltr', textAlign: 'left' }}
                placeholder="+249xxxxxxxxx"
                value={addUserForm.phone}
                onChange={(e) => setAddUserForm({ ...addUserForm, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="form-grid-2" style={{ display: 'grid' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="u-pwd">
                كلمة المرور الابتدائية *
              </label>
              <input
                id="u-pwd"
                type="password"
                className="input"
                style={{ direction: 'ltr', textAlign: 'left' }}
                required
                minLength={8}
                placeholder="8 خانات على الأقل"
                value={addUserForm.password}
                onChange={(e) => setAddUserForm({ ...addUserForm, password: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="u-role">
                الدور والصلاحية *
              </label>
              <select
                id="u-role"
                className="select"
                value={addUserForm.roleName}
                onChange={(e) => setAddUserForm({ ...addUserForm, roleName: e.target.value })}
              >
                <option value="CASHIER">كاشير مبيعات (نقطة البيع والطباعة فقط)</option>
                <option value="MANAGER">مدير فرع (إدارة الكروت، المبيعات والراوترات)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setIsAddUserOpen(false)}
            >
              إلغاء
            </button>
            <button type="submit" className="btn btn-primary" disabled={savingUser}>
              <UserPlus size={16} />
              {savingUser ? 'جاري الإضافة...' : 'إضافة الموظف الآن'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={Boolean(editingUser)}
        onClose={() => setEditingUser(null)}
        title={`تعديل بيانات الموظف: ${editingUser?.fullName || ''}`}
      >
        <form onSubmit={handleUpdateUser}>
          <div className="form-group">
            <label className="form-label" htmlFor="eu-fullname">
              الاسم الكامل *
            </label>
            <input
              id="eu-fullname"
              className="input"
              required
              minLength={3}
              value={editUserForm.fullName}
              onChange={(e) => setEditUserForm({ ...editUserForm, fullName: e.target.value })}
            />
          </div>

          <div className="form-grid-2" style={{ display: 'grid' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="eu-phone">
                رقم الهاتف
              </label>
              <input
                id="eu-phone"
                className="input"
                style={{ direction: 'ltr', textAlign: 'left' }}
                value={editUserForm.phone}
                onChange={(e) => setEditUserForm({ ...editUserForm, phone: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="eu-role">
                الدور الوظيفي
              </label>
              <select
                id="eu-role"
                className="select"
                value={editUserForm.roleName}
                onChange={(e) => setEditUserForm({ ...editUserForm, roleName: e.target.value })}
              >
                <option value="CASHIER">كاشير مبيعات</option>
                <option value="MANAGER">مدير فرع</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="eu-status">
              حالة الحساب
            </label>
            <select
              id="eu-status"
              className="select"
              value={editUserForm.status}
              onChange={(e) => setEditUserForm({ ...editUserForm, status: e.target.value })}
            >
              <option value="ACTIVE">نشط (يمكنه تسجيل الدخول)</option>
              <option value="INACTIVE">معطل (محظور من الدخول)</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setEditingUser(null)}
            >
              إلغاء
            </button>
            <button type="submit" className="btn btn-primary" disabled={savingUser}>
              <Save size={16} />
              {savingUser ? 'جاري الحفظ...' : 'حفظ التعديلات'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
