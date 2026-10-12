import React, { useState } from 'react';
import { apiClient } from '../../core/api/api-client';
import { useToast } from '../../core/context/ToastContext';
import { Modal } from '../../components/common/Modal';
import { PppoeAccountItem, PppoeProfileItem } from '../../core/types/view-models';
import {
  Users,
  UserPlus,
  Search,
  RefreshCw,
  Power,
  PowerOff,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  Clock,
  AlertCircle,
  CheckCircle2,
  Phone,
  User,
} from 'lucide-react';

interface PppoeAccountsTabProps {
  deviceId: string;
  accounts: PppoeAccountItem[];
  profiles: PppoeProfileItem[];
  loading: boolean;
  onRefresh: () => void;
  onCommandQueued?: (commandId: string, desc: string) => void;
}

export const PppoeAccountsTab: React.FC<PppoeAccountsTabProps> = ({
  deviceId,
  accounts,
  profiles,
  loading,
  onRefresh,
  onCommandQueued,
}) => {
  const { showToast } = useToast();

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [profileFilter, setProfileFilter] = useState<string>('ALL');

  // Password visibility toggle (Strictly transient UI state only)
  const [showPassword, setShowPassword] = useState(false);

  // Create Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    username: '',
    password: '',
    profileId: profiles[0]?.id || '',
    customerName: '',
    customerPhone: '',
    callerId: '',
    staticIp: '',
    price: 0,
    billingCycle: 'MONTHLY' as 'MONTHLY' | 'YEARLY',
    expiresAt: '',
    notes: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Modal
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    username: '',
    newPassword: '',
    profileId: '',
    customerName: '',
    customerPhone: '',
    callerId: '',
    staticIp: '',
    price: 0,
    billingCycle: 'MONTHLY' as 'MONTHLY' | 'YEARLY',
    expiresAt: '',
    notes: '',
  });

  // Action in-progress tracking
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Filtered accounts
  const filteredAccounts = accounts.filter((acc) => {
    const matchesSearch =
      !searchTerm ||
      acc.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (acc.customerName && acc.customerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (acc.customerPhone && acc.customerPhone.includes(searchTerm));

    const matchesStatus = statusFilter === 'ALL' || acc.status === statusFilter;
    const matchesProfile = profileFilter === 'ALL' || acc.profileId === profileFilter;

    return matchesSearch && matchesStatus && matchesProfile;
  });

  const handleOpenCreate = () => {
    setCreateForm({
      username: '',
      password: '',
      profileId: profiles[0]?.id || '',
      customerName: '',
      customerPhone: '',
      callerId: '',
      staticIp: '',
      price: profiles[0]?.price || 5000,
      billingCycle: 'MONTHLY',
      expiresAt: '',
      notes: '',
    });
    setShowPassword(false);
    setIsCreateOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.username.trim() || !createForm.password.trim() || !createForm.profileId) {
      showToast('يرجى إدخال اسم المستخدم وكلمة المرور وتحديد الباقة', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiClient.post<PppoeAccountItem>(
        `/pppoe/devices/${deviceId}/accounts`,
        {
          username: createForm.username.trim(),
          password: createForm.password, // Never saved in state beyond this call
          profileId: createForm.profileId,
          customerName: createForm.customerName.trim() || undefined,
          customerPhone: createForm.customerPhone.trim() || undefined,
          callerId: createForm.callerId.trim() || undefined,
          staticIp: createForm.staticIp.trim() || undefined,
          price: Number(createForm.price) || undefined,
          billingCycle: createForm.billingCycle,
          expiresAt: createForm.expiresAt ? new Date(createForm.expiresAt).toISOString() : undefined,
          notes: createForm.notes.trim() || undefined,
        },
      );

      showToast(`تم إنشاء حساب المشترك "${createForm.username}" بنجاح`, 'success');
      setIsCreateOpen(false);

      if (res?.queuedCommandId && onCommandQueued) {
        onCommandQueued(res.queuedCommandId, `إنشاء حساب المشترك ${createForm.username}`);
      }
      onRefresh();
    } catch (err: any) {
      showToast(err?.message || 'فشل إنشاء حساب المشترك', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEdit = (acc: PppoeAccountItem) => {
    setEditingId(acc.id);
    setEditForm({
      username: acc.username,
      newPassword: '',
      profileId: acc.profileId,
      customerName: acc.customerName || '',
      customerPhone: acc.customerPhone || '',
      callerId: acc.callerId || '',
      staticIp: acc.staticIp || '',
      price: acc.price || 0,
      billingCycle: acc.billingCycle || 'MONTHLY',
      expiresAt: acc.expiresAt ? acc.expiresAt.substring(0, 10) : '',
      notes: acc.notes || '',
    });
    setShowPassword(false);
    setIsEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;

    setIsSubmitting(true);
    try {
      const res = await apiClient.patch<PppoeAccountItem>(
        `/pppoe/devices/${deviceId}/accounts/${editingId}`,
        {
          password: editForm.newPassword ? editForm.newPassword : undefined,
          profileId: editForm.profileId || undefined,
          customerName: editForm.customerName.trim() || undefined,
          customerPhone: editForm.customerPhone.trim() || undefined,
          callerId: editForm.callerId.trim() || undefined,
          staticIp: editForm.staticIp.trim() || undefined,
          price: Number(editForm.price),
          billingCycle: editForm.billingCycle,
          expiresAt: editForm.expiresAt ? new Date(editForm.expiresAt).toISOString() : undefined,
          notes: editForm.notes.trim() || undefined,
        },
      );

      showToast(`تم تحديث بيانات المشترك "${editForm.username}" بنجاح`, 'success');
      setIsEditOpen(false);
      setEditingId(null);

      if (res?.queuedCommandId && onCommandQueued) {
        onCommandQueued(res.queuedCommandId, `تحديث حساب المشترك ${editForm.username}`);
      }
      onRefresh();
    } catch (err: any) {
      showToast(err?.message || 'فشل تحديث بيانات المشترك', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (acc: PppoeAccountItem) => {
    const isCurrentlyActive = acc.status === 'ACTIVE';
    const actionText = isCurrentlyActive ? 'تعطيل' : 'تفعيل';

    if (
      !window.confirm(
        `هل أنت متأكد من ${actionText} حساب المشترك "${acc.username}"؟${
          isCurrentlyActive ? ' سيتم قطع الجلسة النشطة فوراً من الراوتر.' : ''
        }`,
      )
    ) {
      return;
    }

    setActionLoadingId(acc.id);
    try {
      const endpoint = isCurrentlyActive
        ? `/pppoe/devices/${deviceId}/accounts/${acc.id}/disable`
        : `/pppoe/devices/${deviceId}/accounts/${acc.id}/enable`;

      const res = await apiClient.post<PppoeAccountItem>(endpoint);
      showToast(`تم ${actionText} حساب المشترك "${acc.username}" بنجاح`, 'success');

      if (res?.queuedCommandId && onCommandQueued) {
        onCommandQueued(res.queuedCommandId, `${actionText} حساب ${acc.username}`);
      }
      onRefresh();
    } catch (err: any) {
      showToast(err?.message || `فشل ${actionText} الحساب`, 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (acc: PppoeAccountItem) => {
    if (
      !window.confirm(
        `تحذير: هل أنت متأكد من حذف حساب المشترك "${acc.username}" نهائياً من قاعدة البيانات والراوتر؟`,
      )
    ) {
      return;
    }

    setActionLoadingId(acc.id);
    try {
      const res = await apiClient.delete<{ success: boolean; queuedCommandId: string | null }>(
        `/pppoe/devices/${deviceId}/accounts/${acc.id}`,
      );
      showToast(`تم حذف حساب المشترك "${acc.username}"`, 'success');

      if (res?.queuedCommandId && onCommandQueued) {
        onCommandQueued(res.queuedCommandId, `حذف حساب ${acc.username}`);
      }
      onRefresh();
    } catch (err: any) {
      showToast(err?.message || 'فشل حذف الحساب', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const getStatusBadge = (status: PppoeAccountItem['status']) => {
    switch (status) {
      case 'ACTIVE':
        return <span className="badge badge-success">نشط (Active)</span>;
      case 'DISABLED':
        return <span className="badge badge-danger">معطل (Disabled)</span>;
      case 'EXPIRED':
        return <span className="badge badge-warning">منتهي (Expired)</span>;
      case 'SUSPENDED':
        return <span className="badge badge-secondary">موقوف (Suspended)</span>;
      default:
        return <span className="badge badge-secondary">{status}</span>;
    }
  };

  const getSyncBadge = (syncStatus: PppoeAccountItem['syncStatus']) => {
    switch (syncStatus) {
      case 'SYNCED':
        return (
          <span title="متطابق مع الراوتر" style={{ color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
            <CheckCircle2 size={13} /> متزامن
          </span>
        );
      case 'PENDING':
        return (
          <span title="بانتظار تنفيذ الوكيل" style={{ color: 'var(--warning)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
            <Clock size={13} /> معلق
          </span>
        );
      case 'FAILED':
        return (
          <span title="فشل التزامن مع الراوتر" style={{ color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
            <AlertCircle size={13} /> فشل
          </span>
        );
      default:
        return <span>{syncStatus}</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Search and Filters Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          backgroundColor: 'var(--bg-card)',
          padding: '1rem 1.25rem',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
          {/* Search Box */}
          <div style={{ position: 'relative', minWidth: '240px', maxWidth: '320px', flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-control"
              placeholder="بحث بالاسم، المستخدم، الهاتف..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingRight: '2.25rem', fontSize: '0.85rem' }}
            />
          </div>

          {/* Status Filter */}
          <div style={{ minWidth: '150px' }}>
            <select
              className="form-control"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ fontSize: '0.85rem' }}
            >
              <option value="ALL">جميع الحالات</option>
              <option value="ACTIVE">نشط فقط (ACTIVE)</option>
              <option value="DISABLED">معطل (DISABLED)</option>
              <option value="EXPIRED">منتهي الصلاحية</option>
              <option value="SUSPENDED">موقوف مؤقتاً</option>
            </select>
          </div>

          {/* Profile Filter */}
          <div style={{ minWidth: '160px' }}>
            <select
              className="form-control"
              value={profileFilter}
              onChange={(e) => setProfileFilter(e.target.value)}
              style={{ fontSize: '0.85rem' }}
            >
              <option value="ALL">جميع الباقات</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="btn btn-outline"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            تحديث
          </button>
          <button
            onClick={handleOpenCreate}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
          >
            <UserPlus size={16} />
            إضافة مشترك جديد
          </button>
        </div>
      </div>

      {/* Accounts Table */}
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <RefreshCw size={24} className="spin" style={{ margin: '0 auto 0.75rem' }} />
          <span>جاري تحميل قائمة المشتركين...</span>
        </div>
      ) : filteredAccounts.length === 0 ? (
        <div
          style={{
            padding: '3rem',
            textAlign: 'center',
            backgroundColor: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            border: '1px dashed var(--border)',
          }}
        >
          <Users size={40} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
          <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>لا توجد حسابات مطابقة لمعايير البحث</h4>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            قم بإنشاء حساب مشترك جديد وتعيين اسم المستخدم وكلمة المرور والباقة المخصصة.
          </p>
          <button
            onClick={handleOpenCreate}
            className="btn btn-primary"
            style={{ marginTop: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <UserPlus size={16} /> إضافة مشترك جديد
          </button>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>المشترك / المستخدم</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>البيانات والاتصال</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>الباقة المعينة</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>السعر والفوترة</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>تاريخ الانتهاء</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>حالة الحساب</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>المزامنة</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center' }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((acc) => {
                const isLoading = actionLoadingId === acc.id;
                return (
                  <tr key={acc.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background-color 0.15s' }}>
                    <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            backgroundColor: 'var(--primary-light)',
                            color: 'var(--primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.8rem',
                          }}
                        >
                          <User size={16} />
                        </div>
                        <div>
                          <span style={{ direction: 'ltr', display: 'inline-block' }}>{acc.username}</span>
                          {acc.customerName && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 400 }}>
                              {acc.customerName}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      {acc.customerPhone && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Phone size={12} /> <span style={{ direction: 'ltr' }}>{acc.customerPhone}</span>
                        </div>
                      )}
                      {acc.callerId && <div style={{ direction: 'ltr' }}>MAC: {acc.callerId}</div>}
                      {acc.staticIp && <div style={{ direction: 'ltr' }}>IP: {acc.staticIp}</div>}
                    </td>

                    <td style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {acc.profileName || 'افتراضي'}
                    </td>

                    <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      <div>{acc.price.toLocaleString()} ج.س</div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {acc.billingCycle === 'MONTHLY' ? 'شهري' : 'سنوي'}
                      </span>
                    </td>

                    <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {acc.expiresAt ? new Date(acc.expiresAt).toLocaleDateString('ar-SD') : 'غير محدد'}
                    </td>

                    <td style={{ padding: '0.85rem 1rem' }}>{getStatusBadge(acc.status)}</td>

                    <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem' }}>{getSyncBadge(acc.syncStatus)}</td>

                    <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                        {/* Toggle Active / Disabled Button */}
                        <button
                          onClick={() => handleToggleStatus(acc)}
                          disabled={isLoading}
                          className={`btn btn-icon ${acc.status === 'ACTIVE' ? 'btn-outline' : 'btn-success'}`}
                          title={acc.status === 'ACTIVE' ? 'تعطيل الحساب وقطع الجلسة' : 'تفعيل الحساب'}
                          style={{ padding: '0.4rem', borderRadius: 'var(--radius-sm)' }}
                        >
                          {acc.status === 'ACTIVE' ? (
                            <PowerOff size={14} style={{ color: 'var(--danger)' }} />
                          ) : (
                            <Power size={14} style={{ color: 'var(--success)' }} />
                          )}
                        </button>

                        {/* Edit Button */}
                        <button
                          onClick={() => handleOpenEdit(acc)}
                          disabled={isLoading}
                          className="btn btn-icon btn-outline"
                          title="تعديل بيانات المشترك"
                          style={{ padding: '0.4rem', borderRadius: 'var(--radius-sm)' }}
                        >
                          <Edit size={14} />
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => handleDelete(acc)}
                          disabled={isLoading}
                          className="btn btn-icon btn-danger"
                          title="حذف الحساب نهائياً"
                          style={{ padding: '0.4rem', borderRadius: 'var(--radius-sm)' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="إضافة حساب مشترك PPPoE جديد">
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="form-label required">اسم المستخدم (PPPoE Username)</label>
              <input
                type="text"
                className="form-control"
                placeholder="مثال: user_01"
                value={createForm.username}
                onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="form-label required">كلمة المرور (Secret Password)</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-control"
                  placeholder="كلمة المرور للراوتر المنزلي"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  style={{ paddingLeft: '2.5rem' }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    left: '0.6rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                  title={showPassword ? 'إخفاء' : 'إظهار'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                تُشفر بـ AES-256-GCM ولن تظهر في الشاشة بعد الحفظ.
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="form-label required">باقة السرعة (PPPoE Profile)</label>
              <select
                className="form-control"
                value={createForm.profileId}
                onChange={(e) => {
                  const selProf = profiles.find((p) => p.id === e.target.value);
                  setCreateForm({
                    ...createForm,
                    profileId: e.target.value,
                    price: selProf ? selProf.price : createForm.price,
                  });
                }}
                required
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.rateLimit ? `(${p.rateLimit})` : ''} — {p.price.toLocaleString()} ج.س
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label">قيمة الاشتراك (ج.س)</label>
              <input
                type="number"
                min="0"
                className="form-control"
                value={createForm.price}
                onChange={(e) => setCreateForm({ ...createForm, price: Number(e.target.value) })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="form-label">اسم العميل / المشترك</label>
              <input
                type="text"
                className="form-control"
                placeholder="الاسم الكامل للمشترك"
                value={createForm.customerName}
                onChange={(e) => setCreateForm({ ...createForm, customerName: e.target.value })}
              />
            </div>

            <div>
              <label className="form-label">رقم هاتف المشترك</label>
              <input
                type="text"
                className="form-control"
                placeholder="+249..."
                value={createForm.customerPhone}
                onChange={(e) => setCreateForm({ ...createForm, customerPhone: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="form-label">ربط بالماك (Caller ID / MAC)</label>
              <input
                type="text"
                className="form-control"
                placeholder="00:1A:2B:3C:4D:5E"
                value={createForm.callerId}
                onChange={(e) => setCreateForm({ ...createForm, callerId: e.target.value })}
              />
            </div>

            <div>
              <label className="form-label">عنوان IP ثابت (Static IP)</label>
              <input
                type="text"
                className="form-control"
                placeholder="مثال: 10.100.1.50"
                value={createForm.staticIp}
                onChange={(e) => setCreateForm({ ...createForm, staticIp: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="form-label">دورة الفوترة</label>
              <select
                className="form-control"
                value={createForm.billingCycle}
                onChange={(e) => setCreateForm({ ...createForm, billingCycle: e.target.value as any })}
              >
                <option value="MONTHLY">شهري (Monthly)</option>
                <option value="YEARLY">سنوي (Yearly)</option>
              </select>
            </div>

            <div>
              <label className="form-label">تاريخ انتهاء الاشتراك</label>
              <input
                type="date"
                className="form-control"
                value={createForm.expiresAt}
                onChange={(e) => setCreateForm({ ...createForm, expiresAt: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="form-label">ملاحظات إضافية</label>
            <textarea
              className="form-control"
              rows={2}
              placeholder="موقع الكبينة، رقم البورت، أو تفاصيل العقد..."
              value={createForm.notes}
              onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <button type="button" onClick={() => setIsCreateOpen(false)} className="btn btn-outline" disabled={isSubmitting}>
              إلغاء
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'جاري إنشاء الحساب والمزامنة...' : 'إنشاء الحساب وتفعيله بالراوتر'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title={`تعديل حساب المشترك "${editForm.username}"`}>
        <form onSubmit={handleEdit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="form-label">تغيير كلمة المرور (اتركها فارغة للإبقاء على الحالية)</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-control"
                placeholder="كلمة مرور جديدة (اختياري)"
                value={editForm.newPassword}
                onChange={(e) => setEditForm({ ...editForm, newPassword: e.target.value })}
                style={{ paddingLeft: '2.5rem' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  left: '0.6rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="form-label">باقة السرعة</label>
              <select
                className="form-control"
                value={editForm.profileId}
                onChange={(e) => setEditForm({ ...editForm, profileId: e.target.value })}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label">قيمة الاشتراك (ج.س)</label>
              <input
                type="number"
                min="0"
                className="form-control"
                value={editForm.price}
                onChange={(e) => setEditForm({ ...editForm, price: Number(e.target.value) })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="form-label">اسم العميل</label>
              <input
                type="text"
                className="form-control"
                value={editForm.customerName}
                onChange={(e) => setEditForm({ ...editForm, customerName: e.target.value })}
              />
            </div>

            <div>
              <label className="form-label">هاتف العميل</label>
              <input
                type="text"
                className="form-control"
                value={editForm.customerPhone}
                onChange={(e) => setEditForm({ ...editForm, customerPhone: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="form-label">ربط بالماك (Caller ID)</label>
              <input
                type="text"
                className="form-control"
                value={editForm.callerId}
                onChange={(e) => setEditForm({ ...editForm, callerId: e.target.value })}
              />
            </div>

            <div>
              <label className="form-label">عنوان IP ثابت</label>
              <input
                type="text"
                className="form-control"
                value={editForm.staticIp}
                onChange={(e) => setEditForm({ ...editForm, staticIp: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="form-label">دورة الفوترة</label>
              <select
                className="form-control"
                value={editForm.billingCycle}
                onChange={(e) => setEditForm({ ...editForm, billingCycle: e.target.value as any })}
              >
                <option value="MONTHLY">شهري</option>
                <option value="YEARLY">سنوي</option>
              </select>
            </div>

            <div>
              <label className="form-label">تاريخ انتهاء الاشتراك</label>
              <input
                type="date"
                className="form-control"
                value={editForm.expiresAt}
                onChange={(e) => setEditForm({ ...editForm, expiresAt: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="form-label">الملاحظات</label>
            <textarea
              className="form-control"
              rows={2}
              value={editForm.notes}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <button type="button" onClick={() => setIsEditOpen(false)} className="btn btn-outline" disabled={isSubmitting}>
              إلغاء
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'جاري الحفظ...' : 'حفظ التعديلات'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
