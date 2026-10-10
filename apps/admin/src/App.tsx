import React, { useState, Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './core/context/AuthContext';
import { ToastProvider } from './core/context/ToastContext';
import { Navbar } from './components/layout/Navbar';
import { Sidebar, NavigationTab } from './components/layout/Sidebar';
import { LoginView } from './modules/auth/LoginView';
import { DashboardView } from './modules/dashboard/DashboardView';

// Code-split heavy modules to reduce initial JS bundle size and accelerate startup
const DevicesView = lazy(() =>
  import('./modules/devices/DevicesView').then((m) => ({ default: m.DevicesView })),
);
const HotspotProfilesView = lazy(() =>
  import('./modules/hotspot/HotspotProfilesView').then((m) => ({ default: m.HotspotProfilesView })),
);
const CardsView = lazy(() =>
  import('./modules/cards/CardsView').then((m) => ({ default: m.CardsView })),
);
const PrintStudioView = lazy(() =>
  import('./modules/print-studio/PrintStudioView').then((m) => ({ default: m.PrintStudioView })),
);
const PosTerminalView = lazy(() =>
  import('./modules/pos/PosTerminalView').then((m) => ({ default: m.PosTerminalView })),
);
const SalesInvoicesView = lazy(() =>
  import('./modules/sales/SalesInvoicesView').then((m) => ({ default: m.SalesInvoicesView })),
);
const ReportsView = lazy(() =>
  import('./modules/reports/ReportsView').then((m) => ({ default: m.ReportsView })),
);
const AuditLogsView = lazy(() =>
  import('./modules/audit/AuditLogsView').then((m) => ({ default: m.AuditLogsView })),
);
const TenantSettingsView = lazy(() =>
  import('./modules/settings/TenantSettingsView').then((m) => ({ default: m.TenantSettingsView })),
);

const ViewLoadingFallback: React.FC = () => (
  <div
    style={{
      minHeight: '350px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1rem',
      color: 'var(--text-secondary)',
    }}
  >
    <div
      style={{
        width: 36,
        height: 36,
        border: '3px solid var(--border)',
        borderTopColor: 'var(--primary)',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }}
    />
    <span style={{ fontSize: '0.875rem' }}>جاري تحميل الصفحة والمكونات...</span>
  </div>
);

const AdminLayout: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [currentTab, setCurrentTab] = useState<NavigationTab>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const handleToggleSidebar = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      setMobileMenuOpen(!mobileMenuOpen);
    } else {
      setSidebarCollapsed(!sidebarCollapsed);
    }
  };

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-app)',
          color: 'var(--text-secondary)',
          fontSize: '1rem',
        }}
      >
        جاري تحميل نظام ميكروتيك...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginView />;
  }

  const renderActiveView = () => {
    switch (currentTab) {
      case 'dashboard':
        return <DashboardView onNavigate={(tab) => setCurrentTab(tab)} />;
      case 'devices':
        return <DevicesView />;
      case 'hotspot':
        return <HotspotProfilesView />;
      case 'cards':
        return <CardsView onNavigate={(tab) => setCurrentTab(tab as any)} />;
      case 'print':
        return <PrintStudioView />;
      case 'pos':
        return <PosTerminalView />;
      case 'sales':
        return <SalesInvoicesView />;
      case 'reports':
        return <ReportsView />;
      case 'audit':
        return <AuditLogsView />;
      case 'settings':
        return <TenantSettingsView />;
      default:
        return <DashboardView onNavigate={(tab) => setCurrentTab(tab)} />;
    }
  };

  return (
    <div className="app-container">
      {mobileMenuOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          role="presentation"
          aria-hidden="true"
        />
      )}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={(tab) => {
          setCurrentTab(tab);
          setMobileMenuOpen(false);
        }}
        collapsed={sidebarCollapsed}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />
      <div className="main-content">
        <Navbar onToggleSidebar={handleToggleSidebar} />
        <main className="page-body">
          <Suspense fallback={<ViewLoadingFallback />}>
            {renderActiveView()}
          </Suspense>
        </main>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <ToastProvider>
        <AdminLayout />
      </ToastProvider>
    </AuthProvider>
  );
};

export default App;
