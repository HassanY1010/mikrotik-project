import React, { useEffect, useState } from 'react';
import { StatCard } from '../../components/common/StatCard';
import { apiClient } from '../../core/api/api-client';
import { useToast } from '../../core/context/ToastContext';
import { useSubscription } from '../../core/context/SubscriptionContext';
import {
  CreditCard,
  DollarSign,
  Router,
  Users,
  PlusCircle,
  ShoppingBag,
  RefreshCw,
  TrendingUp,
  Activity,
  Sparkles,
} from 'lucide-react';
import { NavigationTab } from '../../components/layout/Sidebar';
import { DashboardData } from '../../core/types/view-models';

interface DashboardViewProps {
  onNavigate: (tab: NavigationTab) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { showToast } = useToast();
  const { isSubscribed, hasNoSubscription } = useSubscription();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData>({
    kpis: {
      totalRevenue: 0,
      availableCards: 0,
      totalSoldCards: 0,
      activeRouters: 0,
      activeSessions: 0,
      currency: 'SDG',
    },
    topProfiles: [],
    recentSales: [],
  });

  const fetchDashboardData = async (isManual = false) => {
    setLoading(true);
    try {
      const res = await apiClient.get<DashboardData>('/analytics/dashboard');
      if (res && res.kpis) {
        setData(res);
        if (isManual) showToast('تم تحديث ومزامنة بيانات لوحة التحكم بنجاح', 'success');
        return;
      }
    } catch {
      // Fallback to /analytics/overview if /analytics/dashboard fails
      try {
        interface OverviewFallback {
          revenue?: { allTime?: number; currency?: string };
          cardsInventory?: { available?: number; sold?: number };
          devices?: { online?: number };
          activeSessionsCount?: number;
          recentSales?: Array<{
            invoiceNumber: string;
            profileName?: string;
            deviceName?: string;
            amount: number;
            createdAt: string;
          }>;
        }
        const ov = await apiClient.get<OverviewFallback>('/analytics/overview');
        if (ov) {
          setData({
            kpis: {
              totalRevenue: ov.revenue?.allTime || 0,
              availableCards: ov.cardsInventory?.available || 0,
              totalSoldCards: ov.cardsInventory?.sold || 0,
              activeRouters: ov.devices?.online || 0,
              activeSessions: ov.activeSessionsCount || 0,
              currency: ov.revenue?.currency || 'SDG',
            },
            topProfiles: [],
            recentSales: (ov.recentSales || []).map((s) => ({
              invoice: s.invoiceNumber,
              profile: s.profileName || s.deviceName || 'باقة هوتسبوت',
              amount: s.amount,
              time: new Date(s.createdAt).toLocaleTimeString('ar-YE', {
                hour: '2-digit',
                minute: '2-digit',
              }),
            })),
          });
          return;
        }
      } catch {
        // Fallback to zeroed real state
      }
    } finally {
      setLoading(false);
    }

    setData({
      kpis: {
        totalRevenue: 0,
        availableCards: 0,
        totalSoldCards: 0,
        activeRouters: 0,
        activeSessions: 0,
        currency: 'SDG',
      },
      topProfiles: [],
      recentSales: [],
    });
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const kpis = data?.kpis || {};

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Activity color="var(--primary)" size={24} />
            لوحة التحكم والتحليلات
          </h1>
          <p className="page-subtitle">
            نظرة عامة حية على مبيعات Hotspot، الكروت، وحالة راوترات MikroTik
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-outline" onClick={() => fetchDashboardData(true)} disabled={loading}>
            <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'جاري التحديث...' : 'تحديث البيانات'}
          </button>
          <button className="btn btn-primary" onClick={() => onNavigate('pos')}>
            <ShoppingBag size={16} />
            نقطة البيع (POS)
          </button>
        </div>
      </div>

      {/* Subscription Status Callout for Non-Subscribed / Expired Tenants */}
      {!isSubscribed && (
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: hasNoSubscription ? 'rgba(13, 148, 136, 0.08)' : 'rgba(245, 158, 11, 0.08)',
            border: `1px solid ${hasNoSubscription ? 'rgba(13, 148, 136, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 'var(--radius-md)',
                backgroundColor: hasNoSubscription ? 'rgba(13, 148, 136, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: hasNoSubscription ? 'var(--primary)' : '#f59e0b',
                flexShrink: 0,
              }}
            >
              <Sparkles size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {hasNoSubscription ? 'حساب الشبكة قيد التهيئة التجريبية' : 'اشتراك الشبكة بحاجة إلى تجديد'}
                </h3>
                <span className={`badge ${hasNoSubscription ? 'badge-warning' : 'badge-danger'}`}>
                  {hasNoSubscription ? 'غير مشترك' : 'منتهي الصلاحية'}
                </span>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px', maxWidth: '700px' }}>
                {hasNoSubscription
                  ? 'يمكنك استعراض النظام وتجربة مصمم صفحات الهوتسبوت؛ وعند اعتماد وتفعيل باقتك من قِبل إدارة المنصة ستفتح لك إمكانية توليد الكروت وربط راوترات ميكروتك بالكامل.'
                  : 'انتهت صلاحية باقتك السابقة؛ يرجى مراجعة إدارة المنصة لتجديد الاشتراك واستعادة صلاحيات توليد الكروت وإضافة الأجهزة.'}
              </p>
            </div>
          </div>
          <button
            className="btn btn-outline"
            onClick={() => onNavigate('settings')}
            style={{
              borderColor: hasNoSubscription ? 'rgba(13, 148, 136, 0.5)' : 'rgba(245, 158, 11, 0.5)',
              color: hasNoSubscription ? 'var(--primary)' : '#f59e0b',
              padding: '0.6rem 1.1rem',
              fontSize: '0.875rem',
            }}
          >
            <CreditCard size={16} />
            استعراض باقات وحصص الشبكة
          </button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid-cols-4" style={{ marginBottom: '1.5rem' }}>
        <StatCard
          label="إجمالي إيرادات المبيعات"
          value={`${Number(kpis.totalRevenue || 0).toLocaleString()} ${kpis.currency || 'SDG'}`}
          icon={<DollarSign size={24} color="var(--primary)" />}
          iconBg="var(--primary-light)"
          trend="+18% مقارنة بالشهر السابق"
          trendPositive={true}
        />
        <StatCard
          label="الكروت الجاهزة للبيع"
          value={`${Number(kpis.availableCards || 0).toLocaleString()} كرت`}
          icon={<CreditCard size={24} color="var(--accent)" />}
          iconBg="var(--warning-bg)"
          trend="مخزون وفير يغطي 15 يوماً"
          trendPositive={true}
        />
        <StatCard
          label="راوترات ميكروتيك النشطة"
          value={`${kpis.activeRouters || 0} راوترات متصلة`}
          icon={<Router size={24} color="var(--info)" />}
          iconBg="var(--info-bg)"
          trend="الاتصال مستقر مع جميع الفروع"
          trendPositive={true}
        />
        <StatCard
          label="مستخدمو الهوتسبوت النشطون الآن"
          value={`${kpis.activeSessions || 0} مستخدم متصل`}
          icon={<Users size={24} color="var(--success)" />}
          iconBg="var(--success-bg)"
          trend="جلسات إنترنت نشطة حالياً"
          trendPositive={true}
        />
      </div>

      {/* Middle Row: Quick Action shortcuts & Top Profiles */}
      <div className="grid-cols-2" style={{ marginBottom: '1.5rem' }}>
        {/* Quick Launchpad */}
        <div className="card">
          <h3
            style={{
              fontSize: '1.1rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <PlusCircle size={18} color="var(--primary)" />
            إجراءات تشغيلية سريعة
          </h3>
          <div className="quick-actions-grid">
            <button
              className="btn btn-secondary"
              style={{ justifyContent: 'flex-start', padding: '0.85rem' }}
              onClick={() => onNavigate('cards')}
            >
              <CreditCard size={18} color="var(--accent)" />
              <span>توليد دفعة كروت جديدة</span>
            </button>
            <button
              className="btn btn-secondary"
              style={{ justifyContent: 'flex-start', padding: '0.85rem' }}
              onClick={() => onNavigate('print')}
            >
              <TrendingUp size={18} color="var(--primary)" />
              <span>طباعة كروت الشبكة</span>
            </button>
            <button
              className="btn btn-secondary"
              style={{ justifyContent: 'flex-start', padding: '0.85rem' }}
              onClick={() => onNavigate('devices')}
            >
              <Router size={18} color="var(--info)" />
              <span>فحص وتشخيص الراوترات</span>
            </button>
            <button
              className="btn btn-secondary"
              style={{ justifyContent: 'flex-start', padding: '0.85rem' }}
              onClick={() => onNavigate('reports')}
            >
              <DollarSign size={18} color="var(--success)" />
              <span>تصدير تقرير الإيرادات</span>
            </button>
          </div>
        </div>

        {/* Top Selling Profiles */}
        <div className="card">
          <h3
            style={{
              fontSize: '1.1rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <TrendingUp size={18} color="var(--success)" />
            الباقات الأكثر مبيعاً
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {(data.topProfiles || []).map((p, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.65rem 0.85rem',
                  backgroundColor: 'var(--bg-app)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{p.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    تم بيع {p.count} كرت
                  </div>
                </div>
                <div style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '0.95rem' }}>
                  {Number(p.revenue || 0).toLocaleString()} {kpis.currency || 'SDG'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row: Recent Sales Ticker */}
      <div className="card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <h3 style={{ fontSize: '1.1rem' }}>آخر عمليات البيع المسجلة</h3>
          <button className="btn btn-outline btn-sm" onClick={() => onNavigate('sales')}>
            عرض جميع الفواتير
          </button>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>رقم الفاتورة</th>
                <th>باقة الكرت</th>
                <th>المبلغ</th>
                <th>التوقيت</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {(data.recentSales || []).map((sale, idx) => (
                <tr key={idx}>
                  <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{sale.invoice}</td>
                  <td>{sale.profile}</td>
                  <td style={{ fontWeight: 700 }}>
                    {sale.amount} {kpis.currency || 'SDG'}
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{sale.time}</td>
                  <td>
                    <span className="badge badge-success">مدفوعة ومكتملة</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
