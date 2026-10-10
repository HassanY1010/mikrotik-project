import React, { useEffect, useState } from 'react';
import { useAuth } from '../../core/context/AuthContext';
import { LogOut, User as UserIcon, Building2, Wifi, Menu } from 'lucide-react';
import { apiClient } from '../../core/api/api-client';

interface NavbarProps {
  onToggleSidebar: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar }) => {
  const { user, logout, activeTenantId, switchTenant } = useAuth();
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    // Check live health
    apiClient
      .get<{ status: string }>('/health/live')
      .then((res) => setIsOnline(res?.status === 'ok'))
      .catch(() => setIsOnline(false));

    // If super admin, fetch tenants for switcher
    if (user?.role === 'SUPER_ADMIN') {
      apiClient
        .get<Array<{ id: string; name: string }>>('/tenants')
        .then((data) => {
          if (Array.isArray(data)) {
            setTenants(data.map((t) => ({ id: t.id, name: t.name })));
          }
        })
        .catch(() => {});
    }
  }, [user]);

  return (
    <header className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          className="btn btn-outline btn-icon"
          onClick={onToggleSidebar}
          aria-label="تبديل القائمة الجانبية"
        >
          <Menu size={18} />
        </button>

        <div className="navbar-brand-group" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--primary-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary)',
            }}
          >
            <Wifi size={18} />
          </div>
          <div className="navbar-brand-text">
            <h2 className="navbar-brand-title" style={{ fontSize: '1.05rem', fontWeight: 800 }}>منصة شبكات ميكروتك</h2>
            <div className="navbar-brand-subtitle" style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
              إدارة كروت الهوتسبوت والفوترة
            </div>
          </div>
        </div>

        {/* Tenant Switcher (Super Admin) */}
        {user?.role === 'SUPER_ADMIN' && tenants.length > 0 && (
          <div
            className="navbar-tenant-switcher"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '1.5rem' }}
          >
            <Building2 size={16} color="var(--accent)" />
            <select
              className="select"
              style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
              value={activeTenantId || ''}
              onChange={(e) => switchTenant(e.target.value)}
            >
              <option value="">جميع المستأجرين (عرض شامل)</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="navbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {/* API Health Pill */}
        <div
          className="navbar-health-pill"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.3rem 0.7rem',
            borderRadius: 'var(--radius-full)',
            backgroundColor: isOnline ? 'var(--success-bg)' : 'var(--danger-bg)',
            border: `1px solid ${isOnline ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            fontSize: '0.75rem',
            fontWeight: 700,
            color: isOnline ? 'var(--success)' : 'var(--danger)',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: isOnline ? 'var(--success)' : 'var(--danger)',
              flexShrink: 0,
            }}
          />
          <span className="navbar-health-text">{isOnline ? 'الخادم متصل' : 'الخادم غير متصل'}</span>
        </div>

        {/* User Profile Badge */}
        <div className="navbar-user-badge" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              backgroundColor: 'var(--bg-card-hover)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--border)',
              flexShrink: 0,
            }}
          >
            <UserIcon size={16} color="var(--primary)" />
          </div>
          <div className="navbar-user-text" style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.825rem', fontWeight: 700 }}>
              {user?.fullName || 'المستخدم'}
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {user?.role === 'SUPER_ADMIN'
                ? 'مدير النظام العام'
                : user?.role === 'TENANT_ADMIN'
                  ? 'مدير الشبكة'
                  : 'كاشير نقطة البيع'}
            </span>
          </div>
        </div>

        {/* Logout Button */}
        <button
          className="btn btn-outline btn-icon"
          onClick={logout}
          title="تسجيل الخروج"
          style={{ color: 'var(--danger)' }}
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
};
