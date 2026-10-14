import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  Search,
  RotateCcw,
  Eye,
  AlertTriangle,
  PauseCircle,
  PlayCircle,
  Building,
  Clock,
  User,
  Mail,
  Phone,
  Layers,
} from 'lucide-react';
import { apiClient } from '../../core/api/api-client';
import { Modal } from '../../components/common/Modal';
import { useToast } from '../../core/context/ToastContext';

interface SubscriptionStats {
  total: number;
  active: number;
  expired: number;
  cancelled: number;
  trial: number;
  expiringSoon: number;
}

interface PlanItem {
  id: string;
  name: string;
  nameAr: string;
  priceMonthly: number;
  priceYearly: number;
  maxRouters: number;
  features?: {
    isUnlimited?: boolean;
    cardGenerationLimit?: number | null;
    a4Printing?: boolean;
    thermalPrinting?: boolean;
    offlineSales?: boolean;
    posTerminal?: boolean;
    multiCashier?: boolean;
  };
}

interface SubscriptionItem {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string | null;
  deviceCount: number;
  planId: string;
  planName: string;
  planNameAr: string;
  planFeatures?: {
    isUnlimited?: boolean;
    cardGenerationLimit?: number | null;
    a4Printing?: boolean;
    thermalPrinting?: boolean;
    offlineSales?: boolean;
    posTerminal?: boolean;
    multiCashier?: boolean;
  };
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'TRIAL' | 'SUSPENDED' | string;
  rawStatus: string;
  billingCycle: 'MONTHLY' | 'YEARLY' | string;
  startsAt: string;
  expiresAt: string;
  maxRouters: number;
  price: number;
  approvedBy: string | null;
  notes: string | null;
  createdAt: string;
}

interface PaginatedSubscriptionsResponse {
  data: SubscriptionItem[];
  stats?: SubscriptionStats;
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export const SuperAdminSubscriptionsView: React.FC = () => {
  const { showToast } = useToast();
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([]);
  const [stats, setStats] = useState<SubscriptionStats>({
    total: 0,
    active: 0,
    expired: 0,
    cancelled: 0,
    trial: 0,
    expiringSoon: 0,
  });
  const [availablePlans, setAvailablePlans] = useState<PlanItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [planFilter, setPlanFilter] = useState<string>('');
  const [cycleFilter, setCycleFilter] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // View Details Modal
  const [showDetailsModal, setShowDetailsModal] = useState<boolean>(false);
  const [selectedSub, setSelectedSub] = useState<SubscriptionItem | null>(null);

  // Renew Modal
  const [showRenewModal, setShowRenewModal] = useState<boolean>(false);
  const [renewMonths, setRenewMonths] = useState<number>(1);
  const [renewPlanId, setRenewPlanId] = useState<string>('');
  const [renewCycle, setRenewCycle] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [renewNotes, setRenewNotes] = useState<string>('');
  const [isRenewing, setIsRenewing] = useState<boolean>(false);

  // Suspend / Resume Modal
  const [showSuspendModal, setShowSuspendModal] = useState<boolean>(false);
  const [suspendAction, setSuspendAction] = useState<'SUSPEND' | 'RESUME'>('SUSPEND');
  const [suspendReason, setSuspendReason] = useState<string>('');
  const [isSuspending, setIsSuspending] = useState<boolean>(false);

  // Cancel Modal
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Load plans for filtering and renewal options
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await apiClient.get<PlanItem[]>('/plans');
        if (Array.isArray(res)) {
          setAvailablePlans(res);
        }
      } catch (err) {
        console.warn('Failed to fetch available plans:', err);
      }
    };
    fetchPlans();
  }, []);

  const fetchSubscriptions = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get<PaginatedSubscriptionsResponse>('/tenants/admin/subscriptions', {
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        planId: planFilter || undefined,
        billingCycle: cycleFilter || undefined,
        page,
        limit: 15,
      });

      if (res && res.data) {
        setSubscriptions(res.data);
        setTotalPages(res.meta?.totalPages || 1);
        setTotalCount(res.meta?.total || 0);
        if (res.stats) {
          setStats(res.stats);
        }
      }
    } catch (err: any) {
      showToast(err.message || 'فشل تحميل قائمة الاشتراكات', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, statusFilter, planFilter, cycleFilter, page, showToast]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setStatusFilter('');
    setPlanFilter('');
    setCycleFilter('');
    setPage(1);
  };

  const hasActiveFilters = Boolean(
    searchQuery.trim() || statusFilter || planFilter || cycleFilter
  );

  // Open Details Modal
  const handleOpenDetails = (sub: SubscriptionItem) => {
    setSelectedSub(sub);
    setShowDetailsModal(true);
  };

  // Open Renew Modal
  const handleOpenRenew = (sub: SubscriptionItem) => {
    setSelectedSub(sub);
    setRenewMonths(sub.billingCycle === 'YEARLY' ? 12 : 1);
    setRenewPlanId(sub.planId);
    setRenewCycle(sub.billingCycle === 'YEARLY' ? 'YEARLY' : 'MONTHLY');
    setRenewNotes('');
    setShowRenewModal(true);
  };

  // Calculate renewal preview details
  const renewalPreview = useMemo(() => {
    if (!selectedSub) return null;
    const plan = availablePlans.find((p) => p.id === renewPlanId) || {
      priceMonthly: selectedSub.price,
      priceYearly: selectedSub.price * 12,
      name: selectedSub.planName,
      nameAr: selectedSub.planNameAr,
      maxRouters: selectedSub.maxRouters,
    };

    const pricePerMonth = Number(plan.priceMonthly) || 0;
    const pricePerYear = Number(plan.priceYearly) || pricePerMonth * 12;
    const effectivePrice =
      renewCycle === 'YEARLY'
        ? (pricePerYear / 12) * renewMonths
        : pricePerMonth * renewMonths;

    const now = new Date();
    const currentExpiry = new Date(selectedSub.expiresAt);
    const isStillActive = currentExpiry.getTime() > now.getTime() && selectedSub.status === 'ACTIVE';
    const baseDate = isStillActive ? currentExpiry : now;
    const newExpiry = new Date(baseDate);
    newExpiry.setMonth(newExpiry.getMonth() + renewMonths);

    return {
      planName: plan.nameAr || plan.name,
      maxRouters: plan.maxRouters,
      calculatedPrice: Math.round(effectivePrice),
      isStillActive,
      baseDateString: baseDate.toLocaleDateString('ar-EG'),
      newExpiryString: newExpiry.toLocaleDateString('ar-EG'),
    };
  }, [selectedSub, renewPlanId, renewMonths, renewCycle, availablePlans]);

  // Execute Renewal
  const handleRenewSubscription = async () => {
    if (!selectedSub || isRenewing) return;
    setIsRenewing(true);
    try {
      await apiClient.post(`/tenants/subscriptions/${selectedSub.id}/renew`, {
        durationMonths: Number(renewMonths),
        planId: renewPlanId || undefined,
        billingCycle: renewCycle,
        notes: renewNotes.trim() || undefined,
      });
      showToast('تم تجديد وتمديد الاشتراك بنجاح', 'success');
      setShowRenewModal(false);
      fetchSubscriptions();
    } catch (err: any) {
      showToast(err.message || 'فشل تجديد الاشتراك', 'error');
    } finally {
      setIsRenewing(false);
    }
  };

  // Open Suspend / Resume Modal
  const handleOpenSuspendModal = (sub: SubscriptionItem, action: 'SUSPEND' | 'RESUME') => {
    setSelectedSub(sub);
    setSuspendAction(action);
    setSuspendReason('');
    setShowSuspendModal(true);
  };

  // Execute Suspend / Resume
  const handleExecuteSuspend = async () => {
    if (!selectedSub || isSuspending) return;
    setIsSuspending(true);
    try {
      const targetStatus = suspendAction === 'SUSPEND' ? 'SUSPENDED' : 'RESUME';
      await apiClient.patch(`/tenants/subscriptions/${selectedSub.id}/status`, {
        status: targetStatus,
        notes: suspendReason.trim() || undefined,
      });
      showToast(
        suspendAction === 'SUSPEND' ? 'تم تعليق المنظمة والاشتراك إدارياً' : 'تم استئناف الاشتراك بنجاح',
        'success'
      );
      setShowSuspendModal(false);
      fetchSubscriptions();
    } catch (err: any) {
      showToast(err.message || 'فشل تعديل حالة الاشتراك', 'error');
    } finally {
      setIsSuspending(false);
    }
  };

  // Open Cancel Modal
  const handleOpenCancelModal = (sub: SubscriptionItem) => {
    setSelectedSub(sub);
    setCancelReason('');
    setShowCancelModal(true);
  };

  // Execute Cancel
  const handleExecuteCancel = async () => {
    if (!selectedSub || isCancelling) return;
    setIsCancelling(true);
    try {
      await apiClient.patch(`/tenants/subscriptions/${selectedSub.id}/status`, {
        status: 'CANCELLED',
        notes: cancelReason.trim() || undefined,
      });
      showToast('تم إلغاء الاشتراك بنجاح والحفاظ على السجلات السابقة', 'success');
      setShowCancelModal(false);
      fetchSubscriptions();
    } catch (err: any) {
      showToast(err.message || 'فشل إلغاء الاشتراك', 'error');
    } finally {
      setIsCancelling(false);
    }
  };

  const getStatusBadge = (sub: SubscriptionItem) => {
    const expiry = new Date(sub.expiresAt);
    const now = Date.now();
    const isExpired = expiry.getTime() <= now;
    const daysLeft = Math.ceil((expiry.getTime() - now) / (1000 * 60 * 60 * 24));

    if (sub.tenantStatus === 'SUSPENDED' || sub.status === 'SUSPENDED') {
      return (
        <span
          className="badge"
          style={{
            backgroundColor: 'rgba(168, 85, 247, 0.15)',
            color: '#c084fc',
            border: '1px solid rgba(168, 85, 247, 0.3)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}
        >
          <PauseCircle size={12} />
          <span>معلق إدارياً</span>
        </span>
      );
    }

    if (sub.status === 'CANCELLED') {
      return (
        <span
          className="badge"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            color: '#f87171',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}
        >
          <XCircle size={12} />
          <span>ملغى</span>
        </span>
      );
    }

    if (sub.status === 'TRIAL') {
      return (
        <span
          className="badge"
          style={{
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            color: '#60a5fa',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}
        >
          <Clock size={12} />
          <span>تجريبي (Trial)</span>
        </span>
      );
    }

    if (isExpired || sub.status === 'EXPIRED') {
      return (
        <span
          className="badge"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            color: '#f87171',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}
        >
          <AlertTriangle size={12} />
          <span>منتهي الصلاحية</span>
        </span>
      );
    }

    if (daysLeft <= 7) {
      return (
        <span
          className="badge"
          style={{
            backgroundColor: 'rgba(245, 158, 11, 0.15)',
            color: '#fbbf24',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}
        >
          <Clock size={12} />
          <span>ينتهي قريباً ({daysLeft} يوم)</span>
        </span>
      );
    }

    return (
      <span
        className="badge"
        style={{
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          color: '#34d399',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
        }}
      >
        <CheckCircle2 size={12} />
        <span>نشط (Active)</span>
      </span>
    );
  };

  const getPlanColor = (planName: string) => {
    const upper = planName?.toUpperCase() || '';
    if (upper.includes('BUSINESS')) {
      return { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.35)', color: '#fbbf24' };
    }
    if (upper.includes('PRO')) {
      return { bg: 'rgba(20, 184, 166, 0.12)', border: 'rgba(20, 184, 166, 0.35)', color: '#2dd4bf' };
    }
    return { bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.35)', color: '#60a5fa' };
  };

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
          <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            إدارة اشتراكات العملاء (Subscription Management)
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.35rem', marginBottom: 0 }}>
            متابعة الاشتراكات الفعالة، والتجديد اليدوي، وإدارة حالات الاشتراكات والعقود.
          </p>
        </div>

        <button
          onClick={fetchSubscriptions}
          disabled={isLoading}
          className="btn btn-secondary"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.6rem 1rem',
            borderRadius: 'var(--radius-md)',
            fontWeight: 600,
          }}
        >
          <RefreshCw size={16} className={isLoading ? 'spin-animation' : ''} />
          <span>تحديث القائمة</span>
        </button>
      </div>

      {/* Real-time Summary Cards (Clickable) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '0.85rem',
          marginBottom: '1.5rem',
        }}
      >
        {/* Total */}
        <div
          onClick={() => {
            setStatusFilter('');
            setPage(1);
          }}
          className="card"
          style={{
            padding: '1rem',
            cursor: 'pointer',
            border: !statusFilter ? '1px solid var(--primary)' : '1px solid var(--border)',
            background: !statusFilter ? 'rgba(59, 130, 246, 0.06)' : 'var(--bg-surface)',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
              إجمالي الاشتراكات
            </span>
            <Layers size={16} color="var(--primary)" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.35rem' }}>
            {stats.total.toLocaleString('ar-EG')}
          </div>
          <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            جميع السجلات المسجلة
          </div>
        </div>

        {/* Active */}
        <div
          onClick={() => {
            setStatusFilter('ACTIVE');
            setPage(1);
          }}
          className="card"
          style={{
            padding: '1rem',
            cursor: 'pointer',
            border: statusFilter === 'ACTIVE' ? '1px solid var(--success)' : '1px solid var(--border)',
            background: statusFilter === 'ACTIVE' ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-surface)',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
              النشطة (ACTIVE)
            </span>
            <CheckCircle2 size={16} color="var(--success)" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--success)', marginTop: '0.35rem' }}>
            {stats.active.toLocaleString('ar-EG')}
          </div>
          <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            فعالة وغير منتهية
          </div>
        </div>

        {/* Expiring Soon */}
        <div
          onClick={() => {
            setStatusFilter('EXPIRING_SOON');
            setPage(1);
          }}
          className="card"
          style={{
            padding: '1rem',
            cursor: 'pointer',
            border: statusFilter === 'EXPIRING_SOON' ? '1px solid #f59e0b' : '1px solid var(--border)',
            background: statusFilter === 'EXPIRING_SOON' ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-surface)',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
              تنتهي خلال 7 أيام
            </span>
            <Clock size={16} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f59e0b', marginTop: '0.35rem' }}>
            {stats.expiringSoon.toLocaleString('ar-EG')}
          </div>
          <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            تحتاج إلى متابعة التجديد
          </div>
        </div>

        {/* Expired */}
        <div
          onClick={() => {
            setStatusFilter('EXPIRED');
            setPage(1);
          }}
          className="card"
          style={{
            padding: '1rem',
            cursor: 'pointer',
            border: statusFilter === 'EXPIRED' ? '1px solid var(--danger)' : '1px solid var(--border)',
            background: statusFilter === 'EXPIRED' ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-surface)',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
              المنتهية (EXPIRED)
            </span>
            <AlertTriangle size={16} color="var(--danger)" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--danger)', marginTop: '0.35rem' }}>
            {stats.expired.toLocaleString('ar-EG')}
          </div>
          <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            تجاوزت تاريخ الصلاحية
          </div>
        </div>

        {/* Trial */}
        <div
          onClick={() => {
            setStatusFilter('TRIAL');
            setPage(1);
          }}
          className="card"
          style={{
            padding: '1rem',
            cursor: 'pointer',
            border: statusFilter === 'TRIAL' ? '1px solid #3b82f6' : '1px solid var(--border)',
            background: statusFilter === 'TRIAL' ? 'rgba(59, 130, 246, 0.08)' : 'var(--bg-surface)',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
              التجريبية (TRIAL)
            </span>
            <Clock size={16} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#3b82f6', marginTop: '0.35rem' }}>
            {stats.trial.toLocaleString('ar-EG')}
          </div>
          <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            فترات تجريبية مجانية
          </div>
        </div>

        {/* Cancelled */}
        <div
          onClick={() => {
            setStatusFilter('CANCELLED');
            setPage(1);
          }}
          className="card"
          style={{
            padding: '1rem',
            cursor: 'pointer',
            border: statusFilter === 'CANCELLED' ? '1px solid var(--text-muted)' : '1px solid var(--border)',
            background: statusFilter === 'CANCELLED' ? 'rgba(148, 163, 184, 0.08)' : 'var(--bg-surface)',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
              الملغاة (CANCELLED)
            </span>
            <XCircle size={16} color="var(--text-muted)" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
            {stats.cancelled.toLocaleString('ar-EG')}
          </div>
          <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            ملغاة أو منتهية العقد
          </div>
        </div>
      </div>

      {/* Filter and Search Bar (Completely Redesigned & Fixed) */}
      <div
        className="card"
        style={{
          padding: '1rem',
          marginBottom: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '0.85rem',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {/* Search Box */}
          <div
            style={{
              position: 'relative',
              flex: '1 1 260px',
              minWidth: '220px',
            }}
          >
            <Search
              size={16}
              style={{
                position: 'absolute',
                right: '0.85rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              className="form-input"
              placeholder="بحث باسم الشبكة، المالك، البريد، أو المعرّف..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                paddingRight: '2.4rem',
                backgroundColor: 'var(--bg-app)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
                height: '42px',
                borderRadius: 'var(--radius-md)',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  left: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Select */}
          <div style={{ flex: '1 1 180px', minWidth: '160px', position: 'relative' }}>
            <select
              className="form-input"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              style={{
                width: '100%',
                height: '42px',
                backgroundColor: 'var(--bg-app)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
                borderRadius: 'var(--radius-md)',
                paddingLeft: '1.75rem',
              }}
            >
              <option value="">جميع الحالات</option>
              <option value="ACTIVE">النشطة فقط (ACTIVE)</option>
              <option value="EXPIRING_SOON">تنتهي قريباً (خلال 7 أيام)</option>
              <option value="EXPIRED">المنتهية فقط (EXPIRED)</option>
              <option value="TRIAL">التجريبية فقط (TRIAL)</option>
              <option value="CANCELLED">الملغاة فقط (CANCELLED)</option>
              <option value="SUSPENDED">المعلقة إدارياً (SUSPENDED)</option>
            </select>
          </div>

          {/* Plan Filter */}
          <div style={{ flex: '1 1 160px', minWidth: '140px' }}>
            <select
              className="form-input"
              value={planFilter}
              onChange={(e) => {
                setPlanFilter(e.target.value);
                setPage(1);
              }}
              style={{
                width: '100%',
                height: '42px',
                backgroundColor: 'var(--bg-app)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <option value="">جميع الباقات</option>
              {availablePlans.length > 0 ? (
                availablePlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nameAr} ({p.name})
                  </option>
                ))
              ) : (
                <>
                  <option value="BASIC">الأساسية (BASIC)</option>
                  <option value="PRO">المتقدمة (PRO)</option>
                  <option value="BUSINESS">الأعمال (BUSINESS)</option>
                </>
              )}
            </select>
          </div>

          {/* Billing Cycle Filter */}
          <div style={{ flex: '1 1 150px', minWidth: '130px' }}>
            <select
              className="form-input"
              value={cycleFilter}
              onChange={(e) => {
                setCycleFilter(e.target.value);
                setPage(1);
              }}
              style={{
                width: '100%',
                height: '42px',
                backgroundColor: 'var(--bg-app)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <option value="">جميع دورات الفوترة</option>
              <option value="MONTHLY">شهري (Monthly)</option>
              <option value="YEARLY">سنوي (Yearly)</option>
            </select>
          </div>

          {/* Reset Filters Button */}
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="btn btn-ghost"
              style={{
                height: '42px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                color: 'var(--text-muted)',
                fontSize: '0.85rem',
                padding: '0 0.85rem',
                whiteSpace: 'nowrap',
              }}
              title="إعادة ضبط الفلاتر"
            >
              <RotateCcw size={14} />
              <span>إعادة ضبط</span>
            </button>
          )}
        </div>

        {/* Search Results Summary */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
            paddingTop: '0.35rem',
            borderTop: '1px solid var(--border)',
          }}
        >
          <div>
            الاشتراكات المطابقة:{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{totalCount.toLocaleString('ar-EG')}</strong>
            {hasActiveFilters && <span style={{ color: 'var(--primary)', marginRight: '0.5rem' }}>(مفلترة)</span>}
          </div>

          {hasActiveFilters && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              اضغط على أي بطاقة إحصاء بالأعلى للتصفية السريعة
            </div>
          )}
        </div>
      </div>

      {/* Subscriptions Table Card */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
        <div className="table-responsive">
          <table className="table" style={{ width: '100%', margin: 0, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '0.9rem 1rem', textAlign: 'right' }}>الشبكة المشتركة والمالك</th>
                <th style={{ padding: '0.9rem 0.85rem', textAlign: 'right' }}>الباقة</th>
                <th style={{ padding: '0.9rem 0.85rem', textAlign: 'right' }}>الحالة</th>
                <th style={{ padding: '0.9rem 0.85rem', textAlign: 'right' }}>دورة الفوترة</th>
                <th style={{ padding: '0.9rem 0.85rem', textAlign: 'right' }}>فترة الاشتراك</th>
                <th style={{ padding: '0.9rem 0.85rem', textAlign: 'right' }}>السعر والموجهات</th>
                <th style={{ padding: '0.9rem 0.85rem', textAlign: 'right' }}>الملاحظات</th>
                <th style={{ padding: '0.9rem 1rem', textAlign: 'center' }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                      <RefreshCw size={24} className="spin-animation" color="var(--primary)" />
                      <span>جاري تحميل بيانات الاشتراكات الفعلية...</span>
                    </div>
                  </td>
                </tr>
              ) : subscriptions.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                      <Layers size={32} color="var(--text-muted)" style={{ opacity: 0.5 }} />
                      <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                        لا توجد اشتراكات مطابقة للفلاتر الحالية
                      </div>
                      <div style={{ fontSize: '0.8rem' }}>
                        {hasActiveFilters
                          ? 'جرب تغيير شروط البحث أو الفلاتر المختارة'
                          : 'لم يتم تسجيل أي اشتراكات في النظام بعد'}
                      </div>
                      {hasActiveFilters && (
                        <button
                          onClick={handleResetFilters}
                          className="btn btn-secondary"
                          style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                        >
                          <RotateCcw size={14} />
                          <span>إعادة ضبط الفلاتر</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                subscriptions.map((sub) => {
                  const expiry = new Date(sub.expiresAt);
                  const starts = new Date(sub.startsAt);
                  const now = Date.now();
                  const isExpired = expiry.getTime() <= now;
                  const daysLeft = Math.ceil((expiry.getTime() - now) / (1000 * 60 * 60 * 24));
                  const planColor = getPlanColor(sub.planName);
                  const routerRatio = `${sub.deviceCount} من ${sub.maxRouters}`;
                  const isOverRouterLimit = sub.deviceCount > sub.maxRouters;

                  return (
                    <tr
                      key={sub.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {/* Tenant & Owner */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                          <div
                            style={{
                              width: '34px',
                              height: '34px',
                              borderRadius: 'var(--radius-md)',
                              background: 'rgba(59, 130, 246, 0.1)',
                              border: '1px solid rgba(59, 130, 246, 0.25)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'var(--primary)',
                              flexShrink: 0,
                            }}
                          >
                            <Building size={16} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                              {sub.tenantName}
                            </div>
                            <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                              المعرّف: <code style={{ color: 'var(--text-secondary)' }}>{sub.tenantSlug}</code>
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                fontSize: '0.75rem',
                                color: 'var(--text-secondary)',
                                marginTop: '0.2rem',
                              }}
                            >
                              <User size={12} color="var(--text-muted)" />
                              <span>{sub.ownerName}</span>
                              {sub.ownerPhone && (
                                <>
                                  <span style={{ color: 'var(--border)' }}>•</span>
                                  <span dir="ltr" style={{ fontSize: '0.7rem' }}>
                                    {sub.ownerPhone}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Plan */}
                      <td style={{ padding: '0.85rem 0.85rem' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.25rem 0.65rem',
                            borderRadius: 'var(--radius-full)',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            background: planColor.bg,
                            border: `1px solid ${planColor.border}`,
                            color: planColor.color,
                          }}
                        >
                          {sub.planNameAr || sub.planName}
                        </span>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                          {sub.planName}
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '0.85rem 0.85rem' }}>
                        {getStatusBadge(sub)}
                      </td>

                      {/* Billing Cycle */}
                      <td style={{ padding: '0.85rem 0.85rem' }}>
                        <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {sub.billingCycle === 'YEARLY' ? 'سنوي (Yearly)' : 'شهري (Monthly)'}
                        </div>
                      </td>

                      {/* Dates */}
                      <td style={{ padding: '0.85rem 0.85rem' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          من: {starts.toLocaleDateString('ar-EG')}
                        </div>
                        <div style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.1rem' }}>
                          إلى: {expiry.toLocaleDateString('ar-EG')}
                        </div>
                        <div
                          style={{
                            fontSize: '0.725rem',
                            fontWeight: isExpired || daysLeft <= 7 ? 700 : 400,
                            color: isExpired
                              ? 'var(--danger)'
                              : daysLeft <= 7
                              ? '#f59e0b'
                              : 'var(--text-muted)',
                            marginTop: '0.15rem',
                          }}
                        >
                          {isExpired ? 'منتهي الصلاحية' : `متبقي ${daysLeft} يوم`}
                        </div>
                      </td>

                      {/* Price & Routers */}
                      <td style={{ padding: '0.85rem 0.85rem' }}>
                        <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                          {sub.price?.toLocaleString('ar-EG')} SDG
                        </div>
                        <div
                          style={{
                            fontSize: '0.725rem',
                            marginTop: '0.2rem',
                            color: isOverRouterLimit ? 'var(--danger)' : 'var(--text-secondary)',
                            fontWeight: isOverRouterLimit ? 700 : 500,
                          }}
                        >
                          {routerRatio} موجه
                        </div>
                      </td>

                      {/* Notes */}
                      <td style={{ padding: '0.85rem 0.85rem', fontSize: '0.75rem', color: 'var(--text-secondary)', maxWidth: '160px' }}>
                        <div
                          style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={sub.notes || ''}
                        >
                          {sub.notes || '—'}
                        </div>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                          {/* View Details */}
                          <button
                            onClick={() => handleOpenDetails(sub)}
                            className="btn btn-ghost"
                            style={{ padding: '0.4rem', borderRadius: 'var(--radius-sm)' }}
                            title="عرض تفاصيل الاشتراك والشبكة"
                          >
                            <Eye size={16} color="var(--primary)" />
                          </button>

                          {/* Renew */}
                          <button
                            onClick={() => handleOpenRenew(sub)}
                            className="btn btn-secondary"
                            style={{
                              padding: '0.35rem 0.65rem',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              borderRadius: 'var(--radius-sm)',
                            }}
                            title="تجديد أو تمديد الاشتراك يدويًا"
                          >
                            تجديد
                          </button>

                          {/* Suspend or Resume */}
                          {sub.tenantStatus === 'SUSPENDED' ? (
                            <button
                              onClick={() => handleOpenSuspendModal(sub, 'RESUME')}
                              className="btn btn-ghost"
                              style={{ padding: '0.4rem', borderRadius: 'var(--radius-sm)' }}
                              title="استئناف الاشتراك والمنظمة"
                            >
                              <PlayCircle size={16} color="var(--success)" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleOpenSuspendModal(sub, 'SUSPEND')}
                              className="btn btn-ghost"
                              style={{ padding: '0.4rem', borderRadius: 'var(--radius-sm)' }}
                              title="تعليق الاشتراك والمنظمة إدارياً"
                            >
                              <PauseCircle size={16} color="#c084fc" />
                            </button>
                          )}

                          {/* Cancel */}
                          {sub.status !== 'CANCELLED' && (
                            <button
                              onClick={() => handleOpenCancelModal(sub)}
                              className="btn btn-ghost"
                              style={{ padding: '0.4rem', borderRadius: 'var(--radius-sm)' }}
                              title="إلغاء الاشتراك"
                            >
                              <XCircle size={16} color="var(--danger)" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div
            style={{
              padding: '0.85rem 1.25rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid var(--border)',
              backgroundColor: 'var(--bg-app)',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              عرض صفحة <strong style={{ color: 'var(--text-primary)' }}>{page}</strong> من إجمالي{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{totalPages}</strong> صفحة
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn btn-secondary"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{
                  padding: '0.4rem 0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.8rem',
                }}
              >
                <ChevronRight size={15} />
                <span>السابق</span>
              </button>

              <button
                className="btn btn-secondary"
                disabled={page >= totalPages || isLoading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                style={{
                  padding: '0.4rem 0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.8rem',
                }}
              >
                <span>التالي</span>
                <ChevronLeft size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 1. Subscription Details Modal */}
      <Modal
        isOpen={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        title={`تفاصيل اشتراك: ${selectedSub?.tenantName || ''}`}
        maxWidth="640px"
      >
        {selectedSub && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Top Summary Banner */}
            <div
              style={{
                padding: '1rem',
                backgroundColor: 'var(--bg-app)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}
            >
              <div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {selectedSub.tenantName}
                </div>
                <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  معرف المنظمة: <code>{selectedSub.tenantSlug}</code>
                </div>
              </div>
              <div>{getStatusBadge(selectedSub)}</div>
            </div>

            {/* Grid Information */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '1rem',
              }}
            >
              {/* Tenant & Contact */}
              <div
                style={{
                  padding: '0.85rem',
                  backgroundColor: 'var(--bg-app)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  بيانات المالك والاتصال
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.825rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <User size={14} color="var(--primary)" />
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{selectedSub.ownerName}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Mail size={14} color="var(--text-muted)" />
                    <span style={{ color: 'var(--text-secondary)' }}>{selectedSub.ownerEmail}</span>
                  </div>
                  {selectedSub.ownerPhone && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Phone size={14} color="var(--text-muted)" />
                      <span dir="ltr" style={{ color: 'var(--text-secondary)' }}>{selectedSub.ownerPhone}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Plan & Pricing */}
              <div
                style={{
                  padding: '0.85rem',
                  backgroundColor: 'var(--bg-app)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  الباقة والحدود التشغيلية
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.825rem' }}>
                  <div>
                    الباقة:{' '}
                    <strong style={{ color: 'var(--primary)' }}>
                      {selectedSub.planNameAr} ({selectedSub.planName})
                    </strong>
                  </div>
                  <div>
                    السعر المعتمد:{' '}
                    <strong style={{ color: 'var(--text-primary)' }}>
                      {selectedSub.price?.toLocaleString('ar-EG')} SDG
                    </strong>{' '}
                    ({selectedSub.billingCycle === 'YEARLY' ? 'سنوي' : 'شهري'})
                  </div>
                  <div>
                    حد الموجهات:{' '}
                    <strong>
                      {selectedSub.deviceCount} من {selectedSub.maxRouters} موجه
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Lifecycle Timeline */}
            <div
              style={{
                padding: '0.85rem',
                backgroundColor: 'var(--bg-app)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                تواريخ دورة الاشتراك
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '0.75rem',
                  fontSize: '0.825rem',
                }}
              >
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>تاريخ البدء:</div>
                  <strong style={{ color: 'var(--text-primary)' }}>
                    {new Date(selectedSub.startsAt).toLocaleDateString('ar-EG')}
                  </strong>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>تاريخ الانتهاء:</div>
                  <strong style={{ color: 'var(--text-primary)' }}>
                    {new Date(selectedSub.expiresAt).toLocaleDateString('ar-EG')}
                  </strong>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>تاريخ التسجيل:</div>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {new Date(selectedSub.createdAt).toLocaleDateString('ar-EG')}
                  </span>
                </div>
              </div>
            </div>

            {/* Notes & Audit */}
            {selectedSub.notes && (
              <div
                style={{
                  padding: '0.85rem',
                  backgroundColor: 'var(--bg-app)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                  fontSize: '0.825rem',
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                  ملاحظات وسجل التجديد الإداري:
                </div>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {selectedSub.notes}
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowDetailsModal(false)}
                style={{ padding: '0.5rem 1rem' }}
              >
                إغلاق
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setShowDetailsModal(false);
                  handleOpenRenew(selectedSub);
                }}
                style={{ padding: '0.5rem 1.25rem' }}
              >
                تجديد هذا الاشتراك
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* 2. Manual Renewal Modal (Plan Upgrading & Auto-calculated Price) */}
      <Modal
        isOpen={showRenewModal}
        onClose={() => setShowRenewModal(false)}
        title={`تجديد اشتراك يدوي: ${selectedSub?.tenantName || ''}`}
        maxWidth="500px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
          {/* Current Expiry Info */}
          <div
            style={{
              padding: '0.85rem',
              backgroundColor: 'var(--bg-app)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              fontSize: '0.85rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>الباقة الحالية:</span>
              <strong style={{ color: 'var(--primary)' }}>{selectedSub?.planNameAr}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>تاريخ الانتهاء الحالي:</span>
              <strong style={{ color: 'var(--text-primary)' }}>
                {selectedSub ? new Date(selectedSub.expiresAt).toLocaleDateString('ar-EG') : ''}
              </strong>
            </div>
          </div>

          {/* Plan Selection (Allows upgrading during renewal) */}
          <div>
            <label className="form-label" style={{ fontWeight: 600, marginBottom: '0.4rem', display: 'block' }}>
              اختر باقة التجديد:
            </label>
            <select
              className="form-input"
              value={renewPlanId}
              onChange={(e) => setRenewPlanId(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: 'var(--bg-app)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            >
              {availablePlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nameAr} ({p.name}) — {p.priceMonthly?.toLocaleString('ar-EG')} SDG شهرياً / {p.priceYearly?.toLocaleString('ar-EG')} SDG سنوياً
                </option>
              ))}
            </select>
          </div>

          {/* Billing Cycle Selection */}
          <div>
            <label className="form-label" style={{ fontWeight: 600, marginBottom: '0.4rem', display: 'block' }}>
              دورة الفوترة:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => {
                  setRenewCycle('MONTHLY');
                  setRenewMonths(1);
                }}
                className={`btn ${renewCycle === 'MONTHLY' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '0.55rem', fontSize: '0.85rem', justifyContent: 'center' }}
              >
                شهري (Monthly)
              </button>
              <button
                type="button"
                onClick={() => {
                  setRenewCycle('YEARLY');
                  setRenewMonths(12);
                }}
                className={`btn ${renewCycle === 'YEARLY' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '0.55rem', fontSize: '0.85rem', justifyContent: 'center' }}
              >
                سنوي (Yearly - 12 شهر)
              </button>
            </div>
          </div>

          {/* Duration Months */}
          <div>
            <label className="form-label" style={{ fontWeight: 600, marginBottom: '0.4rem', display: 'block' }}>
              عدد أشهر التمديد الإضافية:
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="number"
                min="1"
                max="36"
                className="form-input"
                value={renewMonths}
                onChange={(e) => setRenewMonths(Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={{
                  flex: 1,
                  backgroundColor: 'var(--bg-app)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button
                  type="button"
                  onClick={() => setRenewMonths(1)}
                  className="btn btn-secondary"
                  style={{ padding: '0.4rem 0.65rem', fontSize: '0.75rem' }}
                >
                  +1 شهر
                </button>
                <button
                  type="button"
                  onClick={() => setRenewMonths(3)}
                  className="btn btn-secondary"
                  style={{ padding: '0.4rem 0.65rem', fontSize: '0.75rem' }}
                >
                  +3 أشهر
                </button>
                <button
                  type="button"
                  onClick={() => setRenewMonths(12)}
                  className="btn btn-secondary"
                  style={{ padding: '0.4rem 0.65rem', fontSize: '0.75rem' }}
                >
                  +1 سنة
                </button>
              </div>
            </div>
          </div>

          {/* Calculation Live Preview */}
          {renewalPreview && (
            <div
              style={{
                padding: '0.85rem',
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>تاريخ الانتهاء الجديد:</span>
                <strong style={{ color: 'var(--success)' }}>{renewalPreview.newExpiryString}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>المبلغ المحتسب:</span>
                <strong style={{ color: 'var(--primary)' }}>
                  {renewalPreview.calculatedPrice.toLocaleString('ar-EG')} SDG
                </strong>
              </div>
              <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                {renewalPreview.isStillActive
                  ? 'سيتم تمديد المدة تلقائياً انطلاقاً من نهاية الاشتراك الحالي دون خسارة الأيام المتبقية.'
                  : 'الاشتراك الحالي منتهٍ؛ سيبدأ التجديد الجديد انطلاقاً من تاريخ اليوم.'}
              </div>
            </div>
          )}

          {/* Renewal Notes */}
          <div>
            <label className="form-label" style={{ fontWeight: 600, marginBottom: '0.4rem', display: 'block' }}>
              ملاحظات التجديد والسداد (اختياري):
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="مثال: تم السداد نقداً / تحويل بنكي رقم #1048"
              value={renewNotes}
              onChange={(e) => setRenewNotes(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: 'var(--bg-app)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowRenewModal(false)}
              disabled={isRenewing}
              style={{ padding: '0.5rem 1rem' }}
            >
              إلغاء
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleRenewSubscription}
              disabled={isRenewing}
              style={{ padding: '0.5rem 1.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              {isRenewing ? (
                <>
                  <RefreshCw size={15} className="spin-animation" />
                  <span>جاري التجديد...</span>
                </>
              ) : (
                <span>تأكيد التجديد وتحديث الصلاحية</span>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* 3. Suspend / Resume Modal */}
      <Modal
        isOpen={showSuspendModal}
        onClose={() => setShowSuspendModal(false)}
        title={suspendAction === 'SUSPEND' ? 'تعليق الاشتراك والمنظمة إدارياً' : 'استئناف الاشتراك والمنظمة'}
        maxWidth="460px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div
            style={{
              padding: '0.85rem',
              backgroundColor: suspendAction === 'SUSPEND' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
              border: suspendAction === 'SUSPEND' ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              lineHeight: 1.5,
              color: 'var(--text-primary)',
            }}
          >
            {suspendAction === 'SUSPEND' ? (
              <div>
                <strong>تنبيه إداري:</strong> تعليق المنظمة سيؤدي فوراً إلى تجميد وصول صاحب الشبكة إلى لوحة التحكم
                وإيقاف عمليات توليد الكروت والمزامنة مع أجهزة MikroTik حتى يتم استئنافها لاحقاً.
              </div>
            ) : (
              <div>
                <strong>استئناف النشاط:</strong> ستتم إعادة تفعيل صلاحيات المنظمة والسماح لها بالدخول
                وإدارة الكروت والموجهات طالما أن تاريخ الاشتراك لا يزال سارياً.
              </div>
            )}
          </div>

          <div>
            <label className="form-label" style={{ fontWeight: 600, marginBottom: '0.4rem', display: 'block' }}>
              سبب {suspendAction === 'SUSPEND' ? 'التعليق' : 'الاستئناف'}:
            </label>
            <textarea
              className="form-input"
              rows={3}
              placeholder={suspendAction === 'SUSPEND' ? 'مثال: مخالفة شروط الاستخدام أو عدم السداد...' : 'سبب الاستئناف...'}
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: 'var(--bg-app)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowSuspendModal(false)}
              disabled={isSuspending}
            >
              تراجع
            </button>
            <button
              type="button"
              className={`btn ${suspendAction === 'SUSPEND' ? 'btn-danger' : 'btn-primary'}`}
              onClick={handleExecuteSuspend}
              disabled={isSuspending}
              style={{ padding: '0.5rem 1.25rem' }}
            >
              {isSuspending
                ? 'جاري التنفيذ...'
                : suspendAction === 'SUSPEND'
                ? 'تأكيد التعليق الإداري'
                : 'تأكيد الاستئناف'}
            </button>
          </div>
        </div>
      </Modal>

      {/* 4. Cancel Modal */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="إلغاء الاشتراك"
        maxWidth="460px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div
            style={{
              padding: '0.85rem',
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              color: 'var(--text-primary)',
              lineHeight: 1.5,
            }}
          >
            <strong>تحذير:</strong> سيتم وسم الاشتراك الحالي بالحالة <code>CANCELLED</code> (ملغى).
            لن يتم حذف سجلات الاشتراك السابقة أو بيانات المبيعات والكروت للحفاظ على سلامة القيود المالية وسجل التدقيق.
          </div>

          <div>
            <label className="form-label" style={{ fontWeight: 600, marginBottom: '0.4rem', display: 'block' }}>
              سبب إلغاء الاشتراك:
            </label>
            <textarea
              className="form-input"
              rows={3}
              placeholder="اكتب سبب الإلغاء أو إنهاء العقد..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: 'var(--bg-app)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowCancelModal(false)}
              disabled={isCancelling}
            >
              تراجع
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleExecuteCancel}
              disabled={isCancelling}
              style={{ padding: '0.5rem 1.25rem' }}
            >
              {isCancelling ? 'جاري الإلغاء...' : 'تأكيد إلغاء الاشتراك'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
