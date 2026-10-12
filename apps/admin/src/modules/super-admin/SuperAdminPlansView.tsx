import React, { useState, useEffect } from 'react';
import {
  Plus,
  Edit2,
  RefreshCw,
  Router,
  CreditCard,
  Users,
} from 'lucide-react';
import { apiClient } from '../../core/api/api-client';
import { Modal } from '../../components/common/Modal';
import { useToast } from '../../core/context/ToastContext';

interface PlanItem {
  id: string;
  name: string;
  nameAr: string;
  description: string | null;
  maxRouters: number;
  priceMonthly: number;
  priceYearly: number;
  features: Record<string, any>;
  cardLimit: number | null;
  maxCardsPerMonth?: number | null;
  isUnlimited: boolean;
  isActive: boolean;
  activeSubscribersCount?: number;
  totalSubscribersCount?: number;
  createdAt: string;
  updatedAt: string;
}

export const SuperAdminPlansView: React.FC = () => {
  const { showToast } = useToast();
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Create / Edit modal state
  const [showModal, setShowModal] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState<string>('');
  const [nameAr, setNameAr] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [maxRouters, setMaxRouters] = useState<number>(1);
  const [priceMonthly, setPriceMonthly] = useState<number>(0);
  const [priceYearly, setPriceYearly] = useState<number>(0);
  const [isUnlimitedCards, setIsUnlimitedCards] = useState<boolean>(false);
  const [cardLimitInput, setCardLimitInput] = useState<number>(1000);
  const [isActive, setIsActive] = useState<boolean>(true);

  // Feature toggles
  const [featureA4, setFeatureA4] = useState<boolean>(true);
  const [featureThermal, setFeatureThermal] = useState<boolean>(true);
  const [featureOffline, setFeatureOffline] = useState<boolean>(true);
  const [featurePos, setFeaturePos] = useState<boolean>(true);
  const [featureMultiCashier, setFeatureMultiCashier] = useState<boolean>(true);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fetchPlans = async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get<PlanItem[]>('/plans', { includeInactive: true });
      if (Array.isArray(res)) {
        setPlans(res);
      }
    } catch (err: any) {
      showToast(err.message || 'فشل تحميل باقات الاشتراك', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const handleOpenCreateModal = () => {
    setIsEditing(false);
    setEditingPlanId(null);
    setName('');
    setNameAr('');
    setDescription('');
    setMaxRouters(1);
    setPriceMonthly(0);
    setPriceYearly(0);
    setIsUnlimitedCards(false);
    setCardLimitInput(1000);
    setIsActive(true);
    setFeatureA4(true);
    setFeatureThermal(true);
    setFeatureOffline(true);
    setFeaturePos(true);
    setFeatureMultiCashier(true);
    setShowModal(true);
  };

  const handleOpenEditModal = (plan: PlanItem) => {
    setIsEditing(true);
    setEditingPlanId(plan.id);
    setName(plan.name);
    setNameAr(plan.nameAr);
    setDescription(plan.description || '');
    setMaxRouters(plan.maxRouters);
    setPriceMonthly(plan.priceMonthly);
    setPriceYearly(plan.priceYearly);
    setIsUnlimitedCards(plan.isUnlimited);
    setCardLimitInput(plan.cardLimit ?? 1000);
    setIsActive(plan.isActive);

    const f = plan.features || {};
    setFeatureA4(f.a4Printing !== false);
    setFeatureThermal(f.thermalPrinting !== false);
    setFeatureOffline(f.offlineSales !== false);
    setFeaturePos(f.posTerminal !== false);
    setFeatureMultiCashier(f.multiCashier !== false);

    setShowModal(true);
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !nameAr.trim()) {
      showToast('يرجى إدخال اسم الخطة باللغة الإنجليزية والعربية', 'warning');
      return;
    }

    setIsSubmitting(true);
    const featuresPayload: Record<string, any> = {
      isUnlimited: isUnlimitedCards,
      cardGenerationLimit: isUnlimitedCards ? null : Number(cardLimitInput),
      a4Printing: featureA4,
      thermalPrinting: featureThermal,
      offlineSales: featureOffline,
      posTerminal: featurePos,
      multiCashier: featureMultiCashier,
    };

    try {
      if (isEditing && editingPlanId) {
        await apiClient.patch(`/plans/${editingPlanId}`, {
          nameAr: nameAr.trim(),
          description: description.trim() || undefined,
          maxRouters: Number(maxRouters),
          priceMonthly: Number(priceMonthly),
          priceYearly: Number(priceYearly),
          features: featuresPayload,
          isActive,
        });
        showToast('تم تعديل الباقة بنجاح', 'success');
      } else {
        await apiClient.post('/plans', {
          name: name.trim().toUpperCase(),
          nameAr: nameAr.trim(),
          description: description.trim() || undefined,
          maxRouters: Number(maxRouters),
          priceMonthly: Number(priceMonthly),
          priceYearly: Number(priceYearly),
          features: featuresPayload,
          isActive,
        });
        showToast('تم إنشاء الباقة بنجاح', 'success');
      }
      setShowModal(false);
      fetchPlans();
    } catch (err: any) {
      showToast(err.message || 'فشل حفظ الباقة', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (plan: PlanItem) => {
    try {
      await apiClient.patch(`/plans/${plan.id}/toggle-active`);
      showToast(
        plan.isActive ? 'تم إيقاف تفعيل الباقة للاشتراكات الجديدة' : 'تم تفعيل الباقة للاشتراكات',
        'success',
      );
      fetchPlans();
    } catch (err: any) {
      showToast(err.message || 'فشل تغيير حالة الباقة', 'error');
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
            إدارة خطط وباقات الاشتراك (Commercial Plans)
          </h1>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            تحديد الباقات، حدود الموجهات والكروت الشهرية، والأسعار التجارية للمنصة
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={fetchPlans}
            disabled={isLoading}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.85rem' }}
          >
            <RefreshCw size={15} className={isLoading ? 'spin-animation' : ''} />
            <span>تحديث</span>
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}
          >
            <Plus size={16} />
            <span>إنشاء باقة جديدة</span>
          </button>
        </div>
      </div>

      {/* Plans Grid */}
      {isLoading ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          جاري تحميل باقات الاشتراك...
        </div>
      ) : plans.length === 0 ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          لا توجد خطط مسجلة حاليًا. اضغط على زر "إنشاء باقة جديدة" للبدء.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '1.25rem',
          }}
        >
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="card"
              style={{
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                border: plan.isActive ? '1px solid var(--border)' : '1px dashed var(--border-light)',
                opacity: plan.isActive ? 1 : 0.75,
              }}
            >
              <div>
                {/* Header */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '0.75rem',
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: 'var(--primary)',
                        backgroundColor: 'var(--primary-light)',
                        padding: '0.15rem 0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        display: 'inline-block',
                        marginBottom: '0.25rem',
                      }}
                    >
                      {plan.name}
                    </span>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>{plan.nameAr}</h3>
                  </div>

                  <span className={`badge ${plan.isActive ? 'badge-success' : 'badge-danger'}`}>
                    {plan.isActive ? 'نشطة' : 'معطلة'}
                  </span>
                </div>

                {/* Description */}
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem', minHeight: '36px' }}>
                  {plan.description || 'باقة إدارة شبكات ميكروتك وتوليد الكروت.'}
                </p>

                {/* Pricing Box */}
                <div
                  style={{
                    backgroundColor: 'var(--bg-app)',
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '1rem',
                    display: 'flex',
                    justifyContent: 'space-around',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>الاشتراك الشهري</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent)' }}>
                      {plan.priceMonthly.toLocaleString('ar-EG')}{' '}
                      <span style={{ fontSize: '0.7rem', fontWeight: 500 }}>SDG</span>
                    </div>
                  </div>

                  <div style={{ width: 1, backgroundColor: 'var(--border)' }} />

                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>الاشتراك السنوي</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--success)' }}>
                      {plan.priceYearly.toLocaleString('ar-EG')}{' '}
                      <span style={{ fontSize: '0.7rem', fontWeight: 500 }}>SDG</span>
                    </div>
                  </div>
                </div>

                {/* Limits & Specifications */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.825rem' }}>
                    <Router size={16} color="var(--primary)" />
                    <span>
                      حد الموجهات:{' '}
                      <strong style={{ color: 'var(--text-primary)' }}>
                        {plan.maxRouters === 1 ? 'موجه واحد' : `${plan.maxRouters} أجهزة`}
                      </strong>
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.825rem' }}>
                    <CreditCard size={16} color="var(--accent)" />
                    <span>
                      حد الكروت الشهري:{' '}
                      {plan.isUnlimited ? (
                        <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                          غير محدود (Unlimited)
                        </span>
                      ) : (
                        <strong style={{ color: 'var(--text-primary)' }}>
                          {(plan.cardLimit ?? 0).toLocaleString('ar-EG')} كرت / شهر
                        </strong>
                      )}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.825rem' }}>
                    <Users size={16} color="var(--info)" />
                    <span>
                      المشتركون النشطون:{' '}
                      <strong style={{ color: 'var(--text-primary)' }}>
                        {plan.activeSubscribersCount ?? 0} شبكة
                      </strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  paddingTop: '0.75rem',
                  borderTop: '1px solid var(--border)',
                }}
              >
                <button
                  onClick={() => handleOpenEditModal(plan)}
                  className="btn btn-secondary"
                  style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}
                >
                  <Edit2 size={14} />
                  <span>تعديل الخطة</span>
                </button>

                <button
                  onClick={() => handleToggleActive(plan)}
                  className={`btn ${plan.isActive ? 'btn-ghost' : 'btn-primary'}`}
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                  title={plan.isActive ? 'تعطيل الخطة' : 'تفعيل الخطة'}
                >
                  {plan.isActive ? 'إيقاف' : 'تفعيل'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Plan Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={isEditing ? `تعديل الباقة: ${nameAr}` : 'إنشاء باقة تجارية جديدة'}
        maxWidth="560px"
      >
        <form onSubmit={handleSavePlan} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label className="form-label">الاسم الرمزي (Slug):</label>
              <input
                type="text"
                className="form-input"
                placeholder="مثال: ENTERPRISE"
                value={name}
                onChange={(e) => setName(e.target.value.toUpperCase())}
                disabled={isEditing}
                required
                style={{ width: '100%', textTransform: 'uppercase' }}
              />
            </div>

            <div>
              <label className="form-label">الاسم المعروض بالعربية:</label>
              <input
                type="text"
                className="form-input"
                placeholder="مثال: باقة المؤسسات"
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                required
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div>
            <label className="form-label">وصف الباقة:</label>
            <input
              type="text"
              className="form-input"
              placeholder="وصف مختصر لمزايا الباقة وفئتها المستهدفة..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label className="form-label">الحد الأقصى للموجهات:</label>
              <input
                type="number"
                min="1"
                max="100"
                className="form-input"
                value={maxRouters}
                onChange={(e) => setMaxRouters(Math.max(1, parseInt(e.target.value, 10) || 1))}
                required
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label className="form-label">السعر الشهري (SDG):</label>
              <input
                type="number"
                min="0"
                className="form-input"
                value={priceMonthly}
                onChange={(e) => setPriceMonthly(Math.max(0, parseFloat(e.target.value) || 0))}
                required
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label className="form-label">السعر السنوي (SDG):</label>
              <input
                type="number"
                min="0"
                className="form-input"
                value={priceYearly}
                onChange={(e) => setPriceYearly(Math.max(0, parseFloat(e.target.value) || 0))}
                required
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {/* Cards Quota Configuration */}
          <div
            style={{
              padding: '0.85rem',
              backgroundColor: 'var(--bg-app)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label className="form-label" style={{ margin: 0, fontWeight: 700 }}>
                حصة توليد الكروت الشهرية
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                <input
                  type="checkbox"
                  checked={isUnlimitedCards}
                  onChange={(e) => setIsUnlimitedCards(e.target.checked)}
                />
                <span>غير محدود (Unlimited)</span>
              </label>
            </div>

            {!isUnlimitedCards ? (
              <div>
                <input
                  type="number"
                  min="0"
                  step="100"
                  className="form-input"
                  placeholder="عدد الكروت الشهري (مثال: 5000)"
                  value={cardLimitInput}
                  onChange={(e) => setCardLimitInput(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  style={{ width: '100%' }}
                />
                <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                  * قيمة (0) تعني منع التوليد لهذه الباقة، وقيمة موجبة تعني الحد الأقصى الشهري.
                </span>
              </div>
            ) : (
              <div style={{ fontSize: '0.775rem', color: 'var(--success)' }}>
                ✓ لا يوجد أي سقف لتوليد الكروت، بإمكان المشترك إنشاء أي كمية كروت.
              </div>
            )}
          </div>

          {/* Feature Checkboxes */}
          <div>
            <label className="form-label" style={{ fontWeight: 700 }}>الميزات التشغيلية المضمنة:</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <input type="checkbox" checked={featureA4} onChange={(e) => setFeatureA4(e.target.checked)} />
                <span>طباعة شيتات A4</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <input type="checkbox" checked={featureThermal} onChange={(e) => setFeatureThermal(e.target.checked)} />
                <span>طباعة فواتير حرارية ESC/POS</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <input type="checkbox" checked={featureOffline} onChange={(e) => setFeatureOffline(e.target.checked)} />
                <span>مزامنة ومبيعات Offline</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <input type="checkbox" checked={featurePos} onChange={(e) => setFeaturePos(e.target.checked)} />
                <span>نقطة بيع سريعة (POS)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <input type="checkbox" checked={featureMultiCashier} onChange={(e) => setFeatureMultiCashier(e.target.checked)} />
                <span>تعدد المحصلين والكاشيرات</span>
              </label>
            </div>
          </div>

          {/* Submit buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowModal(false)}
              disabled={isSubmitting}
            >
              إلغاء
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'جاري الحفظ...' : isEditing ? 'تحديث الباقة' : 'إنشاء الباقة'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
