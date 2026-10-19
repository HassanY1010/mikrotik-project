import React, { useEffect, useState } from 'react';
import { apiClient } from '../../core/api/api-client';
import { useToast } from '../../core/context/ToastContext';
import { Modal } from '../../components/common/Modal';
import { Zap, Plus, RefreshCw, Layers, Trash2, Edit } from 'lucide-react';
import { HotspotProfileItem, DeviceItem } from '../../core/types/view-models';
import {
  formatValidityArabic,
  isValidValidityDuration,
  parseValidityParts,
} from '../../core/utils/validity';

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
    validityAmount: 1,
    validityUnit: 'd' as 'm' | 'h' | 'd',
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
    validityAmount: 1,
    validityUnit: 'd' as 'm' | 'h' | 'd',
    rateLimit: '2M/5M',
    sharedUsers: 1,
  });

  const fetchData = async (isInitial = true) => {
    if (isInitial) setLoading(true);
    try {
      if (isInitial || devices.length === 0) {
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
      } else {
        const profilesRes = await apiClient.get<HotspotProfileItem[]>('/hotspot/profiles');
        if (Array.isArray(profilesRes)) setProfiles(profilesRes);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل تحميل بروفايلات الهوت سبوت من الخادم';
      showToast(msg, 'error');
      if (isInitial) {
        setProfiles([]);
        setDevices([]);
      }
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(true);
  }, []);

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveDeviceId = formData.deviceId || devices[0]?.id;
    if (!formData.name || !formData.price || !effectiveDeviceId) {
      showToast('يرجى ملء جميع الحقول الإلزامية وتحديد الراوتر', 'warning');
      return;
    }

    const amount = Number(formData.validityAmount);
    if (!amount || amount <= 0 || !Number.isInteger(amount)) {
      showToast('الرجاء إدخال عدد صحيح موجب أكبر من الصفر في خانة مدة الصلاحية', 'warning');
      return;
    }

    const effectiveValidity = `${amount}${formData.validityUnit}`.toLowerCase();
    if (!isValidValidityDuration(effectiveValidity)) {
      showToast('صيغة مدة الصلاحية غير مدعومة', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await apiClient.post<HotspotProfileItem>('/hotspot/profiles', {
        name: formData.name,
        displayName: formData.displayName,
        price: formData.price,
        validity: effectiveValidity,
        sessionTimeout: effectiveValidity,
        rateLimit: formData.rateLimit,
        sharedUsers: formData.sharedUsers,
        deviceId: effectiveDeviceId,
      });
      showToast('تم إنشاء باقة الهوتسبوت ومزامنتها بنجاح', 'success');
      setIsAddOpen(false);
      setFormData({
        name: '',
        displayName: '',
        price: 500,
        validityAmount: 1,
        validityUnit: 'd',
        rateLimit: '2M/5M',
        sharedUsers: 1,
        deviceId: devices[0]?.id || '',
      });
      if (created && created.id) {
        setProfiles((prev) => [created, ...prev]);
      } else {
        fetchData(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل إنشاء الباقة';
      showToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEdit = (profile: HotspotProfileItem) => {
    setEditingProfileId(profile.id);
    const parsed = parseValidityParts(profile.validity || profile.sessionTimeout || '1d');
    setEditFormData({
      name: profile.name || '',
      displayName: profile.displayName || profile.name || '',
      price: profile.price || 500,
      validityAmount: parsed.amount,
      validityUnit: parsed.unit,
      rateLimit: profile.rateLimit || '2M/5M',
      sharedUsers: profile.sharedUsers || 1,
    });
    setIsEditOpen(true);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfileId) return;

    const amount = Number(editFormData.validityAmount);
    if (!amount || amount <= 0 || !Number.isInteger(amount)) {
      showToast('الرجاء إدخال عدد صحيح موجب أكبر من الصفر في خانة مدة الصلاحية', 'warning');
      return;
    }

    const effectiveValidity = `${amount}${editFormData.validityUnit}`.toLowerCase();
    if (!isValidValidityDuration(effectiveValidity)) {
      showToast('صيغة مدة الصلاحية غير مدعومة', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await apiClient.patch<HotspotProfileItem>(`/hotspot/profiles/${editingProfileId}`, {
        name: editFormData.name,
        displayName: editFormData.displayName,
        rateLimit: editFormData.rateLimit,
        validity: effectiveValidity,
        sessionTimeout: effectiveValidity,
        sharedUsers: Number(editFormData.sharedUsers) || 1,
        price: editFormData.price,
      });
      showToast('تم تحديث باقة الهوتسبوت بنجاح', 'success');
      setIsEditOpen(false);
      setEditingProfileId(null);
      if (updated && updated.id) {
        setProfiles((prev) => prev.map((p) => (p.id === editingProfileId ? { ...p, ...updated } : p)));
      } else {
        fetchData(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل تحديث الباقة';
      showToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProfile = async (id: string, name: string) => {
    if (!window.confirm(`هل أنت متأكد من رغبتك في حذف الباقة "${name}"؟`)) return;
    const prevProfiles = profiles;
    // Optimistic UI deletion for immediate responsiveness
    setProfiles((prev) => prev.filter((p) => p.id !== id));
    try {
      await apiClient.delete(`/hotspot/profiles/${id}`);
      showToast('تم حذف باقة الهوتسبوت بنجاح', 'success');
    } catch (err: unknown) {
      // Rollback on network failure
      setProfiles(prevProfiles);
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
            بروفايلات Hotspot
          </h1>
          <p className="page-subtitle">
            تحديد سرعات التنزيل والرفع، مدة الصلاحية، والتسعير لكل باقة ومزامنتها مع راوتر MikroTik
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-outline" onClick={() => fetchData(true)} disabled={loading}>
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
                  {formatValidityArabic(profile.validity)}
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

          <div className="form-grid-2">
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
              <label className="form-label">
                مدة الصلاحية / الجلسة (Validity) *
              </label>

              {/* اختيار وحدة المدة (دقيقة M، ساعة H، يوم D) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '8px' }}>
                {[
                  { key: 'm', label: 'دقيقة', symbol: 'M' },
                  { key: 'h', label: 'ساعة', symbol: 'H' },
                  { key: 'd', label: 'يوم', symbol: 'D' },
                ].map((u) => {
                  const isSelected = formData.validityUnit === u.key;
                  return (
                    <button
                      key={u.key}
                      type="button"
                      onClick={() => setFormData({ ...formData, validityUnit: u.key as 'm' | 'h' | 'd' })}
                      className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-outline'}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                        padding: '6px 4px',
                        borderRadius: '8px',
                        fontWeight: isSelected ? 'bold' : 'normal',
                        borderWidth: isSelected ? '2px' : '1px',
                        fontSize: '12px',
                      }}
                    >
                      <span>{u.label}</span>
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          background: isSelected ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)',
                          fontWeight: 'bold',
                        }}
                      >
                        {u.symbol}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* إدخال العدد مع مؤشر الوحدة */}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  id="prof-validity"
                  type="number"
                  min={1}
                  max={10000}
                  step={1}
                  className="input"
                  style={{
                    direction: 'ltr',
                    textAlign: 'left',
                    paddingLeft: '75px',
                    fontFamily: 'monospace',
                    fontWeight: 'bold',
                    fontSize: '14px',
                  }}
                  value={formData.validityAmount}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setFormData({ ...formData, validityAmount: isNaN(val) ? ('' as any) : val });
                  }}
                  placeholder={
                    formData.validityUnit === 'm'
                      ? 'مثال: 15 أو 30 أو 50'
                      : formData.validityUnit === 'h'
                        ? 'مثال: 1 أو 5 أو 70'
                        : 'مثال: 1 أو 7 أو 30'
                  }
                  required
                />
                <div
                  style={{
                    position: 'absolute',
                    left: '8px',
                    pointerEvents: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#10B981',
                    padding: '2px 6px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                  }}
                >
                  {formData.validityUnit === 'm' ? 'M دقيقة' : formData.validityUnit === 'h' ? 'H ساعة' : 'D يوم'}
                </div>
              </div>

              {/* معاينة القيمة الناتجة */}
              <div
                style={{
                  marginTop: '6px',
                  fontSize: '11px',
                  color: 'var(--text-secondary, #94a3b8)',
                  background: 'rgba(56, 189, 248, 0.08)',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <span style={{ color: '#38BDF8', fontWeight: 'bold' }}>القيمة:</span>
                <span style={{ fontWeight: 'bold', color: '#10B981', direction: 'ltr' }}>
                  {formData.validityAmount ? `${formData.validityAmount}${formData.validityUnit.toUpperCase()}` : '--'}
                </span>
                <span>
                  ({formData.validityAmount ? formatValidityArabic(`${formData.validityAmount}${formData.validityUnit}`) : 'أدخل رقماً'})
                </span>
              </div>
            </div>
          </div>

          <div className="form-grid-2">
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

          <div className="form-grid-2">
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
              <label className="form-label">
                مدة الصلاحية / الجلسة (Validity) *
              </label>

              {/* اختيار وحدة المدة (دقيقة M، ساعة H، يوم D) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '8px' }}>
                {[
                  { key: 'm', label: 'دقيقة', symbol: 'M' },
                  { key: 'h', label: 'ساعة', symbol: 'H' },
                  { key: 'd', label: 'يوم', symbol: 'D' },
                ].map((u) => {
                  const isSelected = editFormData.validityUnit === u.key;
                  return (
                    <button
                      key={u.key}
                      type="button"
                      onClick={() => setEditFormData({ ...editFormData, validityUnit: u.key as 'm' | 'h' | 'd' })}
                      className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-outline'}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                        padding: '6px 4px',
                        borderRadius: '8px',
                        fontWeight: isSelected ? 'bold' : 'normal',
                        borderWidth: isSelected ? '2px' : '1px',
                        fontSize: '12px',
                      }}
                    >
                      <span>{u.label}</span>
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          background: isSelected ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)',
                          fontWeight: 'bold',
                        }}
                      >
                        {u.symbol}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* إدخال العدد مع مؤشر الوحدة */}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  id="edit-prof-val"
                  type="number"
                  min={1}
                  max={10000}
                  step={1}
                  className="input"
                  style={{
                    direction: 'ltr',
                    textAlign: 'left',
                    paddingLeft: '75px',
                    fontFamily: 'monospace',
                    fontWeight: 'bold',
                    fontSize: '14px',
                  }}
                  value={editFormData.validityAmount}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setEditFormData({ ...editFormData, validityAmount: isNaN(val) ? ('' as any) : val });
                  }}
                  placeholder={
                    editFormData.validityUnit === 'm'
                      ? 'مثال: 15 أو 30 أو 50'
                      : editFormData.validityUnit === 'h'
                        ? 'مثال: 1 أو 5 أو 70'
                        : 'مثال: 1 أو 7 أو 30'
                  }
                  required
                />
                <div
                  style={{
                    position: 'absolute',
                    left: '8px',
                    pointerEvents: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#10B981',
                    padding: '2px 6px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                  }}
                >
                  {editFormData.validityUnit === 'm' ? 'M دقيقة' : editFormData.validityUnit === 'h' ? 'H ساعة' : 'D يوم'}
                </div>
              </div>

              {/* معاينة القيمة الناتجة */}
              <div
                style={{
                  marginTop: '6px',
                  fontSize: '11px',
                  color: 'var(--text-secondary, #94a3b8)',
                  background: 'rgba(56, 189, 248, 0.08)',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <span style={{ color: '#38BDF8', fontWeight: 'bold' }}>القيمة:</span>
                <span style={{ fontWeight: 'bold', color: '#10B981', direction: 'ltr' }}>
                  {editFormData.validityAmount ? `${editFormData.validityAmount}${editFormData.validityUnit.toUpperCase()}` : '--'}
                </span>
                <span>
                  ({editFormData.validityAmount ? formatValidityArabic(`${editFormData.validityAmount}${editFormData.validityUnit}`) : 'أدخل رقماً'})
                </span>
              </div>
            </div>
          </div>

          <div className="form-grid-2">
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
