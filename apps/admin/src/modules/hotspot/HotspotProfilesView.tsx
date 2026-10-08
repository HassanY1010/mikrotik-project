import React, { useEffect, useState } from 'react';
import { apiClient } from '../../core/api/api-client';
import { useToast } from '../../core/context/ToastContext';
import { Modal } from '../../components/common/Modal';
import { Zap, Plus, RefreshCw, Layers, Trash2, Edit } from 'lucide-react';
import { HotspotProfileItem, DeviceItem } from '../../core/types/view-models';

export const HotspotProfilesView: React.FC = () => {
  const { showToast } = useToast();
  const [profiles, setProfiles] = useState<HotspotProfileItem[]>([]);
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    displayName: '',
    price: 500,
    validity: '1d',
    rateLimit: '2M/5M',
    sharedUsers: 1,
    deviceId: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Profile Modal state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    displayName: '',
    price: 500,
    validity: '1d',
    rateLimit: '2M/5M',
    sharedUsers: 1,
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [profilesRes, devicesRes] = await Promise.all([
        apiClient.get<HotspotProfileItem[]>('/hotspot/profiles'),
        apiClient.get<DeviceItem[]>('/devices'),
      ]);
      if (Array.isArray(profilesRes)) setProfiles(profilesRes);
      if (Array.isArray(devicesRes)) {
        setDevices(devicesRes);
        if (devicesRes.length > 0 && !formData.deviceId) {
          setFormData((prev) => ({ ...prev, deviceId: devicesRes[0].id }));
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل تحميل بروفايلات الهوت سبوت من الخادم';
      showToast(msg, 'error');
      setProfiles([]);
      setDevices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveDeviceId = formData.deviceId || devices[0]?.id;
    if (!formData.name || !formData.price || !effectiveDeviceId) {
      showToast('يرجى ملء جميع الحقول الإلزامية وتحديد الراوتر', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post('/hotspot/profiles', { ...formData, deviceId: effectiveDeviceId });
      showToast('تم إنشاء باقة الهوتسبوت ومزامنتها بنجاح', 'success');
      setIsAddOpen(false);
      setFormData({
        name: '',
        displayName: '',
        price: 500,
        validity: '1d',
        rateLimit: '2M/5M',
        sharedUsers: 1,
        deviceId: devices[0]?.id || '',
      });
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل إنشاء الباقة';
      showToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEdit = (profile: HotspotProfileItem) => {
    setEditingProfileId(profile.id);
    setEditFormData({
      name: profile.name || '',
      displayName: profile.displayName || profile.name || '',
      price: profile.price || 500,
      validity: profile.validity || '1d',
      rateLimit: profile.rateLimit || '2M/5M',
      sharedUsers: profile.sharedUsers || 1,
    });
    setIsEditOpen(true);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfileId) return;

    setIsSubmitting(true);
    try {
      await apiClient.patch(`/hotspot/profiles/${editingProfileId}`, {
        name: editFormData.name,
        rateLimit: editFormData.rateLimit,
        validity: editFormData.validity,
        sharedUsers: Number(editFormData.sharedUsers) || 1,
      });
      showToast('تم تحديث باقة الهوتسبوت بنجاح', 'success');
      setIsEditOpen(false);
      setEditingProfileId(null);
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل تحديث الباقة';
      showToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProfile = async (id: string, name: string) => {
    if (!window.confirm(`هل أنت متأكد من رغبتك في حذف الباقة "${name}"؟`)) return;
    try {
      await apiClient.delete(`/hotspot/profiles/${id}`);
      showToast('تم حذف باقة الهوتسبوت بنجاح', 'success');
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل حذف الباقة';
      showToast(msg, 'error');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Zap color="var(--primary)" size={24} />
            باقات وسرعات الهوتسبوت
          </h1>
          <p className="page-subtitle">
            تحديد سرعات التنزيل والرفع، مدة الصلاحية، والتسعير لكل باقة
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-outline" onClick={fetchData} disabled={loading}>
            <RefreshCw size={16} />
            تحديث
          </button>
          <button className="btn btn-primary" onClick={() => setIsAddOpen(true)}>
            <Plus size={16} />
            إنشاء باقة جديدة
          </button>
        </div>
      </div>

      {/* Profiles Cards Grid */}
      <div className="grid-cols-3" style={{ marginBottom: '1.5rem' }}>
        {profiles.map((profile) => (
          <div key={profile.id} className="card">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '0.75rem',
              }}
            >
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>
                  {profile.displayName || profile.name}
                </h3>
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    fontFamily: 'monospace',
                  }}
                >
                  كود الباقة: {profile.name}
                </span>
              </div>
              <div
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 900,
                  color: 'var(--primary)',
                }}
              >
                {Number(profile.price).toLocaleString()} SDG
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
                fontSize: '0.825rem',
                margin: '1rem 0',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: 'var(--text-secondary)',
                }}
              >
                <span>حد السرعة:</span>
                <strong style={{ color: 'var(--text-primary)', direction: 'ltr' }}>
                  {profile.rateLimit || 'غير محدود'}
                </strong>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: 'var(--text-secondary)',
                }}
              >
                <span>مدة الصلاحية:</span>
                <strong style={{ color: 'var(--text-primary)' }}>
                  {profile.validity || 'دائم'}
                </strong>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: 'var(--text-secondary)',
                }}
              >
                <span>الأجهزة المتزامنة:</span>
                <strong style={{ color: 'var(--text-primary)' }}>
                  {profile.sharedUsers || 1} جهاز
                </strong>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: 'var(--text-secondary)',
                }}
              >
                <span>الراوتر المرتبط:</span>
                <strong style={{ color: 'var(--info)' }}>{profile.device?.name || 'الكل'}</strong>
              </div>
            </div>

            <div
              style={{
                borderTop: '1px solid var(--border)',
                paddingTop: '0.75rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span className="badge badge-success">
                <Layers size={12} />
                {profile.availableCards !== undefined ? `${profile.availableCards} كرت متوفر` : 'متزامنة'}
              </span>

              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => handleOpenEdit(profile)}
                  title="تعديل الباقة"
                >
                  <Edit size={14} />
                  تعديل
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  style={{ color: 'var(--danger)', borderColor: 'var(--border)' }}
                  onClick={() =>
                    handleDeleteProfile(profile.id, profile.displayName || profile.name || 'باقة هوتسبوت')
                  }
                  title="حذف الباقة"
                >
                  <Trash2 size={14} />
                  حذف
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create Profile Modal */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="إنشاء باقة هوتسبوت جديدة"
        maxWidth="540px"
      >
        <form onSubmit={handleCreateProfile}>
          <div className="form-group">
            <label className="form-label" htmlFor="prof-name">
              اسم الباقة التقني في ميكروتك *
            </label>
            <input
              id="prof-name"
              className="input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="مثال: 1G-Daily أو Speed-VIP"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="prof-display">
              اسم الباقة التجاري (للعرض والطباعة) *
            </label>
            <input
              id="prof-display"
              className="input"
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              placeholder="مثال: باقة 1 جيجا (يومي)"
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="prof-price">
                سعر البيع (SDG) *
              </label>
              <input
                id="prof-price"
                type="number"
                className="input"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="prof-validity">
                مدة الصلاحية (مثال: 1d, 3h, 7d)
              </label>
              <input
                id="prof-validity"
                className="input"
                style={{ direction: 'ltr', textAlign: 'left' }}
                value={formData.validity}
                onChange={(e) => setFormData({ ...formData, validity: e.target.value })}
                placeholder="24h"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="prof-rate">
                محدد السرعة (تنزيل / رفع)
              </label>
              <input
                id="prof-rate"
                className="input"
                style={{ direction: 'ltr', textAlign: 'left' }}
                value={formData.rateLimit}
                onChange={(e) => setFormData({ ...formData, rateLimit: e.target.value })}
                placeholder="2M/5M"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="prof-device">
                الراوتر المستهدف *
              </label>
              <select
                id="prof-device"
                className="select"
                value={formData.deviceId}
                onChange={(e) => setFormData({ ...formData, deviceId: e.target.value })}
                required
              >
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="modal-footer" style={{ padding: '1rem 0 0 0', marginTop: '1rem' }}>
            <button type="button" className="btn btn-outline" onClick={() => setIsAddOpen(false)}>
              إلغاء
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'جاري الإنشاء...' : 'حفظ ومزامنة مع الراوتر'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="تعديل باقة وسرعة الهوتسبوت"
        maxWidth="540px"
      >
        <form onSubmit={handleUpdateProfile}>
          <div className="form-group">
            <label className="form-label" htmlFor="edit-prof-name">
              اسم الباقة في نظام ميكروتيك *
            </label>
            <input
              id="edit-prof-name"
              className="input"
              value={editFormData.name}
              onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="edit-prof-rate">
                السرعة المحددة (Rate Limit) *
              </label>
              <input
                id="edit-prof-rate"
                className="input"
                style={{ direction: 'ltr', textAlign: 'left' }}
                value={editFormData.rateLimit}
                onChange={(e) => setEditFormData({ ...editFormData, rateLimit: e.target.value })}
                placeholder="2M/5M"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="edit-prof-val">
                مدة الصلاحية (Session Timeout)
              </label>
              <input
                id="edit-prof-val"
                className="input"
                style={{ direction: 'ltr', textAlign: 'left' }}
                value={editFormData.validity}
                onChange={(e) => setEditFormData({ ...editFormData, validity: e.target.value })}
                placeholder="1h, 1d, 3d, 1w"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="edit-prof-shared">
                عدد الأجهزة المشتركة (Shared Users)
              </label>
              <input
                id="edit-prof-shared"
                type="number"
                min={1}
                max={10}
                className="input"
                value={editFormData.sharedUsers}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, sharedUsers: Number(e.target.value) })
                }
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="edit-prof-price">
                السعر الافتراضي (SDG)
              </label>
              <input
                id="edit-prof-price"
                type="number"
                className="input"
                value={editFormData.price}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, price: Number(e.target.value) })
                }
              />
            </div>
          </div>

          <div className="modal-footer" style={{ padding: '1rem 0 0 0', marginTop: '1rem' }}>
            <button type="button" className="btn btn-outline" onClick={() => setIsEditOpen(false)}>
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
