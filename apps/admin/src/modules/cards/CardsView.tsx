import React, { useEffect, useState } from 'react';
import { apiClient } from '../../core/api/api-client';
import { useToast } from '../../core/context/ToastContext';
import { Modal } from '../../components/common/Modal';
import { CreditCard, Plus, RefreshCw, QrCode, Search, Filter, Ban, CheckCircle, Printer, Download } from 'lucide-react';
import { CardItem, HotspotProfileItem } from '../../core/types/view-models';
import { PdfExportService } from '../../core/services/pdf-export-service';

interface CardsViewProps {
  onNavigate?: (tab: string) => void;
}

export const CardsView: React.FC<CardsViewProps> = ({ onNavigate }) => {
  const { showToast } = useToast();
  const [cards, setCards] = useState<CardItem[]>([]);
  const [profiles, setProfiles] = useState<HotspotProfileItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Generate Batch Modal state
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [batchForm, setBatchForm] = useState({
    profileId: '',
    quantity: 100,
    prefix: 'HS-',
    codeLength: 8,
    singleCredential: true,
    themePreset: 'FOOTBALL',
  });
  const [isGenerating, setIsGenerating] = useState(false);

  // Selected Card for QR / Details Modal
  const [selectedCard, setSelectedCard] = useState<CardItem | null>(null);
  const [exportingSinglePdf, setExportingSinglePdf] = useState(false);

  const handleExportSingleCardPdf = async () => {
    if (!selectedCard) return;
    setExportingSinglePdf(true);
    try {
      await PdfExportService.exportCardsPdf([selectedCard], {
        format: 'THERMAL_80',
        networkName: 'شبكة ميكروتيك هوتسبوت',
        includeQr: true,
        loginUrl: 'http://login.hotspot',
      });
      showToast('تم تصدير كرت الهوتسبوت كملف PDF بنجاح!', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل تصدير ملف PDF';
      showToast(msg, 'error');
    } finally {
      setExportingSinglePdf(false);
    }
  };

  const fetchCards = async (isInitial = true) => {
    if (isInitial) setLoading(true);
    try {
      const promises: [Promise<any>, Promise<any>?] = [
        apiClient.get<CardItem[]>('/cards', {
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          search: searchQuery || undefined,
        }),
      ];

      // Only fetch profiles if not loaded yet
      if (profiles.length === 0 || isInitial) {
        promises.push(apiClient.get<HotspotProfileItem[]>('/hotspot/profiles'));
      }

      const [cardsRes, profilesRes] = await Promise.all(promises);

      if (Array.isArray(cardsRes)) {
        setCards(cardsRes);
      } else if (cardsRes && typeof cardsRes === 'object' && 'data' in cardsRes && Array.isArray((cardsRes as any).data)) {
        setCards((cardsRes as any).data);
      }

      if (profilesRes && Array.isArray(profilesRes)) {
        setProfiles(profilesRes);
        if (profilesRes.length > 0 && !batchForm.profileId) {
          setBatchForm((prev) => ({ ...prev, profileId: profilesRes[0].id }));
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل تحميل الكروت من الخادم';
      showToast(msg, 'error');
      if (isInitial) {
        setCards([]);
        setProfiles([]);
      }
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    fetchCards(false);
  }, [statusFilter]);

  const handleGenerateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchForm.profileId || !batchForm.quantity) {
      showToast('يرجى تحديد الباقة والكمية المطلوبة', 'warning');
      return;
    }

    const selectedProf = profiles.find((p) => p.id === batchForm.profileId);
    const payload = {
      profileId: batchForm.profileId,
      deviceId: selectedProf?.deviceId || undefined,
      totalCards: Number(batchForm.quantity),
      quantity: Number(batchForm.quantity),
      length: Number(batchForm.codeLength) || 8,
      codeLength: Number(batchForm.codeLength) || 8,
      prefix: batchForm.prefix || 'HS-',
      price: selectedProf?.price || 500,
      singleCredential: batchForm.singleCredential,
      singleUserPin: batchForm.singleCredential,
      themePreset: batchForm.themePreset,
    };

    setIsGenerating(true);
    try {
      await apiClient.post('/cards/batches', payload);
      showToast(`تم توليد دفعة جديدة تحوي ${batchForm.quantity} كرت بنجاح وتشفيرها`, 'success');
      setIsGenerateOpen(false);
      fetchCards(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل توليد دفعة الكروت';
      showToast(msg, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleToggleCardStatus = async (card: CardItem) => {
    const isCurrentlyDisabled = card.status === 'DISABLED';
    const newStatus = isCurrentlyDisabled ? 'AVAILABLE' : 'DISABLED';
    const actionText = isCurrentlyDisabled ? 'إعادة تفعيل' : 'تعطيل';

    if (!window.confirm(`هل أنت متأكد من رغبتك في ${actionText} الكرت (${card.username})؟`)) return;

    // Optimistic UI status toggle
    const prevCards = cards;
    setCards((prev) =>
      prev.map((c) => (c.id === card.id ? { ...c, status: newStatus as any } : c))
    );

    try {
      await apiClient.patch(`/cards/${card.id}/status`, { status: newStatus });
      showToast(`تم ${actionText} الكرت بنجاح`, 'success');
    } catch (err: unknown) {
      // Revert on network failure
      setCards(prevCards);
      const msg = err instanceof Error ? err.message : `فشل ${actionText} الكرت`;
      showToast(msg, 'error');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'AVAILABLE':
        return <span className="badge badge-success">جاهز للبيع</span>;
      case 'SOLD':
        return <span className="badge badge-warning">مباع</span>;
      case 'ACTIVE':
        return <span className="badge badge-info">نشط على الشبكة</span>;
      default:
        return <span className="badge badge-danger">معطل</span>;
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <CreditCard color="var(--primary)" size={24} />
            مخزون وتوليد كروت الهوتسبوت
          </h1>
          <p className="page-subtitle">
            توليد كروت آمنة عشوائية (CSPRNG)، تتبع الحالات، والتحكم في المخزون
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {onNavigate && (
            <button
              className="btn btn-outline"
              style={{ borderColor: '#0d9488', color: '#0d9488' }}
              onClick={() => onNavigate('print')}
            >
              <Printer size={16} />
              استوديو تصدير وطباعة الـ PDF
            </button>
          )}
          <button className="btn btn-outline" onClick={() => fetchCards(true)} disabled={loading}>
            <RefreshCw size={16} />
            تحديث
          </button>
          <button className="btn btn-primary" onClick={() => setIsGenerateOpen(true)}>
            <Plus size={16} />
            توليد دفعة كروت جديدة
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ marginBottom: '1.25rem', padding: '0.85rem 1.25rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              flex: 1,
              minWidth: '240px',
            }}
          >
            <Search size={16} color="var(--text-muted)" />
            <input
              className="input"
              style={{ padding: '0.45rem 0.75rem' }}
              placeholder="بحث بالرقم التسلسلي أو اسم المستخدم..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchCards(false)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Filter size={16} color="var(--text-muted)" />
            <select
              className="select"
              style={{ width: 'auto', padding: '0.45rem 0.75rem' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">جميع الحالات</option>
              <option value="AVAILABLE">المتوفرة للبيع فقط</option>
              <option value="SOLD">المباعة</option>
              <option value="ACTIVE">النشطة على الشبكة</option>
              <option value="DISABLED">المعطلة</option>
            </select>
          </div>
        </div>
      </div>

      {/* Cards Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>الرقم التسلسلي</th>
              <th>اسم المستخدم</th>
              <th>الباقة</th>
              <th>السعر</th>
              <th>الحالة</th>
              <th>الراوتر المرتبط</th>
              <th style={{ textAlign: 'left' }}>رمز QR</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((card) => (
              <tr key={card.id}>
                <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{card.serialNumber}</td>
                <td
                  style={{
                    direction: 'ltr',
                    textAlign: 'right',
                    fontWeight: 800,
                    color: 'var(--primary)',
                    fontFamily: 'monospace',
                  }}
                >
                  {card.username}
                </td>
                <td>{card.profile?.displayName || card.profile?.name || 'عام'}</td>
                <td style={{ fontWeight: 700 }}>{Number(card.price).toLocaleString()} SDG</td>
                <td>{getStatusBadge(card.status)}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{card.device?.name || 'الكل'}</td>
                <td style={{ textAlign: 'left' }}>
                  <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => setSelectedCard(card)}
                      title="عرض رمز الاستجابة السريعة وبيانات الكرت"
                    >
                      <QrCode size={14} />
                      عرض
                    </button>
                    {card.status !== 'SOLD' && (
                      <button
                        className="btn btn-outline btn-sm"
                        style={{
                          color: card.status === 'DISABLED' ? 'var(--success)' : 'var(--danger)',
                          borderColor: 'var(--border)',
                        }}
                        onClick={() => handleToggleCardStatus(card)}
                        title={card.status === 'DISABLED' ? 'إعادة تفعيل الكرت' : 'تعطيل الكرت'}
                      >
                        {card.status === 'DISABLED' ? <CheckCircle size={14} /> : <Ban size={14} />}
                        {card.status === 'DISABLED' ? 'تفعيل' : 'تعطيل'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Generate Batch Modal */}
      <Modal
        isOpen={isGenerateOpen}
        onClose={() => setIsGenerateOpen(false)}
        title="توليد دفعة كروت جديدة"
        maxWidth="520px"
      >
        <form onSubmit={handleGenerateBatch}>
          <div className="form-group">
            <label className="form-label" htmlFor="gen-profile">
              اختر باقة الكروت المستهدفة *
            </label>
            <select
              id="gen-profile"
              className="select"
              value={batchForm.profileId}
              onChange={(e) => setBatchForm({ ...batchForm, profileId: e.target.value })}
              required
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName || p.name} ({p.price} SDG)
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="gen-qty">
                الكمية المطلوبة (عدد الكروت) *
              </label>
              <input
                id="gen-qty"
                type="number"
                min={1}
                max={5000}
                className="input"
                value={batchForm.quantity}
                onChange={(e) => setBatchForm({ ...batchForm, quantity: Number(e.target.value) })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="gen-len">
                طول الرمز (6 إلى 12 خانة)
              </label>
              <input
                id="gen-len"
                type="number"
                min={6}
                max={12}
                className="input"
                value={batchForm.codeLength}
                onChange={(e) => setBatchForm({ ...batchForm, codeLength: Number(e.target.value) })}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="gen-prefix">
              بادئة أرقام الكروت
            </label>
            <input
              id="gen-prefix"
              className="input"
              style={{ direction: 'ltr', textAlign: 'left' }}
              value={batchForm.prefix}
              onChange={(e) => setBatchForm({ ...batchForm, prefix: e.target.value })}
              placeholder="HS-"
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={batchForm.singleCredential}
                onChange={(e) => setBatchForm({ ...batchForm, singleCredential: e.target.checked })}
              />
              <span style={{ fontWeight: 600 }}>اسم المستخدم = كلمة المرور (رمز PIN موحد لتسجيل الدخول السريع)</span>
            </label>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="gen-theme">
              تصميم وثيم الكرت المخصص
            </label>
            <select
              id="gen-theme"
              className="input"
              value={batchForm.themePreset}
              onChange={(e) => setBatchForm({ ...batchForm, themePreset: e.target.value })}
            >
              <option value="FOOTBALL">ثيم كرة القدم الذهبي (Football Gold)</option>
              <option value="EID_MUBARAK">عيد مبارك الملكي (Royal Eid)</option>
              <option value="TURQUOISE">الفيروزي الحديث (Modern Turquoise)</option>
              <option value="TICKET">تذكرة كلاسيكية (Classic Ticket)</option>
              <option value="COMPACT">مدمج أنيق (Compact Slate)</option>
            </select>
          </div>

          <div
            style={{
              padding: '0.75rem',
              backgroundColor: 'var(--primary-light)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-accent)',
              fontSize: '0.775rem',
              color: 'var(--text-secondary)',
            }}
          >
            🛡️ خوارزمية التوليد تستخدم تشفيراً عشوائياً قوياً (CSPRNG) مع استبعاد الأحرف المتشابهة
            (0, O, 1, I, L) وتضمن عدم التصادم نهائياً.
          </div>

          <div className="modal-footer" style={{ padding: '1rem 0 0 0', marginTop: '1rem' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setIsGenerateOpen(false)}
            >
              إلغاء
            </button>
            <button type="submit" className="btn btn-primary" disabled={isGenerating}>
              {isGenerating ? 'جاري التوليد والتشفير...' : `توليد ${batchForm.quantity} كرت الآن`}
            </button>
          </div>
        </form>
      </Modal>

      {/* Card Details / QR Modal */}
      <Modal
        isOpen={!!selectedCard}
        onClose={() => setSelectedCard(null)}
        title={`تفاصيل الكرت: #${selectedCard?.serialNumber || ''}`}
        maxWidth="420px"
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: 180,
              height: 180,
              margin: '0 auto 1.25rem',
              padding: '10px',
              backgroundColor: '#ffffff',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--border)',
            }}
          >
            <QrCode size={140} color="#000000" />
          </div>

          <div
            style={{
              fontSize: '1.2rem',
              fontWeight: 800,
              color: 'var(--primary)',
              fontFamily: 'monospace',
            }}
          >
            {selectedCard?.username}
          </div>

          <div
            style={{ margin: '0.75rem 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}
          >
            <div>الباقة: {selectedCard?.profile?.displayName || selectedCard?.profile?.name}</div>
            <div>السعر: {selectedCard?.price} SDG</div>
            <div style={{ marginTop: '0.25rem' }}>
              {selectedCard && getStatusBadge(selectedCard.status)}
            </div>
          </div>

          <div
            style={{
              padding: '0.5rem',
              backgroundColor: 'var(--bg-app)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem',
              fontFamily: 'monospace',
              color: 'var(--text-muted)',
              wordBreak: 'break-all',
              direction: 'ltr',
            }}
          >
            http://login.hotspot/login?username={selectedCard?.username}
          </div>

          <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              className="btn btn-primary"
              onClick={handleExportSingleCardPdf}
              disabled={exportingSinglePdf}
            >
              <Download size={16} />
              {exportingSinglePdf ? 'جاري تجهيز PDF...' : 'تصدير كرت PDF'}
            </button>
            <button className="btn btn-secondary" onClick={() => setSelectedCard(null)}>
              إغلاق
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
