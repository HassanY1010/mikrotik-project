import React from 'react';
import {
  LayoutDashboard,
  Router,
  Zap,
  Network,
  CreditCard,
  Printer,
  ShoppingBag,
  Receipt,
  BarChart3,
  ShieldCheck,
  Settings,
  Globe,
  Building2,
  Layers,
  Palette,
} from 'lucide-react';
import { useAuth } from '../../core/context/AuthContext';

export type NavigationTab =
  | 'super-overview'
  | 'super-tenants'
  | 'super-plans'
  | 'super-subscriptions'
  | 'dashboard'
  | 'devices'
  | 'hotspot'
  | 'portal'
  | 'pppoe'
  | 'cards'
  | 'print'
  | 'pos'
  | 'sales'
  | 'reports'
  | 'audit'
  | 'settings';

interface SidebarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  collapsed: boolean;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  collapsed,
  mobileOpen,
  onCloseMobile,
}) => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const superAdminNavItems = [
    { id: 'super-overview' as NavigationTab, label: 'لوحة المنصة (Overview)', icon: Globe },
    { id: 'super-tenants' as NavigationTab, label: 'أصحاب الشبكات (Tenants)', icon: Building2 },
    { id: 'super-plans' as NavigationTab, label: 'باقات الاشتراك (Plans)', icon: Layers },
    { id: 'super-subscriptions' as NavigationTab, label: 'اشتراكات العملاء', icon: CreditCard },
  ];

  const operationalNavItems = [
    { id: 'dashboard' as NavigationTab, label: 'لوحة التحكم والتحليلات', icon: LayoutDashboard },
    { id: 'devices' as NavigationTab, label: 'أجهزة وموجهات ميكروتك', icon: Router },
    { id: 'hotspot' as NavigationTab, label: 'باقات وسرعات الهوتسبوت', icon: Zap },
    { id: 'portal' as NavigationTab, label: 'مصمم صفحات HotSpot', icon: Palette },
    { id: 'pppoe' as NavigationTab, label: 'اشتراكات النطاق العريض (PPPoE)', icon: Network },
    { id: 'cards' as NavigationTab, label: 'مخزون وتوليد الكروت', icon: CreditCard },
    { id: 'print' as NavigationTab, label: 'استوديو طباعة الكروت', icon: Printer },
    { id: 'pos' as NavigationTab, label: 'نقطة البيع السريعة', icon: ShoppingBag },
    { id: 'sales' as NavigationTab, label: 'فواتير ومبيعات الكروت', icon: Receipt },
    { id: 'reports' as NavigationTab, label: 'التقارير المالية والورديات', icon: BarChart3 },
    { id: 'audit' as NavigationTab, label: 'سجل التدقيق والأمان', icon: ShieldCheck },
    { id: 'settings' as NavigationTab, label: 'إعدادات الشبكة والنظام', icon: Settings },
  ];

  const renderNavList = (items: typeof operationalNavItems) => (
    <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = currentTab === item.id;

        return (
          <li key={item.id}>
            <button
              onClick={() => {
                onSelectTab(item.id);
                if (onCloseMobile) onCloseMobile();
              }}
              title={collapsed ? item.label : undefined}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: collapsed ? '0.75rem' : '0.65rem 0.85rem',
                justifyContent: collapsed ? 'center' : 'flex-start',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                backgroundColor: isActive ? 'var(--primary-light)' : 'transparent',
                color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'var(--transition)',
                textAlign: 'right',
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }
              }}
            >
              {isActive && (
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '15%',
                    height: '70%',
                    width: 3,
                    backgroundColor: 'var(--primary)',
                    borderRadius: '0 4px 4px 0',
                  }}
                />
              )}
              <Icon size={19} color={isActive ? 'var(--primary)' : 'currentColor'} />
              {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
      <div
        style={{
          padding: '1.25rem 1rem',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}
      >
        <img
          src="/sudafi_hero.jpg"
          alt="SudaFi Logo"
          style={{
            width: 38,
            height: 38,
            borderRadius: 'var(--radius-md)',
            objectFit: 'cover',
            boxShadow: 'var(--shadow-glow)',
            flexShrink: 0,
            border: '1px solid rgba(13, 148, 136, 0.4)',
          }}
        />
        {!collapsed && (
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              سودافاي | SudaFi
            </div>
            <div style={{ fontSize: '0.7rem', color: isSuperAdmin ? 'var(--accent)' : 'var(--text-muted)' }}>
              {isSuperAdmin ? 'إدارة المنصة المركزية ★' : 'إدارة شبكات ميكروتك الذكية'}
            </div>
          </div>
        )}
      </div>

      <nav style={{ padding: '0.75rem 0.5rem', flex: 1, overflowY: 'auto' }}>
        {isSuperAdmin && (
          <div style={{ marginBottom: '1rem' }}>
            {!collapsed && (
              <div
                style={{
                  fontSize: '0.675rem',
                  fontWeight: 800,
                  color: 'var(--accent)',
                  padding: '0.25rem 0.75rem 0.5rem',
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                }}
              >
                إدارة المنصة (Super Admin)
              </div>
            )}
            {renderNavList(superAdminNavItems)}
            <div
              style={{
                margin: '0.75rem 0.5rem',
                borderBottom: '1px solid var(--border)',
              }}
            />
            {!collapsed && (
              <div
                style={{
                  fontSize: '0.675rem',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  padding: '0.25rem 0.75rem 0.5rem',
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                }}
              >
                إدارة الشبكة التشغيلية
              </div>
            )}
          </div>
        )}

        {renderNavList(operationalNavItems)}
      </nav>

      {!collapsed && (
        <div
          style={{
            padding: '1rem',
            borderTop: '1px solid var(--border)',
            fontSize: '0.725rem',
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}
        >
          جميع الحقوق محفوظة © 2026
        </div>
      )}
    </aside>
  );
};
