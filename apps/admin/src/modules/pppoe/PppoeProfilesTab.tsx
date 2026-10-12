import React, { useState } from 'react';
import { apiClient } from '../../core/api/api-client';
import { useToast } from '../../core/context/ToastContext';
import { Modal } from '../../components/common/Modal';
import { PppoeProfileItem } from '../../core/types/view-models';
import {
  Layers,
  Plus,
  RefreshCw,
  Trash2,
  Edit,
  CheckCircle2,
  ArrowRightLeft,
} from 'lucide-react';

interface PppoeProfilesTabProps {
  deviceId: string;
  profiles: PppoeProfileItem[];
  loading: boolean;
  onRefresh: () => void;
  onCommandQueued?: (commandId: string, desc: string) => void;
}

export const PppoeProfilesTab: React.FC<PppoeProfilesTabProps> = ({
  deviceId,
  profiles,
  loading,
  onRefresh,
  onCommandQueued,
}) => {
  const { showToast } = useToast();

  // Create Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    rateLimit: '10M/10M',
    localAddress: '10.100.0.1',
    remoteAddress: 'pppoe-pool',
    dnsServers: '8.8.8.8,1.1.1.1',
    onlyOne: true,
    price: 5000,
    description: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Modal
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    rateLimit: '',
    localAddress: '',
    remoteAddress: '',
    dnsServers: '',
    onlyOne: true,
    price: 0,
    description: '',
  });

  // Delete State
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sync State
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim()) {
      showToast('يرجى إدخال اسم البروفايل', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiClient.post<PppoeProfileItem>(
        `/pppoe/devices/${deviceId}/profiles`,
        {
          name: createForm.name.trim(),
          rateLimit: createForm.rateLimit.trim() || undefined,
          localAddress: createForm.localAddress.trim() || undefined,
          remoteAddress: createForm.remoteAddress.trim() || undefined,
          dnsServers: createForm.dnsServers.trim() || undefined,
          onlyOne: createForm.onlyOne,
          price: Number(createForm.price) || 0,
          description: createForm.description.trim() || undefined,
        },
      );

      showToast(`تم إنشاء البروفايل "${createForm.name}" بنجاح`, 'success');
      setIsCreateOpen(false);
      setCreateForm({
        name: '',
        rateLimit: '10M/10M',
        localAddress: '10.100.0.1',
        remoteAddress: 'pppoe-pool',
        dnsServers: '8.8.8.8,1.1.1.1',
        onlyOne: true,
        price: 5000,
        description: '',
      });

      if (res?.queuedCommandId && onCommandQueued) {
        onCommandQueued(res.queuedCommandId, `مزامنة بروفايل ${createForm.name}`);
      }
      onRefresh();
    } catch (err: any) {
      showToast(err?.message || 'فشل إنشاء بروفايل PPPoE', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEdit = (p: PppoeProfileItem) => {
    setEditingId(p.id);
    setEditForm({
      name: p.name,
      rateLimit: p.rateLimit || '',
      localAddress: p.localAddress || '',
      remoteAddress: p.remoteAddress || '',
      dnsServers: p.dnsServers || '',
      onlyOne: p.onlyOne,
      price: p.price,
      description: p.description || '',
    });
    setIsEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;

    setIsSubmitting(true);
    try {
      const res = await apiClient.patch<PppoeProfileItem>(
        `/pppoe/devices/${deviceId}/profiles/${editingId}`,
        {
          name: editForm.name.trim() || undefined,
          rateLimit: editForm.rateLimit.trim() || undefined,
          localAddress: editForm.localAddress.trim() || undefined,
          remoteAddress: editForm.remoteAddress.trim() || undefined,
          dnsServers: editForm.dnsServers.trim() || undefined,
          onlyOne: editForm.onlyOne,
          price: Number(editForm.price),
          description: editForm.description.trim() || undefined,
        },
      );

      showToast('تم تحديث إعدادات البروفايل بنجاح', 'success');
      setIsEditOpen(false);
      setEditingId(null);

      if (res?.queuedCommandId && onCommandQueued) {
        onCommandQueued(res.queuedCommandId, `تحديث بروفايل ${editForm.name}`);
      }
      onRefresh();
    } catch (err: any) {
      showToast(err?.message || 'فشل تحديث البروفايل', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (p: PppoeProfileItem) => {
    if (p.accountsCount && p.accountsCount > 0) {
      showToast(
        `لا يمكن حذف البروفايل "${p.name}" لأنه مرتبط حالياً بـ ${p.accountsCount} مشترك. يرجى نقل المشتركين أو حذفهم أولاً.`,
        'warning',
      );
      return;
    }

    if (!window.confirm(`هل أنت متأكد من رغبتك في حذف بروفايل "${p.name}"؟`)) {
      return;
    }

    setDeletingId(p.id);
    setIsDeleting(true);
    try {
      await apiClient.delete(`/pppoe/devices/${deviceId}/profiles/${p.id}`);
      showToast(`تم حذف البروفايل "${p.name}" بنجاح`, 'success');
      onRefresh();
    } catch (err: any) {
      showToast(err?.message || 'فشل حذف البروفايل', 'error');
    } finally {
      setIsDeleting(false);
      setDeletingId(null);
    }
  };

  const handleForceSync = async (p: PppoeProfileItem) => {
    setSyncingId(p.id);
    try {
      const res = await apiClient.post<{ success: boolean; queuedCommandId: string }>(
        `/pppoe/devices/${deviceId}/profiles/${p.id}/sync`,
      );
      showToast(`تم إرسال أمر مزامنة البروفايل "${p.name}" إلى الراوتر`, 'success');
      if (res?.queuedCommandId && onCommandQueued) {
        onCommandQueued(res.queuedCommandId, `مزامنة البروفايل ${p.name}`);
      }
    } catch (err: any) {
      showToast(err?.message || 'فشل طلب المزامنة', 'error');
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Action Bar */}
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
        <div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            باقات وبروفايلات PPPoE
          </h3>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
            تحديد خطط السرعات، البوابات، ومحددات الجلسات المتزامنة لمشتركي الراوتر المنزلي.
          </p>
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
            onClick={() => setIsCreateOpen(true)}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
          >
            <Plus size={16} />
            إضافة باقة جديدة
          </button>
        </div>
      </div>

      {/* Profiles Grid / Table */}
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <RefreshCw size={24} className="spin" style={{ margin: '0 auto 0.75rem' }} />
          <span>جاري تحميل باقات PPPoE من الراوتر...</span>
        </div>
      ) : profiles.length === 0 ? (
        <div
          style={{
            padding: '3rem',
            textAlign: 'center',
            backgroundColor: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            border: '1px dashed var(--border)',
          }}
        >
          <Layers size={40} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
          <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>لا توجد باقات PPPoE مضافة لهذا الراوتر</h4>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            قم بإنشاء باقة جديدة لتحديد السرعة وسعر الاشتراك لمشتركي النطاق العريض.
          </p>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="btn btn-primary"
            style={{ marginTop: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Plus size={16} /> إضافة أول باقة
          </button>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>اسم الباقة</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>السرعة المحددة (Rx/Tx)</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>السعر الشهري</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>حوض العناوين (Pool/GW)</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>جلسة واحدة</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>المشتركون النشطون</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center' }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background-color 0.15s' }}>
                  <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Layers size={16} style={{ color: 'var(--primary)' }} />
                      <span>{p.name}</span>
                    </div>
                    {p.description && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.2rem' }}>
                        {p.description}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.85rem 1rem', color: 'var(--text-primary)' }}>
                    {p.rateLimit ? (
                      <span className="badge badge-info" style={{ direction: 'ltr', display: 'inline-block' }}>
                        {p.rateLimit}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>مفتوح (غير محدد)</span>
                    )}
                  </td>
                  <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {p.price.toLocaleString()} ج.س
                  </td>
                  <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                    <div>GW: {p.localAddress || 'افتراضي'}</div>
                    <div>Pool: {p.remoteAddress || 'افتراضي'}</div>
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    {p.onlyOne ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--success)' }}>
                        <CheckCircle2 size={15} /> نعم
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>لا</span>
                    )}
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <span
                      style={{
                        padding: '0.25rem 0.6rem',
                        borderRadius: '999px',
                        backgroundColor: (p.accountsCount || 0) > 0 ? 'var(--primary-light)' : 'rgba(255,255,255,0.05)',
                        color: (p.accountsCount || 0) > 0 ? 'var(--primary)' : 'var(--text-muted)',
                        fontWeight: 700,
                        fontSize: '0.8rem',
                      }}
                    >
                      {p.accountsCount || 0} مشترك
                    </span>
                  </td>
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleForceSync(p)}
                        disabled={syncingId === p.id}
                        className="btn btn-icon btn-outline"
                        title="مزامنة فورية للبروفايل مع الراوتر"
                        style={{ padding: '0.4rem', borderRadius: 'var(--radius-sm)' }}
                      >
                        <ArrowRightLeft size={14} className={syncingId === p.id ? 'spin' : ''} />
                      </button>
                      <button
                        onClick={() => handleOpenEdit(p)}
                        className="btn btn-icon btn-outline"
                        title="تعديل البروفايل"
                        style={{ padding: '0.4rem', borderRadius: 'var(--radius-sm)' }}
                      >
                        <Edit size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(p)}
                        disabled={isDeleting && deletingId === p.id}
                        className="btn btn-icon btn-danger"
                        title="حذف البروفايل"
                        style={{ padding: '0.4rem', borderRadius: 'var(--radius-sm)' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="إضافة باقة PPPoE جديدة">
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="form-label required">اسم الباقة (Profile Name)</label>
            <input
              type="text"
              className="form-control"
              placeholder="مثال: 10Mbps-Home"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="form-label">السرعة المحددة (Rate Limit)</label>
              <input
                type="text"
                className="form-control"
                placeholder="مثال: 5M/10M"
                value={createForm.rateLimit}
                onChange={(e) => setCreateForm({ ...createForm, rateLimit: e.target.value })}
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>صيغة ميكروتيك: رفع/تنزيل</span>
            </div>

            <div>
              <label className="form-label required">السعر الشهري (ج.س)</label>
              <input
                type="number"
                min="0"
                className="form-control"
                value={createForm.price}
                onChange={(e) => setCreateForm({ ...createForm, price: Number(e.target.value) })}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="form-label">عنوان البوابة (Local Address)</label>
              <input
                type="text"
                className="form-control"
                placeholder="مثال: 10.100.0.1"
                value={createForm.localAddress}
                onChange={(e) => setCreateForm({ ...createForm, localAddress: e.target.value })}
              />
            </div>

            <div>
              <label className="form-label">حوض العناوين (Remote Address / Pool)</label>
              <input
                type="text"
                className="form-control"
                placeholder="مثال: pppoe-pool"
                value={createForm.remoteAddress}
                onChange={(e) => setCreateForm({ ...createForm, remoteAddress: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="form-label">خوادم DNS</label>
            <input
              type="text"
              className="form-control"
              placeholder="8.8.8.8,1.1.1.1"
              value={createForm.dnsServers}
              onChange={(e) => setCreateForm({ ...createForm, dnsServers: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
            <input
              type="checkbox"
              id="createOnlyOne"
              checked={createForm.onlyOne}
              onChange={(e) => setCreateForm({ ...createForm, onlyOne: e.target.checked })}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <label htmlFor="createOnlyOne" style={{ fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
              حصر الجلسة على جهاز واحد فقط في نفس الوقت (Only One)
            </label>
          </div>

          <div>
            <label className="form-label">ملاحظات / وصف الخطة</label>
            <textarea
              className="form-control"
              rows={2}
              placeholder="وصف الخطة والمميزات للمشترك..."
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <button type="button" onClick={() => setIsCreateOpen(false)} className="btn btn-outline" disabled={isSubmitting}>
              إلغاء
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'جاري الحفظ والمزامنة...' : 'حفظ الباقة ومزامنتها'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title="تعديل باقة PPPoE">
        <form onSubmit={handleEdit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="form-label required">اسم الباقة</label>
            <input
              type="text"
              className="form-control"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="form-label">السرعة المحددة (Rate Limit)</label>
              <input
                type="text"
                className="form-control"
                value={editForm.rateLimit}
                onChange={(e) => setEditForm({ ...editForm, rateLimit: e.target.value })}
              />
            </div>

            <div>
              <label className="form-label required">السعر الشهري (ج.س)</label>
              <input
                type="number"
                min="0"
                className="form-control"
                value={editForm.price}
                onChange={(e) => setEditForm({ ...editForm, price: Number(e.target.value) })}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="form-label">عنوان البوابة (Local Address)</label>
              <input
                type="text"
                className="form-control"
                value={editForm.localAddress}
                onChange={(e) => setEditForm({ ...editForm, localAddress: e.target.value })}
              />
            </div>

            <div>
              <label className="form-label">حوض العناوين (Remote Address)</label>
              <input
                type="text"
                className="form-control"
                value={editForm.remoteAddress}
                onChange={(e) => setEditForm({ ...editForm, remoteAddress: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="form-label">خوادم DNS</label>
            <input
              type="text"
              className="form-control"
              value={editForm.dnsServers}
              onChange={(e) => setEditForm({ ...editForm, dnsServers: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              id="editOnlyOne"
              checked={editForm.onlyOne}
              onChange={(e) => setEditForm({ ...editForm, onlyOne: e.target.checked })}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <label htmlFor="editOnlyOne" style={{ fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
              جلسة واحدة في نفس الوقت (Only One)
            </label>
          </div>

          <div>
            <label className="form-label">الوصف والملاحظات</label>
            <textarea
              className="form-control"
              rows={2}
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <button type="button" onClick={() => setIsEditOpen(false)} className="btn btn-outline" disabled={isSubmitting}>
              إلغاء
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'جاري الحفظ...' : 'حفظ التعديلات ومزامنتها'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
