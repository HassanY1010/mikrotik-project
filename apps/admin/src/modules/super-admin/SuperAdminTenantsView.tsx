import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  CheckCircle2,
  XCircle,
  Eye,
  ShieldCheck,
  RefreshCw,
  Router,
  CreditCard,
  User,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  Building2,
  Phone,
  Mail,
  Wifi,
  X,
  RotateCcw,
  AlertCircle,
  Layers,
} from 'lucide-react';
import { apiClient } from '../../core/api/api-client';
import { Modal } from '../../components/common/Modal';
import { useToast } from '../../core/context/ToastContext';

interface TenantItem {
  id: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'PENDING' | string;
  currency: string;
  contactEmail: string | null;
  phone: string | null;
  createdAt: string;
  activeSubscription: {
    id: string;
    planName: string;
    planNameAr: string;
    maxRouters: number;
    expiresAt: string;
    billingCycle: string;
    status?: string;
    isCurrentActive?: boolean;
  } | null;
  counts: {
    devices: number;
    onlineDevices?: number;
    cards: number;
    consumedCards?: number;
    users: number;
  };
}

interface PaginatedTenantsResponse {
  data: TenantItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface PlanOption {
  id: string;
  name: string;
  nameAr: string;
  maxRouters: number;
  priceMonthly: number;
  priceYearly: number;
}

export const SuperAdminTenantsView: React.FC = () => {
  const { showToast } = useToast();
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filters state
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [subscriptionFilter, setSubscriptionFilter] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Modals state
  const [selectedTenant, setSelectedTenant] = useState<TenantItem | null>(null);
  const [tenantDetails, setTenantDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);
  const [showDetailsModal, setShowDetailsModal] = useState<boolean>(false);

  // Status update modal
  const [showStatusModal, setShowStatusModal] = useState<boolean>(false);
  const [statusReason, setStatusReason] = useState<string>('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);

  // Assign subscription modal
  const [showSubscriptionModal, setShowSubscriptionModal] = useState<boolean>(false);
  const [selectedPlanName, setSelectedPlanName] = useState<string>('');
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [durationMonths, setDurationMonths] = useState<number>(1);
  const [subscriptionNotes, setSubscriptionNotes] = useState<string>('');
  const [isAssigningSub, setIsAssigningSub] = useState<boolean>(false);

  // Audit logs modal
  const [showAuditModal, setShowAuditModal] = useState<boolean>(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState<boolean>(false);

  const fetchTenants = useCallback(async (isManual = false) => {
    if (isManual) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const res = await apiClient.get<PaginatedTenantsResponse>('/tenants', {
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        subscriptionStatus: subscriptionFilter || undefined,
        page,
        limit: 15,
      });

      if (res && res.data) {
        setTenants(res.data);
        setTotalPages(res.meta?.totalPages || 1);
        setTotalCount(res.meta?.total || 0);
      } else if (Array.isArray(res)) {
        setTenants(res as any);
        setTotalCount((res as any).length);
        setTotalPages(1);
      }
      setFetchError(null);
      if (isManual) {
        showToast('تم تحديث قائمة الشبكات بنجاح', 'success');
      }
    } catch (err: any) {
      const msg = err.message || 'فشل تحميل قائمة الشبكات';
      setFetchError(msg);
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [search, statusFilter, subscriptionFilter, page, showToast]);

  const fetchPlans = async () => {
    try {
      const res = await apiClient.get<PlanOption[]>('/plans');
      if (Array.isArray(res)) {
        setPlans(res);
        if (res.length > 0) {
          setSelectedPlanName(res[0].name);
        }
      }
    } catch {
      // Ignore background plans fetch failure
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTenants(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchTenants]);

  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('');
    setSubscriptionFilter('');
    setPage(1);
  };

  const handleOpenDetails = async (tenant: TenantItem) => {
    setSelectedTenant(tenant);
    setShowDetailsModal(true);
    setLoadingDetails(true);
    try {
      const res = await apiClient.get<any>(`/tenants/${tenant.id}`);
      setTenantDetails(res);
    } catch (err: any) {
      showToast(err.message || 'فشل تحميل تفاصيل الشبكة', 'error');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleOpenStatusModal = (tenant: TenantItem) => {
    setSelectedTenant(tenant);
    setStatusReason('');
    setShowStatusModal(true);
  };

  const handleToggleStatus = async () => {
    if (!selectedTenant) return;
    const newStatus = selectedTenant.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setIsUpdatingStatus(true);
    try {
      await apiClient.patch(`/tenants/${selectedTenant.id}/status`, {
        status: newStatus,
        reason: statusReason.trim() || (newStatus === 'SUSPENDED' ? 'تعليق إداري' : 'تفعيل إداري'),
      });
      showToast(
        newStatus === 'ACTIVE' ? 'تم تنشيط حساب الشبكة بنجاح' : 'تم تعليق حساب الشبكة بنجاح',
        'success',
      );
      setShowStatusModal(false);
      fetchTenants(false);
    } catch (err: any) {
      showToast(err.message || 'فشل تحديث حالة الشبكة', 'error');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleOpenSubscriptionModal = (tenant: TenantItem) => {
    setSelectedTenant(tenant);
    setSubscriptionNotes('');
    setDurationMonths(1);
    setBillingCycle('MONTHLY');
    // Default to tenant's current plan if active
    if (tenant.activeSubscription?.planName) {
      setSelectedPlanName(tenant.activeSubscription.planName);
    } else if (plans.length > 0) {
      setSelectedPlanName(plans[0].name);
    }
    setShowSubscriptionModal(true);
  };

  const handleAssignSubscription = async () => {
    if (!selectedTenant || !selectedPlanName) return;
    setIsAssigningSub(true);
    try {
      await apiClient.post(`/tenants/${selectedTenant.id}/subscription/approve`, {
        planName: selectedPlanName,
        billingCycle,
        durationMonths: Number(durationMonths),
        notes: subscriptionNotes.trim() || undefined,
      });
      showToast('تم تعيين وتفعيل الاشتراك بنجاح', 'success');
      setShowSubscriptionModal(false);
      fetchTenants(false);
    } catch (err: any) {
      showToast(err.message || 'فشل تعيين الاشتراك للشبكة', 'error');
    } finally {
      setIsAssigningSub(false);
    }
  };

  const handleOpenAuditModal = async (tenant: TenantItem) => {
    setSelectedTenant(tenant);
    setShowAuditModal(true);
    setLoadingAudit(true);
    try {
      const res = await apiClient.get<any>(`/tenants/${tenant.id}/audit-logs`);
      setAuditLogs(res?.data || []);
    } catch (err: any) {
      showToast(err.message || 'فشل تحميل سجل التدقيق للشبكة', 'error');
    } finally {
      setLoadingAudit(false);
    }
  };

  const isFiltered = Boolean(search || statusFilter || subscriptionFilter);

  // Selected plan helper for the assign modal
  const activePlanObj = plans.find((p) => p.name === selectedPlanName);
  const estimatedPrice = activePlanObj
    ? billingCycle === 'YEARLY'
      ? activePlanObj.priceYearly
      : activePlanObj.priceMonthly * durationMonths
    : 0;

  // Expected expiry date calculation
  const calculateEstimatedExpiry = () => {
    if (!selectedTenant) return '—';
    const now = new Date();
    const hasUnexpiredSub =
      selectedTenant.activeSubscription?.expiresAt &&
      new Date(selectedTenant.activeSubscription.expiresAt) > now;
    const baseDate = hasUnexpiredSub
      ? new Date(selectedTenant.activeSubscription!.expiresAt)
      : now;
    const target = new Date(baseDate);
    target.setMonth(target.getMonth() + Number(durationMonths || 1));
    return target.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

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
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            إدارة أصحاب الشبكات (Tenants Management)
          </h1>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginTop: '0.25rem', marginBottom: 0 }}>
            استعراض الشبكات، إدارة الحالات التشغيلية، ومراقبة استهلاك الأجهزة والموجهات
          </p>
        </div>

        <button
          onClick={() => fetchTenants(true)}
          disabled={isLoading || isRefreshing}
          className="btn btn-secondary"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 0.95rem',
            minHeight: '38px',
          }}
          title="تحديث قائمة الشبكات من قاعدة البيانات"
        >
          <RefreshCw size={15} className={isLoading || isRefreshing ? 'spin-animation' : ''} />
          <span style={{ fontSize: '0.825rem', fontWeight: 600 }}>
            {isRefreshing ? 'جاري التحديث...' : 'تحديث القائمة'}
          </span>
        </button>
      </div>

      {/* Error Banner */}
      {fetchError && (
        <div
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '0.85rem 1rem',
            marginBottom: '1rem',
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
                تعذر الاتصال بالخادم
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {fetchError} (يتم عرض البيانات المحفوظة مؤقتاً)
              </div>
            </div>
          </div>
          <button
            onClick={() => fetchTenants(true)}
            className="btn btn-outline"
            style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Enhanced Filter & Search Toolbar */}
      <div
        className="card"
        style={{
          padding: '1rem',
          marginBottom: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.85rem',
            flexWrap: 'wrap',
          }}
        >
          {/* Search Box */}
          <div style={{ flex: '2 1 280px', minWidth: '240px', position: 'relative' }}>
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
              placeholder="بحث باسم الشبكة، السجل slug، البريد، أو الهاتف..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              style={{
                paddingRight: '2.5rem',
                paddingLeft: search ? '2.2rem' : '0.85rem',
                width: '100%',
                height: '42px',
                fontSize: '0.85rem',
                backgroundColor: 'var(--bg-app)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
                borderRadius: 'var(--radius-md)',
              }}
            />
            {search && (
              <button
                onClick={() => {
                  setSearch('');
                  setPage(1);
                }}
                style={{
                  position: 'absolute',
                  left: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="مسح البحث"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Account Status Filter */}
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
                fontSize: '0.85rem',
                backgroundColor: 'var(--bg-app)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
                borderRadius: 'var(--radius-md)',
                paddingRight: '1rem',
                paddingLeft: '1.75rem',
              }}
            >
              <option value="">جميع حالات الحساب</option>
              <option value="ACTIVE">نشط (ACTIVE)</option>
              <option value="SUSPENDED">معلق (SUSPENDED)</option>
              <option value="PENDING">قيد المراجعة (PENDING)</option>
              <option value="EXPIRED">منتهي (EXPIRED)</option>
            </select>
          </div>

          {/* Subscription Status Filter */}
          <div style={{ flex: '1 1 180px', minWidth: '160px', position: 'relative' }}>
            <select
              className="form-input"
              value={subscriptionFilter}
              onChange={(e) => {
                setSubscriptionFilter(e.target.value);
                setPage(1);
              }}
              style={{
                width: '100%',
                height: '42px',
                fontSize: '0.85rem',
                backgroundColor: 'var(--bg-app)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
                borderRadius: 'var(--radius-md)',
                paddingRight: '1rem',
                paddingLeft: '1.75rem',
              }}
            >
              <option value="">جميع الاشتراكات</option>
              <option value="ACTIVE">اشتراك سارٍ</option>
              <option value="EXPIRED">اشتراك منتهي</option>
              <option value="NONE">بدون اشتراك نشط</option>
            </select>
          </div>
        </div>

        {/* Toolbar Bottom Bar: Results Count + Reset */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '0.5rem',
            borderTop: '1px solid var(--border)',
            fontSize: '0.8rem',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.2rem 0.6rem',
                backgroundColor: 'var(--bg-app)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                fontWeight: 600,
              }}
            >
              <Building2 size={13} color="var(--primary)" />
              <span>إجمالي النتائج:</span>
              <strong style={{ color: 'var(--primary)', margin: '0 0.15rem' }}>{totalCount}</strong>
              <span>شبكة</span>
            </span>

            {isFiltered && (
              <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                (تطبيق معايير فلترة مخصصة)
              </span>
            )}
          </div>

          {isFiltered && (
            <button
              onClick={handleResetFilters}
              className="btn btn-ghost"
              style={{
                fontSize: '0.75rem',
                padding: '0.2rem 0.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                color: 'var(--text-secondary)',
              }}
              title="إعادة ضبط الفلاتر والبحث"
            >
              <RotateCcw size={12} />
              <span>إعادة ضبط</span>
            </button>
          )}
        </div>
      </div>

      {/* Tenants Table & Cards Container */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        {/* Desktop Table View (min-width: 768px) */}
        <div className="super-admin-desktop-table table-responsive">
          <table className="table" style={{ width: '100%', margin: 0, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'right', padding: '0.75rem' }}>الشبكة والمعرف</th>
                <th style={{ textAlign: 'right', padding: '0.75rem' }}>بيانات الاتصال</th>
                <th style={{ textAlign: 'center', padding: '0.75rem' }}>حالة الحساب</th>
                <th style={{ textAlign: 'right', padding: '0.75rem' }}>الباقة والاشتراك</th>
                <th style={{ textAlign: 'center', padding: '0.75rem' }}>الموجهات والأجهزة</th>
                <th style={{ textAlign: 'center', padding: '0.75rem' }}>الكروت والمستخدمين</th>
                <th style={{ textAlign: 'right', padding: '0.75rem' }}>تاريخ التسجيل</th>
                <th style={{ textAlign: 'center', padding: '0.75rem' }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && !tenants.length ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3.5rem', color: 'var(--text-muted)' }}>
                    جاري تحميل بيانات أصحاب الشبكات...
                  </td>
                </tr>
              ) : tenants.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3.5rem', color: 'var(--text-muted)' }}>
                    لم يتم العثور على أي شبكة تطابق معايير البحث.
                  </td>
                </tr>
              ) : (
                tenants.map((t) => {
                  const isSubActive = t.activeSubscription?.status === 'ACTIVE' || t.activeSubscription?.isCurrentActive;
                  const isSubExpired = t.activeSubscription?.status === 'EXPIRED';

                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      {/* 1. Network Name & Slug */}
                      <td style={{ padding: '0.75rem' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{t.name}</div>
                        <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', direction: 'ltr', textAlign: 'right' }}>
                          المعرف: {t.slug}
                        </div>
                      </td>

                      {/* 2. Contact Information */}
                      <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', direction: 'ltr', justifyContent: 'flex-end' }}>
                          <span style={{ wordBreak: 'break-all' }}>{t.contactEmail || '—'}</span>
                          <Mail size={12} color="var(--text-muted)" />
                        </div>
                        {t.phone && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-muted)', fontSize: '0.725rem', marginTop: '0.15rem', direction: 'ltr', justifyContent: 'flex-end' }}>
                            <span>{t.phone}</span>
                            <Phone size={11} />
                          </div>
                        )}
                      </td>

                      {/* 3. Account Status */}
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        <span
                          className={`badge ${
                            t.status === 'ACTIVE'
                              ? 'badge-success'
                              : t.status === 'SUSPENDED'
                              ? 'badge-danger'
                              : 'badge-warning'
                          }`}
                          style={{ fontSize: '0.725rem', padding: '0.2rem 0.5rem' }}
                        >
                          {t.status === 'ACTIVE'
                            ? 'نشط'
                            : t.status === 'SUSPENDED'
                            ? 'معلق'
                            : t.status === 'PENDING'
                            ? 'قيد المراجعة'
                            : t.status}
                        </span>
                      </td>

                      {/* 4. Plan & Subscription */}
                      <td style={{ padding: '0.75rem' }}>
                        {t.activeSubscription ? (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 600, color: 'var(--primary)', fontSize: '0.825rem' }}>
                                {t.activeSubscription.planNameAr} ({t.activeSubscription.planName})
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
                                {isSubActive ? 'سارٍ' : isSubExpired ? 'منتهي' : 'ملغي'}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                              ينتهي: {new Date(t.activeSubscription.expiresAt).toLocaleDateString('ar-EG')}
                            </div>
                          </div>
                        ) : (
                          <span className="badge badge-secondary" style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem' }}>
                            بدون اشتراك نشط
                          </span>
                        )}
                      </td>

                      {/* 5. Routers / Devices */}
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Wifi size={13} color="var(--info)" />
                            {t.counts.devices} موجه
                          </span>
                        </div>
                        {t.counts.onlineDevices !== undefined && (
                          <div style={{ fontSize: '0.7rem', color: t.counts.onlineDevices > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                            {t.counts.onlineDevices} متصل حالياً
                          </div>
                        )}
                      </td>

                      {/* 6. Cards & Users */}
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          <bdi>{t.counts.cards.toLocaleString('ar-EG')}</bdi> كرت
                          {t.counts.consumedCards !== undefined && t.counts.consumedCards > 0 && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--accent)', marginRight: '0.25rem' }}>
                              (<bdi>{t.counts.consumedCards.toLocaleString('ar-EG')}</bdi> مستهلك)
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                          {t.counts.users} مستخدم
                        </div>
                      </td>

                      {/* 7. Registration Date */}
                      <td style={{ padding: '0.75rem', fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                        {new Date(t.createdAt).toLocaleDateString('ar-EG', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>

                      {/* 8. Administrative Actions */}
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.4rem',
                          }}
                        >
                          <button
                            onClick={() => handleOpenDetails(t)}
                            className="btn btn-ghost btn-sm"
                            title="عرض التفاصيل والأجهزة"
                            style={{ padding: '0.35rem 0.45rem', borderRadius: 'var(--radius-sm)' }}
                          >
                            <Eye size={15} color="var(--primary)" />
                          </button>

                          <button
                            onClick={() => handleOpenSubscriptionModal(t)}
                            className="btn btn-ghost btn-sm"
                            title="تعيين أو تجديد اشتراك يدوي"
                            style={{ padding: '0.35rem 0.45rem', borderRadius: 'var(--radius-sm)' }}
                          >
                            <CreditCard size={15} color="var(--accent)" />
                          </button>

                          <button
                            onClick={() => handleOpenStatusModal(t)}
                            className="btn btn-ghost btn-sm"
                            title={t.status === 'ACTIVE' ? 'تعليق حساب الشبكة' : 'تفعيل حساب الشبكة'}
                            style={{ padding: '0.35rem 0.45rem', borderRadius: 'var(--radius-sm)' }}
                          >
                            {t.status === 'ACTIVE' ? (
                              <XCircle size={15} color="var(--danger)" />
                            ) : (
                              <CheckCircle2 size={15} color="var(--success)" />
                            )}
                          </button>

                          <button
                            onClick={() => handleOpenAuditModal(t)}
                            className="btn btn-ghost btn-sm"
                            title="سجل العمليات والتدقيق"
                            style={{ padding: '0.35rem 0.45rem', borderRadius: 'var(--radius-sm)' }}
                          >
                            <ShieldCheck size={15} color="var(--text-secondary)" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards View (max-width: 767px) - Touch friendly without horizontal overflow */}
        <div className="super-admin-mobile-cards" style={{ padding: '0.85rem' }}>
          {isLoading && !tenants.length ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              جاري تحميل بيانات الشبكات...
            </div>
          ) : tenants.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              لم يتم العثور على أي شبكة تطابق معايير البحث.
            </div>
          ) : (
            tenants.map((t) => {
              const isSubActive = t.activeSubscription?.status === 'ACTIVE' || t.activeSubscription?.isCurrentActive;
              const isSubExpired = t.activeSubscription?.status === 'EXPIRED';

              return (
                <div
                  key={t.id}
                  style={{
                    padding: '0.95rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-app)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                  }}
                >
                  {/* Header Row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                        {t.name}
                      </div>
                      <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', direction: 'ltr', textAlign: 'right' }}>
                        {t.slug}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-end', flexShrink: 0 }}>
                      <span
                        className={`badge ${
                          t.status === 'ACTIVE'
                            ? 'badge-success'
                            : t.status === 'SUSPENDED'
                            ? 'badge-danger'
                            : 'badge-warning'
                        }`}
                        style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem' }}
                      >
                        {t.status === 'ACTIVE' ? 'نشط' : t.status === 'SUSPENDED' ? 'معلق' : t.status}
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
                        {isSubActive ? 'اشتراك سارٍ' : isSubExpired ? 'منتهي' : 'بدون اشتراك'}
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
                      padding: '0.6rem',
                      backgroundColor: 'var(--bg-card)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>البريد: </span>
                      <span style={{ color: 'var(--text-secondary)', direction: 'ltr', display: 'inline-block' }}>
                        {t.contactEmail || '—'}
                      </span>
                    </div>

                    {t.phone && (
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>الهاتف: </span>
                        <span style={{ color: 'var(--text-secondary)', direction: 'ltr', display: 'inline-block' }}>
                          {t.phone}
                        </span>
                      </div>
                    )}

                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>الباقة: </span>
                      <span style={{ fontWeight: 600, color: 'var(--primary)' }}>
                        {t.activeSubscription?.planNameAr || t.activeSubscription?.planName || 'بدون باقة'}
                      </span>
                    </div>

                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>الموجهات: </span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {t.counts.devices} موجه
                      </span>
                    </div>

                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>الكروت: </span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        <bdi>{t.counts.cards.toLocaleString('ar-EG')}</bdi> كرت
                      </span>
                    </div>

                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>المستخدمين: </span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {t.counts.users} مستخدم
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons Toolbar for Mobile */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '0.5rem',
                      marginTop: '0.2rem',
                    }}
                  >
                    <button
                      onClick={() => handleOpenDetails(t)}
                      className="btn btn-secondary btn-sm"
                      style={{
                        minHeight: '38px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.35rem',
                        fontSize: '0.775rem',
                      }}
                    >
                      <Eye size={14} color="var(--primary)" />
                      <span>التفاصيل والأجهزة</span>
                    </button>

                    <button
                      onClick={() => handleOpenSubscriptionModal(t)}
                      className="btn btn-secondary btn-sm"
                      style={{
                        minHeight: '38px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.35rem',
                        fontSize: '0.775rem',
                      }}
                    >
                      <CreditCard size={14} color="var(--accent)" />
                      <span>تجديد / اشتراك</span>
                    </button>

                    <button
                      onClick={() => handleOpenStatusModal(t)}
                      className={`btn btn-sm ${t.status === 'ACTIVE' ? 'btn-ghost' : 'btn-primary'}`}
                      style={{
                        minHeight: '38px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.35rem',
                        fontSize: '0.775rem',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {t.status === 'ACTIVE' ? (
                        <>
                          <XCircle size={14} color="var(--danger)" />
                          <span style={{ color: 'var(--danger)' }}>تعليق الحساب</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={14} color="white" />
                          <span>تفعيل الحساب</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleOpenAuditModal(t)}
                      className="btn btn-secondary btn-sm"
                      style={{
                        minHeight: '38px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.35rem',
                        fontSize: '0.775rem',
                      }}
                    >
                      <ShieldCheck size={14} color="var(--text-secondary)" />
                      <span>سجل التدقيق</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div
            style={{
              padding: '0.75rem 1.25rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid var(--border)',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              صفحة {page} من {totalPages} (إجمالي {totalCount} شبكة)
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn btn-secondary"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{ padding: '0.35rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem', minHeight: '36px' }}
              >
                <ChevronRight size={15} />
                <span>السابق</span>
              </button>

              <button
                className="btn btn-secondary"
                disabled={page >= totalPages || isLoading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                style={{ padding: '0.35rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem', minHeight: '36px' }}
              >
                <span>التالي</span>
                <ChevronLeft size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Details & Devices Modal */}
      <Modal
        isOpen={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        title={`تفاصيل الشبكة: ${selectedTenant?.name || ''}`}
        maxWidth="720px"
      >
        {loadingDetails ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            جاري جلب تفاصيل أجهزة ومستخدمي الشبكة...
          </div>
        ) : !tenantDetails ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            تعذر جلب البيانات.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* General Info */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '0.75rem',
                backgroundColor: 'var(--bg-app)',
                padding: '0.85rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
              }}
            >
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>اسم الشبكة:</span>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{tenantDetails.name}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>المعرف الفريد (Slug):</span>
                <div style={{ fontWeight: 600, color: 'var(--primary)', direction: 'ltr', textAlign: 'right' }}>
                  {tenantDetails.slug}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>حالة الحساب:</span>
                <div>
                  <span
                    className={`badge ${
                      tenantDetails.status === 'ACTIVE'
                        ? 'badge-success'
                        : tenantDetails.status === 'SUSPENDED'
                        ? 'badge-danger'
                        : 'badge-warning'
                    }`}
                    style={{ fontSize: '0.7rem' }}
                  >
                    {tenantDetails.status === 'ACTIVE' ? 'نشط' : tenantDetails.status === 'SUSPENDED' ? 'معلق' : tenantDetails.status}
                  </span>
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>البريد الإلكتروني:</span>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', direction: 'ltr', textAlign: 'right' }}>
                  {tenantDetails.contactEmail || '—'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>رقم الهاتف:</span>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', direction: 'ltr', textAlign: 'right' }}>
                  {tenantDetails.phone || '—'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>تاريخ التسجيل:</span>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {new Date(tenantDetails.createdAt).toLocaleDateString('ar-EG', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </div>
              </div>
            </div>

            {/* Active Subscription Summary */}
            {tenantDetails.subscriptions && tenantDetails.subscriptions.length > 0 ? (
              <div
                style={{
                  padding: '0.85rem',
                  backgroundColor: 'rgba(13, 148, 136, 0.08)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(13, 148, 136, 0.25)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Layers size={16} />
                    <span>الاشتراك الحالي: {tenantDetails.subscriptions[0].plan?.nameAr || tenantDetails.subscriptions[0].plan?.name}</span>
                  </div>
                  <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>
                    {tenantDetails.subscriptions[0].status}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem', fontSize: '0.75rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>تاريخ البداية: </span>
                    <span>{new Date(tenantDetails.subscriptions[0].startsAt).toLocaleDateString('ar-EG')}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>تاريخ الانتهاء: </span>
                    <span style={{ fontWeight: 600 }}>{new Date(tenantDetails.subscriptions[0].expiresAt).toLocaleDateString('ar-EG')}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>الحد الأقصى للموجهات: </span>
                    <span>{tenantDetails.subscriptions[0].maxRouters} موجه</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>دورة الفوترة: </span>
                    <span>{tenantDetails.subscriptions[0].billingCycle === 'YEARLY' ? 'سنوي' : 'شهري'}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: '0.75rem',
                  backgroundColor: 'var(--bg-app)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                }}
              >
                لا يوجد اشتراك نشط مسجل لهذه الشبكة. يمكنك تعيين اشتراك جديد عبر زر «تجديد / اشتراك».
              </div>
            )}

            {/* Devices Section */}
            <div>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Router size={16} color="var(--primary)" /> أجهزة الموجهات MikroTik ({tenantDetails.devices?.length || 0})
              </h4>
              {!tenantDetails.devices?.length ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>لا توجد أجهزة ميكروتك مربوطة حتى الآن.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {tenantDetails.devices.map((d: any) => (
                    <div
                      key={d.id}
                      style={{
                        padding: '0.6rem 0.85rem',
                        backgroundColor: 'var(--bg-app)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.8rem',
                        flexWrap: 'wrap',
                        gap: '0.5rem',
                      }}
                    >
                      <div>
                        <strong>{d.name}</strong>{' '}
                        <span style={{ color: 'var(--text-muted)', direction: 'ltr', display: 'inline-block' }}>
                          ({d.host})
                        </span>
                        {d.lastSyncAt && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            آخر مزامنة: {new Date(d.lastSyncAt).toLocaleTimeString('ar-EG')}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {d.rosVersion || 'RouterOS'}
                        </span>
                        <span
                          className={`badge ${d.isOnline ? 'badge-success' : 'badge-danger'}`}
                          style={{ fontSize: '0.7rem' }}
                        >
                          {d.isOnline ? 'متصل' : 'غير متصل'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cards Consumption Stats */}
            {tenantDetails.cardStats && (
              <div>
                <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <CreditCard size={16} color="var(--accent)" /> إحصائيات الكروت الحقيقية
                </h4>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ padding: '0.5rem', backgroundColor: 'var(--bg-app)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>إجمالي الكروت</div>
                    <div style={{ fontSize: '1rem', fontWeight: 700 }}>{tenantDetails.cardStats.total.toLocaleString('ar-EG')}</div>
                  </div>
                  <div style={{ padding: '0.5rem', backgroundColor: 'var(--bg-app)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--success)' }}>كروت مفعلة نشطة</div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--success)' }}>{tenantDetails.cardStats.active.toLocaleString('ar-EG')}</div>
                  </div>
                  <div style={{ padding: '0.5rem', backgroundColor: 'var(--bg-app)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>كروت منتهية</div>
                    <div style={{ fontSize: '1rem', fontWeight: 700 }}>{tenantDetails.cardStats.expired.toLocaleString('ar-EG')}</div>
                  </div>
                  <div style={{ padding: '0.5rem', backgroundColor: 'var(--bg-app)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--info)' }}>كروت متاحة للبيع</div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--info)' }}>{tenantDetails.cardStats.available.toLocaleString('ar-EG')}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Users Section */}
            <div>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <User size={16} color="var(--info)" /> مستخدمو ومسؤولو الشبكة ({tenantDetails.users?.length || 0})
              </h4>
              {!tenantDetails.users?.length ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>لا يوجد مستخدمون مسجلون.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {tenantDetails.users.map((u: any) => (
                    <div
                      key={u.id}
                      style={{
                        padding: '0.5rem 0.75rem',
                        backgroundColor: 'var(--bg-app)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.8rem',
                      }}
                    >
                      <div>
                        <strong>{u.fullName || 'بدون اسم'}</strong>{' '}
                        <span style={{ color: 'var(--text-muted)', direction: 'ltr', display: 'inline-block' }}>
                          ({u.email})
                        </span>
                      </div>
                      <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>
                        {u.role?.name || 'USER'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Status Toggle Modal */}
      <Modal
        isOpen={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        title={selectedTenant?.status === 'ACTIVE' ? 'تعليق حساب الشبكة' : 'تفعيل حساب الشبكة'}
        maxWidth="460px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div
            style={{
              padding: '0.85rem',
              backgroundColor: selectedTenant?.status === 'ACTIVE' ? 'var(--danger-bg)' : 'var(--success-bg)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              gap: '0.75rem',
              alignItems: 'center',
            }}
          >
            <AlertTriangle
              size={22}
              color={selectedTenant?.status === 'ACTIVE' ? 'var(--danger)' : 'var(--success)'}
              style={{ flexShrink: 0 }}
            />
            <div style={{ fontSize: '0.85rem' }}>
              {selectedTenant?.status === 'ACTIVE'
                ? `هل أنت متأكد من رغبتك في تعليق شبكة "${selectedTenant?.name}"؟ سيتم إيقاف صلاحيات دخول المستأجر دون حذف بيانات الموجهات أو الكروت.`
                : `تفعيل حساب شبكة "${selectedTenant?.name}" وإعادة تمكينه من إدارة موجهاته وكروته بالكامل.`}
            </div>
          </div>

          <div>
            <label className="form-label">سبب الإجراء (يتم توثيقه في سجل التدقيق):</label>
            <textarea
              className="form-input"
              rows={3}
              placeholder="اكتب سبب التعليق أو التفعيل هنا..."
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowStatusModal(false)}
              disabled={isUpdatingStatus}
            >
              إلغاء
            </button>
            <button
              className={`btn ${selectedTenant?.status === 'ACTIVE' ? 'btn-danger' : 'btn-primary'}`}
              onClick={handleToggleStatus}
              disabled={isUpdatingStatus}
            >
              {isUpdatingStatus ? 'جاري الحفظ...' : 'تأكيد الإجراء'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Assign / Renew Subscription Modal */}
      <Modal
        isOpen={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
        title={`تعيين أو تجديد اشتراك: ${selectedTenant?.name || ''}`}
        maxWidth="520px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="form-label">اختر الباقة التجارية:</label>
            <select
              className="form-input"
              value={selectedPlanName}
              onChange={(e) => setSelectedPlanName(e.target.value)}
              style={{ width: '100%', minHeight: '40px' }}
            >
              {plans.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.nameAr} ({p.name}) — {p.priceMonthly} شهريًا / {p.priceYearly} سنويًا — حد {p.maxRouters} موجه
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label className="form-label">دورة الفوترة:</label>
              <select
                className="form-input"
                value={billingCycle}
                onChange={(e) => setBillingCycle(e.target.value as any)}
                style={{ width: '100%', minHeight: '40px' }}
              >
                <option value="MONTHLY">شهري (MONTHLY)</option>
                <option value="YEARLY">سنوي (YEARLY)</option>
              </select>
            </div>

            <div>
              <label className="form-label">مدة الاشتراك (بالأشهر):</label>
              <input
                type="number"
                min="1"
                max="36"
                className="form-input"
                value={durationMonths}
                onChange={(e) => setDurationMonths(Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={{ width: '100%', minHeight: '40px' }}
              />
            </div>
          </div>

          {/* Pricing & Expiry Preview Box */}
          <div
            style={{
              padding: '0.75rem 0.95rem',
              backgroundColor: 'var(--bg-app)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem',
              fontSize: '0.8rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>تاريخ الانتهاء المتوقع:</span>
              <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{calculateEstimatedExpiry()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>السعر المحتسب:</span>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                {estimatedPrice} {selectedTenant?.currency || 'SDG'}
              </span>
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              * عند التجديد المبكر، يتم تمديد الفترة من تاريخ الانتهاء الحالي لضمان عدم ضياع الأيام المدفوعة.
            </div>
          </div>

          <div>
            <label className="form-label">ملاحظات الاعتماد والتحصيل اليدوي:</label>
            <input
              type="text"
              className="form-input"
              placeholder="مثال: تحصيل يدوي نقدًا - إيصال رقم 1045"
              value={subscriptionNotes}
              onChange={(e) => setSubscriptionNotes(e.target.value)}
              style={{ width: '100%', minHeight: '40px' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowSubscriptionModal(false)}
              disabled={isAssigningSub}
            >
              إلغاء
            </button>
            <button
              className="btn btn-primary"
              onClick={handleAssignSubscription}
              disabled={isAssigningSub || !selectedPlanName}
            >
              {isAssigningSub ? 'جاري التفعيل...' : 'تأكيد وتفعيل الاشتراك'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Audit Logs Modal */}
      <Modal
        isOpen={showAuditModal}
        onClose={() => setShowAuditModal(false)}
        title={`سجل العمليات الإدارية: ${selectedTenant?.name || ''}`}
        maxWidth="680px"
      >
        {loadingAudit ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            جاري جلب سجل العمليات...
          </div>
        ) : auditLogs.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            لا توجد عمليات إدارية مسجلة لهذه الشبكة حتى الآن.
          </div>
        ) : (
          <div style={{ maxHeight: '440px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {auditLogs.map((log) => (
              <div
                key={log.id}
                style={{
                  padding: '0.75rem 0.95rem',
                  backgroundColor: 'var(--bg-app)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  fontSize: '0.8rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{log.action}</span>
                  <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                    {new Date(log.createdAt).toLocaleString('ar-EG')}
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  المنفذ: <strong>{log.user?.fullName || log.user?.email || 'النظام'}</strong> ({log.entity})
                </div>
                {log.newValues && (
                  <div
                    style={{
                      marginTop: '0.35rem',
                      padding: '0.35rem 0.5rem',
                      backgroundColor: 'var(--bg-card)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.7rem',
                      color: 'var(--text-muted)',
                      direction: 'ltr',
                      textAlign: 'left',
                      fontFamily: 'monospace',
                    }}
                  >
                    {JSON.stringify(log.newValues)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
};
