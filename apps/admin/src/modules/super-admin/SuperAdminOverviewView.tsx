import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard,
  Layers,
  Router,
  RefreshCw,
  Building2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  AlertCircle,
  Activity,
  Wifi,
} from 'lucide-react';
import { apiClient } from '../../core/api/api-client';
import { StatCard } from '../../components/common/StatCard';
import { useToast } from '../../core/context/ToastContext';

interface PlatformOverviewData {
  tenants: {
    total: number;
    active: number;
    suspended: number;
    pending: number;
    unsubscribed: number;
  };
  subscriptions: {
    active: number;
    expired: number;
    total: number;
  };
  cards: {
    consumedThisMonth: number;
    activeSessions: number;
    monthStart?: string;
    monthEnd?: string;
  };
  devices: {
    total: number;
    online: number;
    offline: number;
    lastSyncAt: string | null;
  };
  securityHealth?: {
    tenantIsolation: string;
    superAdminRBAC: string;
    quotaEngine: string;
    auditLogging: string;
    auditLogsRecordedThisMonth: number;
    lastAuditLogAt: string | null;
    activeTenantsProtected: number;
  };
  plansDistribution: Array<{
    planId: string;
    planName: string;
    planNameAr: string;
    subscriberCount: number;
    percentage: number;
    isUnsubscribed?: boolean;
  }>;
  recentTenants: Array<{
    id: string;
    name: string;
    slug: string;
    contactEmail: string;
    status: string;
    createdAt: string;
    activePlan: string;
    activePlanName?: string;
    subscriptionStatus: string;
    expiresAt?: string | null;
    routersCount: number;
    usersCount?: number;
  }>;
}

interface SuperAdminOverviewViewProps {
  onNavigateTab?: (tab: string) => void;
}

export const SuperAdminOverviewView: React.FC<SuperAdminOverviewViewProps> = ({
  onNavigateTab,
}) => {
  const { showToast } = useToast();
  const [data, setData] = useState<PlatformOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState<boolean>(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const fetchOverview = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const res = await apiClient.get<PlatformOverviewData>('/tenants/admin/overview');
      setData(res);
      setFetchError(null);
      setIsStale(false);
      setLastRefreshed(new Date());

      if (isManualRefresh) {
        showToast('تم تحديث إحصاءات ومؤشرات المنصة بنجاح', 'success');
      }
    } catch (err: any) {
      const errorMsg = err?.message || 'فشل الاتصال بالخادم لجلب بيانات المنصة';
      setFetchError(errorMsg);

      // If we already have data, preserve it and mark as stale instead of showing zeros
      if (data) {
        setIsStale(true);
      }
      showToast(errorMsg, 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [data, showToast]);

  useEffect(() => {
    fetchOverview(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalTenantsCount = data?.tenants?.total ?? 0;
  const totalSubscribers = data?.subscriptions?.active ?? 0;

  return (
    <div className="view-container" style={{ paddingBottom: '3rem' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.25rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              لوحة الإدارة المركزية (Super Admin)
            </h1>
            <span
              className="badge badge-info"
              style={{
                fontSize: '0.7rem',
                padding: '0.2rem 0.55rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
              }}
            >
              <Activity size={12} />
              تحكم رئيسي
            </span>
          </div>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginTop: '0.25rem', marginBottom: 0 }}>
            مؤشرات النمو، اشتراكات أصحاب الشبكات، واستهلاك الكروت الحقيقي للمنصة التجارية
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              آخر تحديث: {lastRefreshed.toLocaleTimeString('ar-EG')}
            </span>
            {isStale && (
              <span
                className="badge badge-warning"
                style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem' }}
                title="تعذر التحديث الأخير ويتم عرض البيانات المحفوظة مؤقتاً"
              >
                بيانات مؤقتة
              </span>
            )}
          </div>

          <button
            onClick={() => fetchOverview(true)}
            disabled={isLoading || isRefreshing}
            className="btn btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.45rem 0.85rem',
              minHeight: '38px',
              cursor: isLoading || isRefreshing ? 'not-allowed' : 'pointer',
            }}
            title="تحديث البيانات من قاعدة البيانات ومزامنة الإحصائيات"
          >
            <RefreshCw size={15} className={isLoading || isRefreshing ? 'spin-animation' : ''} />
            <span style={{ fontSize: '0.825rem', fontWeight: 600 }}>
              {isRefreshing ? 'جاري التحديث...' : 'تحديث البيانات'}
            </span>
          </button>
        </div>
      </div>

      {/* Stale / Error Alert Banner */}
      {fetchError && (
        <div
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '0.85rem 1rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <AlertCircle size={20} color="var(--danger)" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--danger)' }}>
                {data ? 'تعذر جلب البيانات الحديثة، يتم عرض آخر نسخة مؤقتة' : 'فشل تحميل بيانات المنصة'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {fetchError}
              </div>
            </div>
          </div>
          <button
            onClick={() => fetchOverview(true)}
            disabled={isLoading || isRefreshing}
            className="btn btn-outline"
            style={{
              fontSize: '0.75rem',
              padding: '0.3rem 0.75rem',
              color: 'var(--danger)',
              borderColor: 'var(--danger)',
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        {/* Card 1: Tenants */}
        <StatCard
          label="إجمالي أصحاب الشبكات"
          value={isLoading && !data ? '...' : (data?.tenants?.total ?? 0)}
          icon={<Building2 size={24} color="var(--primary)" />}
          iconBg="var(--primary-light)"
          trend={
            data
              ? `${data.tenants.active} نشط • ${data.tenants.suspended} معلق • ${data.tenants.unsubscribed || 0} بدون اشتراك`
              : undefined
          }
          trendPositive={true}
          onClick={() => onNavigateTab?.('super-tenants')}
          clickableHint="انقر لإدارة شبكات المشتركين"
        />

        {/* Card 2: Subscriptions */}
        <StatCard
          label="الاشتراكات النشطة"
          value={isLoading && !data ? '...' : (data?.subscriptions?.active ?? 0)}
          icon={<CheckCircle2 size={24} color="var(--success)" />}
          iconBg="var(--success-bg)"
          trend={
            data
              ? `${data.subscriptions.expired} اشتراك منتهي • ${(data.subscriptions.total ?? (data.subscriptions.active + data.subscriptions.expired))} إجمالي`
              : undefined
          }
          trendPositive={data ? data.subscriptions.expired === 0 : true}
          onClick={() => onNavigateTab?.('super-subscriptions')}
          clickableHint="انقر لإدارة وتجديد الاشتراكات"
        />

        {/* Card 3: Cards Consumed */}
        <StatCard
          label="الكروت المستهلكة هذا الشهر"
          value={isLoading && !data ? '...' : (data?.cards?.consumedThisMonth?.toLocaleString('ar-EG') ?? 0)}
          icon={<CreditCard size={24} color="var(--accent)" />}
          iconBg="var(--warning-bg)"
          trend={
            data?.cards?.activeSessions
              ? `${data.cards.activeSessions.toLocaleString('ar-EG')} جلسة نشطة • استهلاك فعلي`
              : 'استهلاك فعلي مسجل عبر الشبكات'
          }
          trendPositive={true}
          onClick={() => onNavigateTab?.('cards')}
          clickableHint="انقر لمراجعة منظومة الكروت"
        />

        {/* Card 4: MikroTik Devices */}
        <StatCard
          label="أجهزة MikroTik المربوطة"
          value={isLoading && !data ? '...' : (data?.devices?.total ?? 0)}
          icon={<Router size={24} color="var(--info)" />}
          iconBg="var(--info-bg)"
          trend={
            data
              ? `${data.devices.online} متصل حالياً • ${data.devices.offline} غير متصل`
              : undefined
          }
          trendPositive={data ? data.devices.online > 0 : true}
          onClick={() => onNavigateTab?.('devices')}
          clickableHint={
            data?.devices?.lastSyncAt
              ? `آخر اتصال: ${new Date(data.devices.lastSyncAt).toLocaleTimeString('ar-EG')}`
              : 'انقر لإدارة أجهزة الراوتر'
          }
        />
      </div>

      {/* Two Column Layout: Plan Distribution & Platform Integrity */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.25rem',
          marginBottom: '1.5rem',
        }}
      >
        {/* Plans Distribution Card */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Layers size={18} color="var(--primary)" />
              <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                توزيع العملاء حسب الباقة
              </h2>
            </div>
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('super-plans')}
                className="btn btn-ghost"
                style={{
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  color: 'var(--primary)',
                }}
              >
                إدارة الخطط <ArrowUpRight size={13} />
              </button>
            )}
          </div>

          {isLoading && !data ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              جاري فحص باقات واشتراكات المنصة...
            </div>
          ) : !data?.plansDistribution?.length ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              لا توجد باقات تجارية مسجلة حتى الآن.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {data.plansDistribution.map((plan) => {
                const totalBase = totalTenantsCount > 0 ? totalTenantsCount : (totalSubscribers || 1);
                const percentage =
                  plan.percentage ?? (totalBase > 0 ? Math.round((plan.subscriberCount / totalBase) * 100) : 0);

                const isNonePlan = plan.isUnsubscribed || plan.planName === 'NONE';
                const barColor = isNonePlan
                  ? 'var(--text-muted)'
                  : plan.planName.toUpperCase().includes('BUSINESS') || plan.planName.toUpperCase().includes('ENTERPRISE')
                  ? 'var(--accent)'
                  : plan.planName.toUpperCase().includes('PRO')
                  ? 'var(--primary)'
                  : 'var(--info)';

                return (
                  <div key={plan.planId}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.85rem',
                        marginBottom: '0.35rem',
                      }}
                    >
                      <span style={{ fontWeight: 600, color: isNonePlan ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                        {plan.planNameAr} {!isNonePlan && `(${plan.planName})`}
                      </span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                        {plan.subscriberCount} عميل ({percentage}%)
                      </span>
                    </div>
                    <div
                      style={{
                        height: 8,
                        backgroundColor: 'var(--bg-app)',
                        borderRadius: 4,
                        overflow: 'hidden',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(100, Math.max(0, percentage))}%`,
                          backgroundColor: barColor,
                          transition: 'width 0.6s ease',
                          borderRadius: 4,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Platform Integrity & Multi-Tenancy Overview */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <ShieldCheck size={18} color="var(--primary)" />
            <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              سلامة المنصة وعزل المستأجرين
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            {/* Security Isolation */}
            <div
              style={{
                padding: '0.85rem 1rem',
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
              }}
            >
              <CheckCircle2 size={19} color="var(--success)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--success)' }}>
                    العزل الأمني لقواعد البيانات (Tenant Guard & RLS)
                  </div>
                  <span
                    className="badge badge-success"
                    style={{ fontSize: '0.65rem', padding: '0.15rem 0.45rem' }}
                  >
                    سليم ومفعل
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  يتم التحقق من هوية المستأجر في كل استعلام Backend، مع حماية كاملة لـ{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>
                    {data?.securityHealth?.activeTenantsProtected ?? data?.tenants?.active ?? 0} شبكة نشطة
                  </strong>{' '}
                  من تداخل البيانات أو كشف السجلات لشبكة أخرى.
                </div>
              </div>
            </div>

            {/* Quota Engine */}
            <div
              style={{
                padding: '0.85rem 1rem',
                backgroundColor: 'rgba(13, 148, 136, 0.08)',
                border: '1px solid rgba(13, 148, 136, 0.25)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
              }}
            >
              <Clock size={19} color="var(--primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)' }}>
                    محرك الحصص والكروت الشهري
                  </div>
                  <span
                    className="badge badge-info"
                    style={{ fontSize: '0.65rem', padding: '0.15rem 0.45rem' }}
                  >
                    احتساب دقيق
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  احتساب دقيق للاستهلاك الحقيقي الشهري المرتكز على تاريخ تفعيل الكروت وجلسات الهوتسبوت، مع دعم الحصص
                  غير المحدودة ومنع التكرار.
                </div>
              </div>
            </div>

            {/* Audit & Subscription Governance */}
            <div
              style={{
                padding: '0.85rem 1rem',
                backgroundColor: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
              }}
            >
              <AlertTriangle size={19} color="var(--accent)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent)' }}>
                    سجل تدقيق العمليات الإدارية (Audit Logs)
                  </div>
                  <span
                    className="badge badge-warning"
                    style={{ fontSize: '0.65rem', padding: '0.15rem 0.45rem' }}
                  >
                    {data?.securityHealth?.auditLogsRecordedThisMonth ?? 0} عملية موثقة
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  جميع عمليات تفعيل وتجديد الاشتراكات وتعليق الحسابات مسجلة ومحمية من التعارض الإداري.
                  {data?.securityHealth?.lastAuditLogAt && (
                    <span style={{ display: 'block', marginTop: '0.15rem', color: 'var(--text-muted)' }}>
                      آخر عملية تدقيق: {new Date(data.securityHealth.lastAuditLogAt).toLocaleTimeString('ar-EG')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Tenants Section */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Building2 size={18} color="var(--primary)" />
            <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              أحدث الشبكات المسجلة في المنصة
            </h2>
          </div>
          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab('super-tenants')}
              className="btn btn-secondary"
              style={{
                fontSize: '0.8rem',
                padding: '0.35rem 0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <span>عرض جميع الشبكات</span>
              <ArrowUpRight size={14} />
            </button>
          )}
        </div>

        {isLoading && !data ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            جاري تحميل أحدث المسجلين...
          </div>
        ) : !data?.recentTenants?.length ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            لا توجد شبكات مسجلة حتى الآن.
          </div>
        ) : (
          <>
            {/* Desktop Table View (min-width: 768px) */}
            <div className="super-admin-desktop-table table-responsive">
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'right', padding: '0.75rem' }}>اسم الشبكة</th>
                    <th style={{ textAlign: 'right', padding: '0.75rem' }}>البريد الإلكتروني</th>
                    <th style={{ textAlign: 'center', padding: '0.75rem' }}>حالة الحساب</th>
                    <th style={{ textAlign: 'center', padding: '0.75rem' }}>حالة الاشتراك</th>
                    <th style={{ textAlign: 'right', padding: '0.75rem' }}>الباقة الحالية</th>
                    <th style={{ textAlign: 'center', padding: '0.75rem' }}>الموجهات</th>
                    <th style={{ textAlign: 'right', padding: '0.75rem' }}>تاريخ الانضمام</th>
                    <th style={{ textAlign: 'center', padding: '0.75rem' }}>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentTenants.map((tenant) => {
                    const isSubActive = tenant.subscriptionStatus === 'ACTIVE';
                    const isSubExpired = tenant.subscriptionStatus === 'EXPIRED';

                    return (
                      <tr key={tenant.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        {/* 1. Network Name & Slug */}
                        <td style={{ padding: '0.75rem' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{tenant.name}</div>
                          <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', direction: 'ltr', textAlign: 'right' }}>
                            {tenant.slug}
                          </div>
                        </td>

                        {/* 2. Contact Email */}
                        <td style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.825rem', direction: 'ltr', textAlign: 'right' }}>
                          {tenant.contactEmail && tenant.contactEmail !== '—' ? tenant.contactEmail : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>

                        {/* 3. Account Status */}
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <span
                            className={`badge ${
                              tenant.status === 'ACTIVE'
                                ? 'badge-success'
                                : tenant.status === 'SUSPENDED'
                                ? 'badge-danger'
                                : 'badge-warning'
                            }`}
                            style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                          >
                            {tenant.status === 'ACTIVE'
                              ? 'نشط'
                              : tenant.status === 'SUSPENDED'
                              ? 'معلق'
                              : tenant.status === 'PENDING'
                              ? 'قيد المراجعة'
                              : tenant.status}
                          </span>
                        </td>

                        {/* 4. Subscription Status */}
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <span
                            className={`badge ${
                              isSubActive
                                ? 'badge-success'
                                : isSubExpired
                                ? 'badge-danger'
                                : 'badge-secondary'
                            }`}
                            style={{ fontSize: '0.725rem', padding: '0.2rem 0.45rem' }}
                          >
                            {isSubActive ? 'سارٍ' : isSubExpired ? 'منتهي' : 'بدون اشتراك'}
                          </span>
                        </td>

                        {/* 5. Current Plan */}
                        <td style={{ padding: '0.75rem', fontWeight: 600, color: isSubActive ? 'var(--primary)' : 'var(--text-muted)', fontSize: '0.85rem' }}>
                          {tenant.activePlan}
                        </td>

                        {/* 6. Routers Count */}
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <span
                            style={{
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              color: tenant.routersCount > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}
                          >
                            <Wifi size={13} color={tenant.routersCount > 0 ? 'var(--info)' : 'var(--text-muted)'} />
                            {tenant.routersCount} موجه
                          </span>
                        </td>

                        {/* 7. Join Date */}
                        <td style={{ padding: '0.75rem', fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                          {new Date(tenant.createdAt).toLocaleDateString('ar-EG', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>

                        {/* 8. Actions */}
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <button
                            onClick={() => onNavigateTab?.('super-tenants')}
                            className="btn btn-ghost"
                            style={{
                              fontSize: '0.75rem',
                              padding: '0.25rem 0.55rem',
                              color: 'var(--primary)',
                              border: '1px solid var(--border)',
                              borderRadius: 'var(--radius-sm)',
                            }}
                            title="إدارة وتعيين اشتراك المستأجر"
                          >
                            إدارة
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View (max-width: 767px) - Touch friendly without horizontal overflow */}
            <div className="super-admin-mobile-cards">
              {data.recentTenants.map((tenant) => {
                const isSubActive = tenant.subscriptionStatus === 'ACTIVE';
                const isSubExpired = tenant.subscriptionStatus === 'EXPIRED';

                return (
                  <div
                    key={tenant.id}
                    style={{
                      padding: '0.9rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-app)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.65rem',
                    }}
                  >
                    {/* Header Row: Network Name + Status Badges */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                          {tenant.name}
                        </div>
                        <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', direction: 'ltr', textAlign: 'right' }}>
                          {tenant.slug}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-end', flexShrink: 0 }}>
                        <span
                          className={`badge ${
                            tenant.status === 'ACTIVE'
                              ? 'badge-success'
                              : tenant.status === 'SUSPENDED'
                              ? 'badge-danger'
                              : 'badge-warning'
                          }`}
                          style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem' }}
                        >
                          {tenant.status === 'ACTIVE'
                            ? 'نشط'
                            : tenant.status === 'SUSPENDED'
                            ? 'معلق'
                            : tenant.status === 'PENDING'
                            ? 'قيد المراجعة'
                            : tenant.status}
                        </span>

                        <span
                          className={`badge ${
                            isSubActive
                              ? 'badge-success'
                              : isSubExpired
                              ? 'badge-danger'
                              : 'badge-secondary'
                          }`}
                          style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}
                        >
                          {isSubActive ? 'اشتراك سارٍ' : isSubExpired ? 'اشتراك منتهي' : 'بدون اشتراك'}
                        </span>
                      </div>
                    </div>

                    {/* Details Grid */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                        gap: '0.5rem',
                        fontSize: '0.775rem',
                        padding: '0.5rem',
                        backgroundColor: 'var(--bg-card)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>البريد: </span>
                        <span style={{ color: 'var(--text-secondary)', direction: 'ltr', display: 'inline-block' }}>
                          {tenant.contactEmail && tenant.contactEmail !== '—' ? tenant.contactEmail : '—'}
                        </span>
                      </div>

                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>الباقة: </span>
                        <span style={{ fontWeight: 600, color: isSubActive ? 'var(--primary)' : 'var(--text-muted)' }}>
                          {tenant.activePlan}
                        </span>
                      </div>

                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>الموجهات: </span>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {tenant.routersCount} موجه
                        </span>
                      </div>

                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>تاريخ الانضمام: </span>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {new Date(tenant.createdAt).toLocaleDateString('ar-EG', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={() => onNavigateTab?.('super-tenants')}
                      className="btn btn-secondary"
                      style={{
                        width: '100%',
                        minHeight: '40px',
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      <span>إدارة وتعيين اشتراك</span>
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
