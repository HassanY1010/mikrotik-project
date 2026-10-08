import React, { useState } from 'react';
import { AuthProvider, useAuth } from './core/context/AuthContext';
import { ToastProvider } from './core/context/ToastContext';
import { Navbar } from './components/layout/Navbar';
import { Sidebar, NavigationTab } from './components/layout/Sidebar';
import { LoginView } from './modules/auth/LoginView';
import { DashboardView } from './modules/dashboard/DashboardView';
import { DevicesView } from './modules/devices/DevicesView';
import { HotspotProfilesView } from './modules/hotspot/HotspotProfilesView';
import { CardsView } from './modules/cards/CardsView';
import { PrintStudioView } from './modules/print-studio/PrintStudioView';
import { PosTerminalView } from './modules/pos/PosTerminalView';
import { SalesInvoicesView } from './modules/sales/SalesInvoicesView';
import { ReportsView } from './modules/reports/ReportsView';
import { AuditLogsView } from './modules/audit/AuditLogsView';
import { TenantSettingsView } from './modules/settings/TenantSettingsView';

const AdminLayout: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [currentTab, setCurrentTab] = useState<NavigationTab>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

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
      <Sidebar currentTab={currentTab} onSelectTab={setCurrentTab} collapsed={sidebarCollapsed} />
      <div className="main-content">
        <Navbar onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)} />
        <main className="page-body">{renderActiveView()}</main>
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
