import React, { useState, useEffect } from 'react';
import {
  Plus,
  Edit2,
  RefreshCw,
  Router,
  CreditCard,
  Users,
  Printer,
  Receipt,
  Wifi,
  ShoppingBag,
  Check,
  AlertTriangle,
  Lock,
  CheckCircle2,
  Layers,
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
  const [cardLimitInput, setCardLimitInput] = useState<number>(10000);
  const [isActive, setIsActive] = useState<boolean>(true);

  // Feature toggles
  const [featureA4, setFeatureA4] = useState<boolean>(true);
  const [featureThermal, setFeatureThermal] = useState<boolean>(true);
  const [featureOffline, setFeatureOffline] = useState<boolean>(true);
  const [featurePos, setFeaturePos] = useState<boolean>(true);
  const [featureMultiCashier, setFeatureMultiCashier] = useState<boolean>(true);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Toggle active confirmation modal state
  const [showToggleModal, setShowToggleModal] = useState<boolean>(false);
  const [selectedPlanForToggle, setSelectedPlanForToggle] = useState<PlanItem | null>(null);
  const [isToggling, setIsToggling] = useState<boolean>(false);

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
    setCardLimitInput(10000);
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
    setCardLimitInput(plan.cardLimit ?? 10000);
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

  const handleOpenToggleModal = (plan: PlanItem) => {
    setSelectedPlanForToggle(plan);
    setShowToggleModal(true);
  };

  const handleConfirmToggleActive = async () => {
    if (!selectedPlanForToggle) return;
    setIsToggling(true);
    try {
      await apiClient.patch(`/plans/${selectedPlanForToggle.id}/toggle-active`);
      showToast(
        selectedPlanForToggle.isActive
          ? 'تم إيقاف تفعيل الباقة للاشتراكات الجديدة بنجاح'
          : 'تم تفعيل الباقة وإتاحتها للاشتراك بنجاح',
        'success',
      );
      setShowToggleModal(false);
      fetchPlans();
    } catch (err: any) {
      showToast(err.message || 'فشل تغيير حالة الباقة', 'error');
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <div className="view-container" style={{ paddingBottom: '3rem' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              إدارة خطط وباقات الاشتراك (Commercial Plans)
            </h1>
            <span
              className="badge badge-info"
              style={{
                fontSize: '0.7rem',
                padding: '0.2rem 0.55rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
              }}
            >
              <Layers size={13} />
              الباقات التجارية
            </span>
          </div>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginTop: '0.25rem', marginBottom: 0 }}>
            تحديد الباقات، حدود الموجهات والكروت الشهرية، والأسعار التجارية المعتمدة في SudaFi
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={fetchPlans}
            disabled={isLoading}
            className="btn btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 0.95rem',
              minHeight: '38px',
            }}
            title="تحديث الباقات من قاعدة البيانات"
          >
            <RefreshCw size={15} className={isLoading ? 'spin-animation' : ''} />
            <span style={{ fontSize: '0.825rem', fontWeight: 600 }}>تحديث</span>
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="btn btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1.1rem',
              minHeight: '38px',
            }}
          >
            <Plus size={16} />
            <span style={{ fontSize: '0.825rem', fontWeight: 700 }}>إنشاء باقة جديدة</span>
          </button>
        </div>
      </div>

      {/* Plans Grid */}
      {isLoading ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          جاري تحميل باقات الاشتراك من الخادم...
        </div>
      ) : plans.length === 0 ? (
        <div className="card" style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
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
          {plans.map((plan) => {
            const isBusinessOrAbove =
              plan.name.includes('BUSINESS') || plan.name.includes('ENTERPRISE');
            const isPro = plan.name.includes('PRO');

            return (
              <div
                key={plan.id}
                className="card"
                style={{
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  border: plan.isActive
                    ? isBusinessOrAbove
                      ? '1px solid rgba(245, 158, 11, 0.4)'
                      : isPro
                      ? '1px solid rgba(13, 148, 136, 0.4)'
                      : '1px solid var(--border)'
                    : '1px dashed var(--border-light)',
                  opacity: plan.isActive ? 1 : 0.75,
                  position: 'relative',
                  boxShadow: plan.isActive ? 'var(--shadow-sm)' : 'none',
                }}
              >
                <div>
                  {/* Header Row */}
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
                          fontWeight: 800,
                          color: isBusinessOrAbove
                            ? 'var(--accent)'
                            : isPro
                            ? 'var(--primary)'
                            : 'var(--info)',
                          backgroundColor: isBusinessOrAbove
                            ? 'var(--warning-bg)'
                            : isPro
                            ? 'var(--primary-light)'
                            : 'var(--info-bg)',
                          padding: '0.15rem 0.55rem',
                          borderRadius: 'var(--radius-sm)',
                          display: 'inline-block',
                          marginBottom: '0.35rem',
                          letterSpacing: '0.5px',
                        }}
                      >
                        {plan.name}
                      </span>
                      <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                        {plan.nameAr}
                      </h3>
                    </div>

                    <span className={`badge ${plan.isActive ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.725rem' }}>
                      {plan.isActive ? 'نشطة' : 'معطلة'}
                    </span>
                  </div>

                  {/* Description */}
                  <p
                    style={{
                      fontSize: '0.825rem',
                      color: 'var(--text-secondary)',
                      marginBottom: '1rem',
                      minHeight: '38px',
                      lineHeight: '1.4',
                    }}
                  >
                    {plan.description || 'باقة إدارة شبكات ميكروتك وتوليد الكروت.'}
                  </p>

                  {/* Pricing Box */}
                  <div
                    style={{
                      backgroundColor: 'var(--bg-app)',
                      padding: '0.85rem',
                      borderRadius: 'var(--radius-md)',
                      marginBottom: '1rem',
                      display: 'flex',
                      justifyContent: 'space-around',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>الاشتراك الشهري</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--accent)' }}>
                        <bdi>{plan.priceMonthly.toLocaleString('ar-EG')}</bdi>{' '}
                        <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-muted)' }}>SDG</span>
                      </div>
                    </div>

                    <div style={{ width: 1, backgroundColor: 'var(--border)' }} />

                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>الاشتراك السنوي</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--success)' }}>
                        <bdi>{plan.priceYearly.toLocaleString('ar-EG')}</bdi>{' '}
                        <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-muted)' }}>SDG</span>
                      </div>
                    </div>
                  </div>

                  {/* Limits & Specifications */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.825rem' }}>
                      <Router size={16} color="var(--primary)" />
                      <span>
                        الحد الأقصى للموجهات:{' '}
                        <strong style={{ color: 'var(--text-primary)' }}>
                          {plan.maxRouters === 1 ? 'موجه واحد (1)' : `${plan.maxRouters} أجهزة`}
                        </strong>
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.825rem' }}>
                      <CreditCard size={16} color="var(--accent)" />
                      <span>
                        حصة توليد الكروت:{' '}
                        {plan.isUnlimited ? (
                          <span className="badge badge-success" style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem' }}>
                            غير محدود (Unlimited)
                          </span>
                        ) : plan.cardLimit === 0 ? (
                          <span className="badge badge-danger" style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem' }}>
                            ممنوع التوليد (0)
                          </span>
                        ) : (
                          <strong style={{ color: 'var(--text-primary)' }}>
                            <bdi>{(plan.cardLimit ?? 0).toLocaleString('ar-EG')}</bdi> كرت / شهر
                          </strong>
                        )}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.825rem' }}>
                      <Users size={16} color="var(--info)" />
                      <span>
                        المشتركون النشطون حالياً:{' '}
                        <strong style={{ color: 'var(--text-primary)' }}>
                          {plan.activeSubscribersCount ?? 0} شبكة مسجلة
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* Included Features Badges */}
                  <div style={{ marginBottom: '1.2rem' }}>
                    <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginBottom: '0.35rem', fontWeight: 600 }}>
                      الميزات التشغيلية المضمنة:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                      {plan.features?.a4Printing !== false && (
                        <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem', backgroundColor: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Printer size={11} color="var(--primary)" /> A4
                        </span>
                      )}
                      {plan.features?.thermalPrinting !== false && (
                        <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem', backgroundColor: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Receipt size={11} color="var(--primary)" /> فواتير حرارية
                        </span>
                      )}
                      {plan.features?.offlineSales !== false && (
                        <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem', backgroundColor: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Wifi size={11} color="var(--primary)" /> Offline
                        </span>
                      )}
                      {plan.features?.posTerminal !== false && (
                        <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem', backgroundColor: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          <ShoppingBag size={11} color="var(--primary)" /> POS
                        </span>
                      )}
                      {plan.features?.multiCashier !== false && (
                        <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem', backgroundColor: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Users size={11} color="var(--primary)" /> تعدد كاشيرات
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions Footer */}
                <div
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    paddingTop: '0.85rem',
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <button
                    onClick={() => handleOpenEditModal(plan)}
                    className="btn btn-secondary"
                    style={{
                      flex: 1,
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontSize: '0.8rem',
                      minHeight: '38px',
                    }}
                  >
                    <Edit2 size={14} />
                    <span>تعديل الخطة</span>
                  </button>

                  <button
                    onClick={() => handleOpenToggleModal(plan)}
                    className={`btn ${plan.isActive ? 'btn-ghost' : 'btn-primary'}`}
                    style={{
                      fontSize: '0.8rem',
                      padding: '0.4rem 0.85rem',
                      minHeight: '38px',
                      border: '1px solid var(--border)',
                    }}
                    title={plan.isActive ? 'إيقاف الخطة' : 'تفعيل الخطة'}
                  >
                    {plan.isActive ? 'إيقاف' : 'تفعيل'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Plan Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={isEditing ? `تعديل الباقة: ${nameAr}` : 'إنشاء باقة تجارية جديدة'}
        maxWidth="600px"
      >
        <form onSubmit={handleSavePlan} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Row 1: Slug & Arabic Name */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
            <div>
              <label className="form-label" style={{ fontWeight: 600 }}>
                الاسم الرمزي (Slug):
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="مثال: ENTERPRISE"
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase())}
                  disabled={isEditing}
                  required
                  style={{
                    width: '100%',
                    textTransform: 'uppercase',
                    backgroundColor: isEditing ? 'rgba(255, 255, 255, 0.04)' : 'var(--bg-app)',
                    border: '1px solid var(--border)',
                    color: isEditing ? 'var(--text-muted)' : 'var(--text-primary)',
                    paddingLeft: isEditing ? '2rem' : '0.85rem',
                    minHeight: '40px',
                  }}
                />
                {isEditing && (
                  <Lock
                    size={14}
                    color="var(--text-muted)"
                    style={{
                      position: 'absolute',
                      left: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                    }}
                  />
                )}
              </div>
              {isEditing && (
                <span style={{ fontSize: '0.675rem', color: 'var(--text-muted)', marginTop: '0.2rem', display: 'block' }}>
                  * الاسم الرمزي محمي من التعديل لضمان استقرار الاشتراكات القائمة.
                </span>
              )}
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: 600 }}>
                الاسم المعروض بالعربية:
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="مثال: باقة المؤسسات"
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                required
                style={{
                  width: '100%',
                  backgroundColor: 'var(--bg-app)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  minHeight: '40px',
                }}
              />
            </div>
          </div>

          {/* Row 2: Description */}
          <div>
            <label className="form-label" style={{ fontWeight: 600 }}>
              وصف الباقة:
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="وصف مختصر لمزايا الباقة وفئتها المستهدفة..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: 'var(--bg-app)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                minHeight: '40px',
              }}
            />
          </div>

          {/* Row 3: Max Routers, Monthly Price, Yearly Price */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.85rem' }}>
            <div>
              <label className="form-label" style={{ fontWeight: 600 }}>
                الحد الأقصى للموجهات:
              </label>
              <input
                type="number"
                min="1"
                max="100"
                className="form-input"
                value={maxRouters}
                onChange={(e) => setMaxRouters(Math.max(1, parseInt(e.target.value, 10) || 1))}
                required
                style={{
                  width: '100%',
                  backgroundColor: 'var(--bg-app)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  minHeight: '40px',
                }}
              />
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: 600 }}>
                السعر الشهري (SDG):
              </label>
              <input
                type="number"
                min="0"
                className="form-input"
                value={priceMonthly}
                onChange={(e) => setPriceMonthly(Math.max(0, parseFloat(e.target.value) || 0))}
                required
                style={{
                  width: '100%',
                  backgroundColor: 'var(--bg-app)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  minHeight: '40px',
                }}
              />
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: 600 }}>
                السعر السنوي (SDG):
              </label>
              <input
                type="number"
                min="0"
                className="form-input"
                value={priceYearly}
                onChange={(e) => setPriceYearly(Math.max(0, parseFloat(e.target.value) || 0))}
                required
                style={{
                  width: '100%',
                  backgroundColor: 'var(--bg-app)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  minHeight: '40px',
                }}
              />
            </div>
          </div>

          {/* Row 4: Cards Quota Configuration */}
          <div
            style={{
              padding: '0.95rem',
              backgroundColor: 'var(--bg-app)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label" style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem' }}>
                حصة توليد الكروت الشهرية
              </label>

              {/* Styled Pill Checkbox */}
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  cursor: 'pointer',
                  padding: '0.25rem 0.65rem',
                  borderRadius: 'var(--radius-full, 9999px)',
                  backgroundColor: isUnlimitedCards ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                  border: isUnlimitedCards ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid var(--border)',
                  fontSize: '0.775rem',
                  fontWeight: isUnlimitedCards ? 700 : 500,
                  color: isUnlimitedCards ? 'var(--success)' : 'var(--text-secondary)',
                  transition: 'all 0.2s ease',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={isUnlimitedCards}
                  onChange={(e) => setIsUnlimitedCards(e.target.checked)}
                  style={{ accentColor: 'var(--success)', cursor: 'pointer' }}
                />
                <span>غير محدود (Unlimited)</span>
              </label>
            </div>

            {!isUnlimitedCards ? (
              <div>
                <input
                  type="number"
                  min="0"
                  step="500"
                  className="form-input"
                  placeholder="عدد الكروت الشهري (مثال: 50000)"
                  value={cardLimitInput}
                  onChange={(e) => setCardLimitInput(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    minHeight: '40px',
                  }}
                />
                <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.35rem', display: 'block' }}>
                  * قيمة (0) تعني منع التوليد لهذه الباقة، وأي قيمة موجبة تعني السقف الأقصى الشهري.
                </span>
              </div>
            ) : (
              <div
                style={{
                  padding: '0.5rem 0.75rem',
                  backgroundColor: 'rgba(16, 185, 129, 0.08)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  fontSize: '0.8rem',
                  color: 'var(--success)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <CheckCircle2 size={16} />
                <span>لا يوجد أي سقف لتوليد الكروت، بإمكان المشترك إنشاء وتوليد الكروت بحرية تامة.</span>
              </div>
            )}
          </div>

          {/* Row 5: Operational Features Interactive Cards */}
          <div>
            <label className="form-label" style={{ fontWeight: 700, marginBottom: '0.5rem', display: 'block' }}>
              الميزات التشغيلية المضمنة:
            </label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '0.6rem',
              }}
            >
              {/* Feature 1: A4 */}
              <div
                onClick={() => setFeatureA4(!featureA4)}
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: featureA4 ? 'rgba(13, 148, 136, 0.12)' : 'var(--bg-app)',
                  border: featureA4 ? '1px solid var(--primary)' : '1px solid var(--border)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  userSelect: 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.825rem' }}>
                  <Printer size={16} color={featureA4 ? 'var(--primary)' : 'var(--text-muted)'} />
                  <span style={{ fontWeight: featureA4 ? 700 : 500, color: featureA4 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    طباعة شيتات A4
                  </span>
                </div>
                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '4px',
                    backgroundColor: featureA4 ? 'var(--primary)' : 'transparent',
                    border: featureA4 ? 'none' : '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {featureA4 && <Check size={12} color="white" />}
                </div>
              </div>

              {/* Feature 2: Thermal */}
              <div
                onClick={() => setFeatureThermal(!featureThermal)}
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: featureThermal ? 'rgba(13, 148, 136, 0.12)' : 'var(--bg-app)',
                  border: featureThermal ? '1px solid var(--primary)' : '1px solid var(--border)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  userSelect: 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.825rem' }}>
                  <Receipt size={16} color={featureThermal ? 'var(--primary)' : 'var(--text-muted)'} />
                  <span style={{ fontWeight: featureThermal ? 700 : 500, color: featureThermal ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    طباعة فواتير حرارية ESC/POS
                  </span>
                </div>
                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '4px',
                    backgroundColor: featureThermal ? 'var(--primary)' : 'transparent',
                    border: featureThermal ? 'none' : '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {featureThermal && <Check size={12} color="white" />}
                </div>
              </div>

              {/* Feature 3: Offline Sales */}
              <div
                onClick={() => setFeatureOffline(!featureOffline)}
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: featureOffline ? 'rgba(13, 148, 136, 0.12)' : 'var(--bg-app)',
                  border: featureOffline ? '1px solid var(--primary)' : '1px solid var(--border)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  userSelect: 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.825rem' }}>
                  <Wifi size={16} color={featureOffline ? 'var(--primary)' : 'var(--text-muted)'} />
                  <span style={{ fontWeight: featureOffline ? 700 : 500, color: featureOffline ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    مزامنة ومبيعات Offline
                  </span>
                </div>
                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '4px',
                    backgroundColor: featureOffline ? 'var(--primary)' : 'transparent',
                    border: featureOffline ? 'none' : '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {featureOffline && <Check size={12} color="white" />}
                </div>
              </div>

              {/* Feature 4: POS */}
              <div
                onClick={() => setFeaturePos(!featurePos)}
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: featurePos ? 'rgba(13, 148, 136, 0.12)' : 'var(--bg-app)',
                  border: featurePos ? '1px solid var(--primary)' : '1px solid var(--border)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  userSelect: 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.825rem' }}>
                  <ShoppingBag size={16} color={featurePos ? 'var(--primary)' : 'var(--text-muted)'} />
                  <span style={{ fontWeight: featurePos ? 700 : 500, color: featurePos ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    نقطة بيع سريعة (POS)
                  </span>
                </div>
                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '4px',
                    backgroundColor: featurePos ? 'var(--primary)' : 'transparent',
                    border: featurePos ? 'none' : '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {featurePos && <Check size={12} color="white" />}
                </div>
              </div>

              {/* Feature 5: Multi-Cashier */}
              <div
                onClick={() => setFeatureMultiCashier(!featureMultiCashier)}
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: featureMultiCashier ? 'rgba(13, 148, 136, 0.12)' : 'var(--bg-app)',
                  border: featureMultiCashier ? '1px solid var(--primary)' : '1px solid var(--border)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  userSelect: 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.825rem' }}>
                  <Users size={16} color={featureMultiCashier ? 'var(--primary)' : 'var(--text-muted)'} />
                  <span style={{ fontWeight: featureMultiCashier ? 700 : 500, color: featureMultiCashier ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    تعدد المحصلين والكاشيرات
                  </span>
                </div>
                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '4px',
                    backgroundColor: featureMultiCashier ? 'var(--primary)' : 'transparent',
                    border: featureMultiCashier ? 'none' : '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {featureMultiCashier && <Check size={12} color="white" />}
                </div>
              </div>
            </div>
          </div>

          {/* Submit buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowModal(false)}
              disabled={isSubmitting}
              style={{ minHeight: '38px', padding: '0.45rem 1rem' }}
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
              style={{ minHeight: '38px', padding: '0.45rem 1.25rem', fontWeight: 700 }}
            >
              {isSubmitting ? 'جاري الحفظ...' : isEditing ? 'تحديث الباقة' : 'إنشاء الباقة'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Toggle Active Confirmation Modal */}
      <Modal
        isOpen={showToggleModal}
        onClose={() => setShowToggleModal(false)}
        title={selectedPlanForToggle?.isActive ? 'إيقاف الباقة التجارية' : 'تفعيل الباقة التجارية'}
        maxWidth="460px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div
            style={{
              padding: '0.85rem',
              backgroundColor: selectedPlanForToggle?.isActive ? 'var(--warning-bg)' : 'var(--success-bg)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              gap: '0.75rem',
              alignItems: 'center',
            }}
          >
            <AlertTriangle
              size={22}
              color={selectedPlanForToggle?.isActive ? 'var(--accent)' : 'var(--success)'}
              style={{ flexShrink: 0 }}
            />
            <div style={{ fontSize: '0.85rem' }}>
              {selectedPlanForToggle?.isActive ? (
                <>
                  هل أنت متأكد من رغبتك في إيقاف باقة{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>
                    "{selectedPlanForToggle?.nameAr} ({selectedPlanForToggle?.name})"
                  </strong>
                  ؟ لن يتمكن أصحاب الشبكات الجدد من اختيار هذه الباقة، بينما ستستمر الاشتراكات القائمة (
                  <strong style={{ color: 'var(--accent)' }}>
                    {selectedPlanForToggle?.activeSubscribersCount ?? 0} شبكة نشطة
                  </strong>
                  ) حتى نهاية مدتها.
                </>
              ) : (
                <>
                  تفعيل باقة{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>
                    "{selectedPlanForToggle?.nameAr} ({selectedPlanForToggle?.name})"
                  </strong>{' '}
                  وإتاحتها فوراً لجميع أصحاب الشبكات الجدد والحاليين للاشتراك والتجديد.
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowToggleModal(false)}
              disabled={isToggling}
            >
              إلغاء
            </button>
            <button
              className={`btn ${selectedPlanForToggle?.isActive ? 'btn-danger' : 'btn-primary'}`}
              onClick={handleConfirmToggleActive}
              disabled={isToggling}
            >
              {isToggling ? 'جاري التنفيذ...' : selectedPlanForToggle?.isActive ? 'تأكيد الإيقاف' : 'تأكيد التفعيل'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
