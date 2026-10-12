import React, { useState, useEffect } from 'react';
import {
  Users,
  CreditCard,
  Layers,
  Router,
  RefreshCw,
  Building2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowUpRight,
} from 'lucide-react';
import { apiClient } from '../../core/api/api-client';
import { StatCard } from '../../components/common/StatCard';
import { useToast } from '../../core/context/ToastContext';

interface PlatformOverviewData {
  tenants: {
    total: number;
    active: number;
    suspended: number;
  };
  subscriptions: {
    active: number;
    expired: number;
  };
  cards: {
    consumedThisMonth: number;
  };
  devices: {
    total: number;
    online: number;
    offline: number;
  };
  plansDistribution: Array<{
    planId: string;
    planName: string;
    planNameAr: string;
    subscriberCount: number;
  }>;
  recentTenants: Array<{
    id: string;
    name: string;
    slug: string;
    contactEmail: string | null;
    status: string;
    createdAt: string;
    activePlan: string;
    routersCount: number;
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
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const fetchOverview = async (showSuccessToast = false) => {
    setIsLoading(true);
    try {
      const res = await apiClient.get<PlatformOverviewData>('/tenants/admin/overview');
      setData(res);
      setLastRefreshed(new Date());
      if (showSuccessToast) {
        showToast('تم تحديث إحصاءات المنصة بنجاح', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'فشل تحميل بيانات المنصة', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const totalSubscribers =
    data?.plansDistribution?.reduce((acc, curr) => acc + curr.subscriberCount, 0) || 1;

  return (
    <div className="view-container">
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            لوحة الإدارة المركزية (Super Admin)
          </h1>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            مؤشرات النمو، اشتراكات أصحاب الشبكات، واستهلاك الكروت الحقيقي للمنصة التجارية
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            آخر تحديث: {lastRefreshed.toLocaleTimeString('ar-EG')}
          </span>
          <button
            onClick={() => fetchOverview(true)}
            disabled={isLoading}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.85rem' }}
          >
            <RefreshCw size={15} className={isLoading ? 'spin-animation' : ''} />
            <span>تحديث البيانات</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
          gap: '1rem',
          marginBottom: '1.75rem',
        }}
      >
        <StatCard
          label="إجمالي أصحاب الشبكات"
          value={isLoading ? '...' : (data?.tenants?.total ?? 0)}
          icon={<Building2 size={24} color="var(--primary)" />}
          iconBg="var(--primary-light)"
          trend={
            data
              ? `${data.tenants.active} نشط • ${data.tenants.suspended} معلق`
              : undefined
          }
          trendPositive={true}
        />

        <StatCard
          label="الاشتراكات النشطة"
          value={isLoading ? '...' : (data?.subscriptions?.active ?? 0)}
          icon={<CheckCircle2 size={24} color="var(--success)" />}
          iconBg="var(--success-bg)"
          trend={
            data
              ? `${data.subscriptions.expired} اشتراك منتهي`
              : undefined
          }
          trendPositive={data ? data.subscriptions.expired === 0 : true}
        />

        <StatCard
          label="الكروت المستهلكة هذا الشهر"
          value={isLoading ? '...' : (data?.cards?.consumedThisMonth?.toLocaleString('ar-EG') ?? 0)}
          icon={<CreditCard size={24} color="var(--accent)" />}
          iconBg="var(--warning-bg)"
          trend="استهلاك حقيقي عبر الشبكات"
          trendPositive={true}
        />

        <StatCard
          label="أجهزة MikroTik المربوطة"
          value={isLoading ? '...' : (data?.devices?.total ?? 0)}
          icon={<Router size={24} color="var(--info)" />}
          iconBg="var(--info-bg)"
          trend={
            data
              ? `${data.devices.online} متصل • ${data.devices.offline} غير متصل`
              : undefined
          }
          trendPositive={data ? data.devices.online > 0 : true}
        />
      </div>

      {/* Two Column Layout: Plan Distribution & Quick Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.5rem',
          marginBottom: '1.75rem',
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
              <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
                توزيع العملاء حسب الباقة
              </h2>
            </div>
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('super-plans')}
                className="btn btn-ghost"
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              >
                إدارة الخطط <ArrowUpRight size={13} />
              </button>
            )}
          </div>

          {isLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              جاري فحص الاشتراكات...
            </div>
          ) : !data?.plansDistribution?.length ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              لا توجد باقات تجارية مسجلة حتى الآن.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {data.plansDistribution.map((plan) => {
                const percentage = Math.round((plan.subscriberCount / (totalSubscribers || 1)) * 100);
                return (
                  <div key={plan.planId}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.85rem',
                        marginBottom: '0.35rem',
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>
                        {plan.planNameAr} ({plan.planName})
                      </span>
                      <span style={{ color: 'var(--text-secondary)' }}>
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
                          width: `${percentage}%`,
                          backgroundColor:
                            plan.planName.includes('BUSINESS') || plan.planName.includes('ENTERPRISE')
                              ? 'var(--accent)'
                              : plan.planName.includes('PRO')
                              ? 'var(--primary)'
                              : 'var(--info)',
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

        {/* Platform Status Overview */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <Users size={18} color="var(--primary)" />
            <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
              سلامة المنصة وعزل المستأجرين
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div
              style={{
                padding: '0.85rem 1rem',
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
              }}
            >
              <CheckCircle2 size={20} color="var(--success)" style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--success)' }}>
                  العزل الأمني لقواعد البيانات (RLS & Tenant Guard)
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  يتم التحقق من هوية المستأجر في كل استعلام Backend، مع منع تام لكشف بيانات شبكة لأخرى.
                </div>
              </div>
            </div>

            <div
              style={{
                padding: '0.85rem 1rem',
                backgroundColor: 'rgba(13, 148, 136, 0.08)',
                border: '1px solid rgba(13, 148, 136, 0.25)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
              }}
            >
              <Clock size={20} color="var(--primary)" style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)' }}>
                  محرك الحصص والكروت الشهري
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  احتساب دقيق للحصص الشهرية المرتكزة على تاريخ بدء الاشتراك، مع دعم الحصص غير المحدودة.
                </div>
              </div>
            </div>

            <div
              style={{
                padding: '0.85rem 1rem',
                backgroundColor: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
              }}
            >
              <AlertTriangle size={20} color="var(--accent)" style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent)' }}>
                  سياسة تفعيل وتجديد الاشتراكات
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  التفعيل اليدوي فقط مع إلغاء الاشتراكات المتعارضة لضمان اشتراك نشط وحيد لكل مستأجر.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Tenants Table */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Building2 size={18} color="var(--primary)" />
            <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
              أحدث الشبكات المسجلة في المنصة
            </h2>
          </div>
          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab('super-tenants')}
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              عرض جميع الشبكات <ArrowUpRight size={14} />
            </button>
          )}
        </div>

        {isLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            جاري تحميل أحدث المسجلين...
          </div>
        ) : !data?.recentTenants?.length ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            لا توجد شبكات مسجلة مؤخرًا.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>اسم الشبكة</th>
                  <th>البريد الإلكتروني</th>
                  <th>الحالة</th>
                  <th>الباقة الحالية</th>
                  <th>الموجهات</th>
                  <th>تاريخ الانضمام</th>
                </tr>
              </thead>
              <tbody>
                {data.recentTenants.map((tenant) => (
                  <tr key={tenant.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{tenant.name}</div>
                      <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>{tenant.slug}</div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.825rem' }}>
                      {tenant.contactEmail || '—'}
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          tenant.status === 'ACTIVE'
                            ? 'badge-success'
                            : tenant.status === 'SUSPENDED'
                            ? 'badge-danger'
                            : 'badge-warning'
                        }`}
                      >
                        {tenant.status === 'ACTIVE'
                          ? 'نشط'
                          : tenant.status === 'SUSPENDED'
                          ? 'معلق'
                          : tenant.status}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--primary)' }}>
                      {tenant.activePlan}
                    </td>
                    <td>
                      <span style={{ fontSize: '0.85rem' }}>{tenant.routersCount} موجه</span>
                    </td>
                    <td style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                      {new Date(tenant.createdAt).toLocaleDateString('ar-EG', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
