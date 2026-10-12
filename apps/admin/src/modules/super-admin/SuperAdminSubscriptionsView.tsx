import React, { useState, useEffect } from 'react';
import {
  Filter,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { apiClient } from '../../core/api/api-client';
import { Modal } from '../../components/common/Modal';
import { useToast } from '../../core/context/ToastContext';

interface SubscriptionItem {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: string;
  planId: string;
  planName: string;
  planNameAr: string;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'TRIAL' | string;
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
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Renew modal state
  const [showRenewModal, setShowRenewModal] = useState<boolean>(false);
  const [selectedSub, setSelectedSub] = useState<SubscriptionItem | null>(null);
  const [renewMonths, setRenewMonths] = useState<number>(1);
  const [renewNotes, setRenewNotes] = useState<string>('');
  const [isRenewing, setIsRenewing] = useState<boolean>(false);

  // Status modal state
  const [showStatusModal, setShowStatusModal] = useState<boolean>(false);
  const [newStatus, setNewStatus] = useState<string>('CANCELLED');
  const [statusNotes, setStatusNotes] = useState<string>('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);

  const fetchSubscriptions = async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get<PaginatedSubscriptionsResponse>('/tenants/admin/subscriptions', {
        status: statusFilter || undefined,
        page,
        limit: 15,
      });

      if (res && res.data) {
        setSubscriptions(res.data);
        setTotalPages(res.meta?.totalPages || 1);
        setTotalCount(res.meta?.total || 0);
      }
    } catch (err: any) {
      showToast(err.message || 'فشل تحميل قائمة الاشتراكات', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, [statusFilter, page]);

  const handleOpenRenew = (sub: SubscriptionItem) => {
    setSelectedSub(sub);
    setRenewMonths(sub.billingCycle === 'YEARLY' ? 12 : 1);
    setRenewNotes('');
    setShowRenewModal(true);
  };

  const handleRenewSubscription = async () => {
    if (!selectedSub) return;
    setIsRenewing(true);
    try {
      await apiClient.post(`/tenants/subscriptions/${selectedSub.id}/renew`, {
        durationMonths: Number(renewMonths),
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

  const handleOpenStatus = (sub: SubscriptionItem) => {
    setSelectedSub(sub);
    setNewStatus(sub.status === 'ACTIVE' ? 'CANCELLED' : 'ACTIVE');
    setStatusNotes('');
    setShowStatusModal(true);
  };

  const handleUpdateStatus = async () => {
    if (!selectedSub) return;
    setIsUpdatingStatus(true);
    try {
      await apiClient.patch(`/tenants/subscriptions/${selectedSub.id}/status`, {
        status: newStatus,
        notes: statusNotes.trim() || undefined,
      });
      showToast('تم تحديث حالة الاشتراك بنجاح', 'success');
      setShowStatusModal(false);
      fetchSubscriptions();
    } catch (err: any) {
      showToast(err.message || 'فشل تحديث حالة الاشتراك', 'error');
    } finally {
      setIsUpdatingStatus(false);
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
            إدارة اشتراكات العملاء (Subscription Management)
          </h1>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            متابعة الاشتراكات الفعالة، التجديد اليدوي، وإنهاء أو تعليق العقود
          </p>
        </div>

        <button
          onClick={fetchSubscriptions}
          disabled={isLoading}
          className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.85rem' }}
        >
          <RefreshCw size={15} className={isLoading ? 'spin-animation' : ''} />
          <span>تحديث القائمة</span>
        </button>
      </div>

      {/* Filter Bar */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Filter size={16} color="var(--text-muted)" />
          <select
            className="form-input"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            style={{ minWidth: '180px' }}
          >
            <option value="">جميع الاشتراكات</option>
            <option value="ACTIVE">النشطة فقط (ACTIVE)</option>
            <option value="EXPIRED">المنتهية فقط (EXPIRED)</option>
            <option value="CANCELLED">الملغاة فقط (CANCELLED)</option>
            <option value="TRIAL">التجريبية فقط (TRIAL)</option>
          </select>
        </div>

        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginRight: 'auto' }}>
          إجمالي الاشتراكات: <strong style={{ color: 'var(--text-primary)' }}>{totalCount}</strong>
        </div>
      </div>

      {/* Subscriptions Table */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div className="table-responsive">
          <table className="table" style={{ width: '100%', margin: 0 }}>
            <thead>
              <tr>
                <th>الشبكة المشتركة</th>
                <th>الباقة</th>
                <th>الحالة</th>
                <th>دورة الفوترة</th>
                <th>تاريخ البدء والانتهاء</th>
                <th>السعر والموجهات</th>
                <th>الملاحظات</th>
                <th style={{ textAlign: 'center' }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    جاري تحميل بيانات الاشتراكات...
                  </td>
                </tr>
              ) : subscriptions.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    لم يتم العثور على أي اشتراكات مطابقة.
                  </td>
                </tr>
              ) : (
                subscriptions.map((sub) => {
                  const expiry = new Date(sub.expiresAt);
                  const isExpired = expiry.getTime() < Date.now();
                  const daysLeft = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

                  return (
                    <tr key={sub.id}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{sub.tenantName}</div>
                        <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                          {sub.tenantSlug}
                        </div>
                      </td>

                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--primary)' }}>{sub.planNameAr}</div>
                        <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>{sub.planName}</div>
                      </td>

                      <td>
                        <span
                          className={`badge ${
                            sub.status === 'ACTIVE' && !isExpired
                              ? 'badge-success'
                              : sub.status === 'CANCELLED'
                              ? 'badge-danger'
                              : 'badge-warning'
                          }`}
                        >
                          {sub.status === 'ACTIVE'
                            ? isExpired
                              ? 'منتهي الصلاحية'
                              : 'نشط'
                            : sub.status === 'CANCELLED'
                            ? 'ملغى'
                            : sub.status}
                        </span>
                      </td>

                      <td>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                          {sub.billingCycle === 'YEARLY' ? 'سنوي (Yearly)' : 'شهري (Monthly)'}
                        </span>
                      </td>

                      <td>
                        <div style={{ fontSize: '0.8rem' }}>
                          إلى: <strong>{expiry.toLocaleDateString('ar-EG')}</strong>
                        </div>
                        <div
                          style={{
                            fontSize: '0.725rem',
                            color: isExpired ? 'var(--danger)' : daysLeft <= 5 ? 'var(--accent)' : 'var(--text-muted)',
                            fontWeight: isExpired || daysLeft <= 5 ? 700 : 400,
                          }}
                        >
                          {isExpired ? 'منتهي الصلاحية' : `متبقي ${daysLeft} يوم`}
                        </div>
                      </td>

                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                          {sub.price?.toLocaleString('ar-EG')} SDG
                        </div>
                        <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                          حد {sub.maxRouters} موجه
                        </div>
                      </td>

                      <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', maxWidth: '140px' }}>
                        {sub.notes || '—'}
                      </td>

                      <td>
                        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center' }}>
                          <button
                            onClick={() => handleOpenRenew(sub)}
                            className="btn btn-secondary"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                            title="تجديد أو تمديد الاشتراك"
                          >
                            تجديد
                          </button>

                          <button
                            onClick={() => handleOpenStatus(sub)}
                            className="btn btn-ghost"
                            style={{ padding: '0.35rem' }}
                            title="تغيير الحالة"
                          >
                            {sub.status === 'ACTIVE' ? (
                              <XCircle size={16} color="var(--danger)" />
                            ) : (
                              <CheckCircle2 size={16} color="var(--success)" />
                            )}
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

      {/* Renew Modal */}
      <Modal
        isOpen={showRenewModal}
        onClose={() => setShowRenewModal(false)}
        title={`تجديد اشتراك: ${selectedSub?.tenantName || ''}`}
        maxWidth="460px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div
            style={{
              padding: '0.75rem',
              backgroundColor: 'var(--bg-app)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              fontSize: '0.85rem',
            }}
          >
            <div>
              الباقة: <strong style={{ color: 'var(--primary)' }}>{selectedSub?.planNameAr}</strong>
            </div>
            <div>
              تاريخ الانتهاء الحالي:{' '}
              <strong>
                {selectedSub ? new Date(selectedSub.expiresAt).toLocaleDateString('ar-EG') : ''}
              </strong>
            </div>
          </div>

          <div>
            <label className="form-label">مدة التمديد الإضافية (بالأشهر):</label>
            <input
              type="number"
              min="1"
              max="36"
              className="form-input"
              value={renewMonths}
              onChange={(e) => setRenewMonths(Math.max(1, parseInt(e.target.value, 10) || 1))}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label className="form-label">ملاحظات التجديد:</label>
            <input
              type="text"
              className="form-input"
              placeholder="مثال: تم سداد التجديد نقدًا لشهرين إضافيين"
              value={renewNotes}
              onChange={(e) => setRenewNotes(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowRenewModal(false)}
              disabled={isRenewing}
            >
              إلغاء
            </button>
            <button
              className="btn btn-primary"
              onClick={handleRenewSubscription}
              disabled={isRenewing}
            >
              {isRenewing ? 'جاري التجديد...' : 'تأكيد التجديد'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Change Status Modal */}
      <Modal
        isOpen={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        title="تعديل حالة الاشتراك"
        maxWidth="440px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="form-label">اختر الحالة الجديدة:</label>
            <select
              className="form-input"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="ACTIVE">تفعيل الاشتراك (ACTIVE)</option>
              <option value="CANCELLED">إلغاء / إنهاء الاشتراك (CANCELLED)</option>
              <option value="EXPIRED">منتهي الصلاحية (EXPIRED)</option>
            </select>
          </div>

          <div>
            <label className="form-label">السبب / الملاحظات:</label>
            <textarea
              className="form-input"
              rows={2}
              placeholder="سبب تعديل الحالة..."
              value={statusNotes}
              onChange={(e) => setStatusNotes(e.target.value)}
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
              className="btn btn-primary"
              onClick={handleUpdateStatus}
              disabled={isUpdatingStatus}
            >
              {isUpdatingStatus ? 'جاري الحفظ...' : 'حفظ الحالة'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
