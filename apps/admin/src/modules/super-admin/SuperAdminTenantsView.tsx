import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
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
} from 'lucide-react';
import { apiClient } from '../../core/api/api-client';
import { Modal } from '../../components/common/Modal';
import { useToast } from '../../core/context/ToastContext';

interface TenantItem {
  id: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | string;
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
  } | null;
  counts: {
    devices: number;
    cards: number;
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
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
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

  const fetchTenants = async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get<PaginatedTenantsResponse>('/tenants', {
        search: search.trim() || undefined,
        status: statusFilter || undefined,
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
    } catch (err: any) {
      showToast(err.message || 'فشل تحميل قائمة الشبكات', 'error');
    } finally {
      setIsLoading(false);
    }
  };

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
      fetchTenants();
    }, 250);
    return () => clearTimeout(timer);
  }, [search, statusFilter, page]);

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
      fetchTenants();
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
      fetchTenants();
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
            إدارة أصحاب الشبكات (Tenants Management)
          </h1>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            استعراض الشبكات، إدارة الحالات التشغيلية، ومراقبة استهلاك الأجهزة والموجهات
          </p>
        </div>

        <button
          onClick={fetchTenants}
          disabled={isLoading}
          className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.85rem' }}
        >
          <RefreshCw size={15} className={isLoading ? 'spin-animation' : ''} />
          <span>تحديث القائمة</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div
        className="card"
        style={{
          padding: '1rem',
          marginBottom: '1.25rem',
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              right: '0.85rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
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
            style={{ paddingRight: '2.5rem', width: '100%' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Filter size={16} color="var(--text-muted)" />
          <select
            className="form-input"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            style={{ minWidth: '150px' }}
          >
            <option value="">جميع الحالات</option>
            <option value="ACTIVE">نشط فقط (ACTIVE)</option>
            <option value="SUSPENDED">معلق فقط (SUSPENDED)</option>
            <option value="EXPIRED">منتهي فقط (EXPIRED)</option>
          </select>
        </div>

        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          إجمالي النتائج: <strong style={{ color: 'var(--text-primary)' }}>{totalCount}</strong> شبكة
        </div>
      </div>

      {/* Tenants Table */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div className="table-responsive">
          <table className="table" style={{ width: '100%', margin: 0 }}>
            <thead>
              <tr>
                <th>الشبكة</th>
                <th>بيانات الاتصال</th>
                <th>الحالة</th>
                <th>الباقة والاشتراك</th>
                <th>الأجهزة والكروت</th>
                <th>تاريخ التسجيل</th>
                <th style={{ textAlign: 'center' }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    جاري تحميل بيانات أصحاب الشبكات...
                  </td>
                </tr>
              ) : tenants.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    لم يتم العثور على أي شبكة تطابق معايير البحث.
                  </td>
                </tr>
              ) : (
                tenants.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{t.name}</div>
                      <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                        المعرف: {t.slug}
                      </div>
                    </td>

                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      <div>{t.contactEmail || '—'}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{t.phone || '—'}</div>
                    </td>

                    <td>
                      <span
                        className={`badge ${
                          t.status === 'ACTIVE'
                            ? 'badge-success'
                            : t.status === 'SUSPENDED'
                            ? 'badge-danger'
                            : 'badge-warning'
                        }`}
                      >
                        {t.status === 'ACTIVE' ? 'نشط' : t.status === 'SUSPENDED' ? 'معلق' : t.status}
                      </span>
                    </td>

                    <td>
                      {t.activeSubscription ? (
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--primary)', fontSize: '0.85rem' }}>
                            {t.activeSubscription.planNameAr} ({t.activeSubscription.planName})
                          </div>
                          <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                            ينتهي: {new Date(t.activeSubscription.expiresAt).toLocaleDateString('ar-EG')}
                          </div>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                          بدون اشتراك نشط
                        </span>
                      )}
                    </td>

                    <td>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        <span>{t.counts.devices} موجه</span> •{' '}
                        <span>{t.counts.cards.toLocaleString('ar-EG')} كرت</span>
                      </div>
                      <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                        {t.counts.users} مستخدم
                      </div>
                    </td>

                    <td style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                      {new Date(t.createdAt).toLocaleDateString('ar-EG', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>

                    <td>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        <button
                          onClick={() => handleOpenDetails(t)}
                          className="btn btn-ghost"
                          title="عرض التفاصيل والأجهزة"
                          style={{ padding: '0.35rem' }}
                        >
                          <Eye size={16} color="var(--primary)" />
                        </button>

                        <button
                          onClick={() => handleOpenSubscriptionModal(t)}
                          className="btn btn-ghost"
                          title="تعيين / تجديد اشتراك يدوي"
                          style={{ padding: '0.35rem' }}
                        >
                          <CreditCard size={16} color="var(--accent)" />
                        </button>

                        <button
                          onClick={() => handleOpenStatusModal(t)}
                          className="btn btn-ghost"
                          title={t.status === 'ACTIVE' ? 'تعليق الحساب' : 'تفعيل الحساب'}
                          style={{ padding: '0.35rem' }}
                        >
                          {t.status === 'ACTIVE' ? (
                            <XCircle size={16} color="var(--danger)" />
                          ) : (
                            <CheckCircle2 size={16} color="var(--success)" />
                          )}
                        </button>

                        <button
                          onClick={() => handleOpenAuditModal(t)}
                          className="btn btn-ghost"
                          title="سجل العمليات والتدقيق"
                          style={{ padding: '0.35rem' }}
                        >
                          <ShieldCheck size={16} color="var(--text-secondary)" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
            }}
          >
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              صفحة {page} من {totalPages}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn btn-secondary"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{ padding: '0.35rem 0.65rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              >
                <ChevronRight size={15} />
                <span>السابق</span>
              </button>

              <button
                className="btn btn-secondary"
                disabled={page >= totalPages || isLoading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                style={{ padding: '0.35rem 0.65rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              >
                <span>التالي</span>
                <ChevronLeft size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Details Modal */}
      <Modal
        isOpen={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        title={`تفاصيل الشبكة: ${selectedTenant?.name || ''}`}
        maxWidth="680px"
      >
        {loadingDetails ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            جاري جلب تفاصيل أجهزة ومستخدمي الشبكة...
          </div>
        ) : !tenantDetails ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            تعذر جلب البيانات.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* General info */}
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
                <div style={{ fontWeight: 700 }}>{tenantDetails.name}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>المعرف الفريد (Slug):</span>
                <div style={{ fontWeight: 600, color: 'var(--primary)' }}>{tenantDetails.slug}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>الحالة:</span>
                <div>
                  <span
                    className={`badge ${
                      tenantDetails.status === 'ACTIVE'
                        ? 'badge-success'
                        : tenantDetails.status === 'SUSPENDED'
                        ? 'badge-danger'
                        : 'badge-warning'
                    }`}
                  >
                    {tenantDetails.status}
                  </span>
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>العملة المعتمدة:</span>
                <div style={{ fontWeight: 600 }}>{tenantDetails.currency || 'SDG'}</div>
              </div>
            </div>

            {/* Devices section */}
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
                        padding: '0.5rem 0.75rem',
                        backgroundColor: 'var(--bg-card-alt)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.8rem',
                      }}
                    >
                      <div>
                        <strong>{d.name}</strong> <span style={{ color: 'var(--text-muted)' }}>({d.host})</span>
                      </div>
                      <div>
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

            {/* Users section */}
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
                        backgroundColor: 'var(--bg-card-alt)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.8rem',
                      }}
                    >
                      <div>
                        <strong>{u.fullName || 'بدون اسم'}</strong>{' '}
                        <span style={{ color: 'var(--text-muted)' }}>({u.email})</span>
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
            />
            <div style={{ fontSize: '0.85rem' }}>
              {selectedTenant?.status === 'ACTIVE'
                ? `هل أنت متأكد من رغبتك في تعليق شبكة "${selectedTenant?.name}"؟ سيتم إيقاف صلاحيات دخول المستأجر.`
                : `تفعيل حساب شبكة "${selectedTenant?.name}" وإعادة تمكينه من إدارة موجهاته وكروته.`}
            </div>
          </div>

          <div>
            <label className="form-label">سبب الإجراء (يتم تسجيله في سجل التدقيق):</label>
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

      {/* Assign Subscription Modal */}
      <Modal
        isOpen={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
        title={`تعيين أو تجديد اشتراك: ${selectedTenant?.name || ''}`}
        maxWidth="500px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="form-label">اختر الباقة التجارية:</label>
            <select
              className="form-input"
              value={selectedPlanName}
              onChange={(e) => setSelectedPlanName(e.target.value)}
              style={{ width: '100%' }}
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
                style={{ width: '100%' }}
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
                style={{ width: '100%' }}
              />
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
              style={{ width: '100%' }}
            />
          </div>

          <div
            style={{
              padding: '0.75rem',
              backgroundColor: 'var(--bg-app)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            * ملاحظة: تفعيل هذا الاشتراك سيؤدي إلى إنهاء أي اشتراك نشط سابق لهذه الشبكة لضمان سلامة محرك الحصص.
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
              {isAssigningSub ? 'جاري التفعيل...' : 'تفعيل الاشتراك الآن'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Audit Logs Modal */}
      <Modal
        isOpen={showAuditModal}
        onClose={() => setShowAuditModal(false)}
        title={`سجل العمليات الإدارية: ${selectedTenant?.name || ''}`}
        maxWidth="640px"
      >
        {loadingAudit ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            جاري جلب سجل العمليات...
          </div>
        ) : auditLogs.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            لا توجد عمليات إدارية مسجلة لهذه الشبكة حتى الآن.
          </div>
        ) : (
          <div style={{ maxHeight: '420px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {auditLogs.map((log) => (
              <div
                key={log.id}
                style={{
                  padding: '0.65rem 0.85rem',
                  backgroundColor: 'var(--bg-app)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  fontSize: '0.8rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                  <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{log.action}</span>
                  <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                    {new Date(log.createdAt).toLocaleString('ar-EG')}
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  المنفذ: {log.user?.fullName || log.user?.email || 'النظام'} ({log.entity})
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
};
