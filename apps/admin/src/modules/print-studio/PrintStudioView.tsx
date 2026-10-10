import React, { useState, useEffect } from 'react';
import { Printer, FileText, LayoutGrid, Sliders, AlertCircle, RefreshCw, Download, Palette, Loader2 } from 'lucide-react';
import { apiClient } from '../../core/api/api-client';
import { CardItem } from '../../core/types/view-models';
import { PdfExportService, CARD_THEMES } from '../../core/services/pdf-export-service';

interface BatchOption {
  id: string;
  batchNumber: string;
  totalCards: number;
  price: number;
  profileName?: string;
}

export const PrintStudioView: React.FC = () => {
  const [printFormat, setPrintFormat] = useState<'A4_GRID_100' | 'A4_GRID' | 'THERMAL_ROLL'>('A4_GRID_100');
  const [selectedTheme, setSelectedTheme] = useState<string>('FOOTBALL');
  const [networkName, setNetworkName] = useState('سودافاي | SudaFi Net');
  const [supportPhone, setSupportPhone] = useState('');
  const [cardsCount, setCardsCount] = useState(100);
  const [cards, setCards] = useState<CardItem[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [fetchingCards, setFetchingCards] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null);

  // Fetch only cards when batch filter changes (fast targeted query)
  const fetchCardsForBatch = async (batchId: string) => {
    setFetchingCards(true);
    try {
      const cardsQuery: Record<string, string | number> = { limit: 200 };
      if (batchId !== 'ALL') {
        cardsQuery.batchId = batchId;
      } else {
        cardsQuery.status = 'AVAILABLE';
      }
      const val = await apiClient.get<CardItem[] | { data: CardItem[]; total: number }>('/cards', cardsQuery);
      const cardList = Array.isArray(val)
        ? val
        : val && typeof val === 'object' && 'data' in val && Array.isArray((val as { data: CardItem[] }).data)
        ? (val as { data: CardItem[] }).data
        : [];
      setCards(cardList);
    } catch {
      // Retain existing cards on error
    } finally {
      setFetchingCards(false);
    }
  };

  // Initial full load on mount
  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const cardsQuery: Record<string, string | number> = {
        limit: 200,
        status: 'AVAILABLE',
      };

      const [cardsRes, tenantRes, batchesRes] = await Promise.allSettled([
        apiClient.get<CardItem[] | { data: CardItem[]; total: number }>('/cards', cardsQuery),
        apiClient.get<{ name?: string; contactPhone?: string; phone?: string }>('/tenants/current'),
        apiClient.get<BatchOption[]>('/cards/batches'),
      ]);

      if (cardsRes.status === 'fulfilled' && cardsRes.value) {
        const val = cardsRes.value;
        const cardList = Array.isArray(val)
          ? val
          : val && typeof val === 'object' && 'data' in val && Array.isArray((val as { data: CardItem[] }).data)
          ? (val as { data: CardItem[] }).data
          : [];
        setCards(cardList);
      } else {
        setCards([]);
      }

      if (tenantRes.status === 'fulfilled' && tenantRes.value) {
        if (tenantRes.value.name) setNetworkName(tenantRes.value.name);
        const phone = tenantRes.value.contactPhone || tenantRes.value.phone;
        if (phone) setSupportPhone(phone);
      }

      if (batchesRes.status === 'fulfilled' && Array.isArray(batchesRes.value)) {
        setBatches(batchesRes.value);
      }
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  const handleBatchChange = (batchId: string) => {
    setSelectedBatchId(batchId);
    fetchCardsForBatch(batchId);
  };

  const handlePrint = () => {
    window.print();
  };

  // Current active design theme
  const currentTheme = CARD_THEMES[selectedTheme] || CARD_THEMES.FOOTBALL;

  // Slice available cards up to cardsCount
  const printableCards = cards.slice(0, cardsCount);

  const handleDownloadPdf = async () => {
    if (printableCards.length === 0 || isExporting) return;

    setIsExporting(true);
    setExportProgress(null);

    try {
      const selectedBatch = batches.find((b) => b.id === selectedBatchId);
      await PdfExportService.exportCardsPdf(printableCards, {
        format: printFormat,
        themePreset: selectedTheme,
        networkName: networkName.trim() || 'سودافاي | SudaFi Net',
        supportPhone: supportPhone.trim() || undefined,
        batchNumber: selectedBatch ? selectedBatch.batchNumber : undefined,
        onProgress: (current, total) => setExportProgress({ current, total }),
      });
    } catch (err) {
      console.error('Failed to export cards PDF:', err);
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  };

  return (
    <div>
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">
            <Printer color="var(--primary)" size={24} />
            استوديو طباعة وتصدير كروت الهوتسبوت (A4 PDF)
          </h1>
          <p className="page-subtitle">
            تجهيز وتنزيل كروت الهوتسبوت كملف PDF عالي الدقة بمقاس A4 لطباعتها في مراكز الطباعة والمكتبات
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={() => fetchInitialData()} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            تحديث
          </button>
          <button
            className="btn btn-primary"
            style={{ backgroundColor: '#0d9488', borderColor: '#0d9488' }}
            onClick={handleDownloadPdf}
            disabled={printableCards.length === 0 || isExporting}
          >
            {isExporting ? (
              <>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                جاري تجهيز الـ PDF ({exportProgress ? `${exportProgress.current}/${exportProgress.total}` : 'يرجى الانتظار...'})
              </>
            ) : (
              <>
                <Download size={16} />
                تنزيل ملف PDF لمركز الطباعة ({printableCards.length} كرت)
              </>
            )}
          </button>
          <button
            className="btn btn-outline"
            onClick={handlePrint}
            disabled={printableCards.length === 0 || isExporting}
          >
            <Printer size={16} />
            معاينة وطباعة المتصفح
          </button>
        </div>
      </div>

      {/* Configuration Controls (Hidden when printing) */}
      <div className="card no-print" style={{ marginBottom: '1.5rem' }}>
        <h3
          style={{
            fontSize: '1rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Sliders size={18} color="var(--primary)" />
          خيارات التنسيق والطباعة
        </h3>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1rem',
          }}
        >
          <div className="form-group">
            <label className="form-label">نوع ورق وقالب الطباعة</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn btn-sm ${printFormat === 'A4_GRID_100' ? 'btn-primary' : 'btn-outline'}`}
                style={{ flex: 1, minWidth: '130px' }}
                onClick={() => {
                  setPrintFormat('A4_GRID_100');
                  setCardsCount(100);
                }}
              >
                <LayoutGrid size={14} />
                A4 (100 كرت / 5×20)
              </button>
              <button
                type="button"
                className={`btn btn-sm ${printFormat === 'A4_GRID' ? 'btn-primary' : 'btn-outline'}`}
                style={{ flex: 1, minWidth: '130px' }}
                onClick={() => {
                  setPrintFormat('A4_GRID');
                  setCardsCount(12);
                }}
              >
                <LayoutGrid size={14} />
                A4 قياسي (12 كرت / 3×4)
              </button>
              <button
                type="button"
                className={`btn btn-sm ${printFormat === 'THERMAL_ROLL' ? 'btn-primary' : 'btn-outline'}`}
                style={{ flex: 1, minWidth: '130px' }}
                onClick={() => setPrintFormat('THERMAL_ROLL')}
              >
                <FileText size={14} />
                حراري (رول 58/80mm)
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Palette size={14} color="var(--primary)" />
              تصميم وثيم الكرت المختار
            </label>
            <select
              className="input"
              value={selectedTheme}
              onChange={(e) => setSelectedTheme(e.target.value)}
            >
              {Object.values(CARD_THEMES).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">اسم الشبكة المطبوع</label>
            <input
              type="text"
              className="input"
              value={networkName}
              onChange={(e) => setNetworkName(e.target.value)}
              placeholder="اسم شبكة الواي فاي"
            />
          </div>

          <div className="form-group">
            <label className="form-label">رقم هاتف الدعم الفني</label>
            <input
              type="text"
              className="input"
              value={supportPhone}
              onChange={(e) => setSupportPhone(e.target.value)}
              placeholder="77x-xxxxxx"
            />
          </div>

          <div className="form-group">
            <label className="form-label">تصفية حسب الدفعة</label>
            <select
              className="input"
              value={selectedBatchId}
              onChange={(e) => handleBatchChange(e.target.value)}
            >
              <option value="ALL">جميع الكروت المتاحة حالياً</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batchNumber} ({b.totalCards} كرت - {b.price} SDG)
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">أقصى عدد كروت للطباعة (المتاح: {cards.length})</label>
            <select
              className="input"
              value={cardsCount}
              onChange={(e) => setCardsCount(Number(e.target.value))}
            >
              <option value={6}>6 كروت</option>
              <option value={12}>12 كرت (صفحة A4 كاملة)</option>
              <option value={24}>24 كرت (صفحتين)</option>
              <option value={50}>50 كرت</option>
              <option value={100}>100 كرت</option>
              <option value={200}>200 كرت</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Print Preview Area */}
      <div
        style={{
          backgroundColor: 'var(--surface)',
          padding: '2rem',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          overflowX: 'auto',
          opacity: fetchingCards ? 0.6 : 1,
          transition: 'opacity 0.2s ease',
        }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            جاري فحص الكروت الجاهزة للطباعة من قاعدة البيانات...
          </div>
        ) : printableCards.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '3rem 1.5rem',
              color: 'var(--text-secondary)',
            }}
          >
            <AlertCircle size={48} color="var(--primary)" style={{ marginBottom: '1rem', opacity: 0.8 }} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              لا توجد كروت متاحة للطباعة حالياً
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: '400px', margin: '0 auto' }}>
              جميع الكروت في النظام إما مباعة أو لم يتم توليدها بعد. يمكنك الانتقال إلى قسم «الكروت» وتوليد دفعة جديدة لتظهر هنا فوراً.
            </p>
          </div>
        ) : printFormat === 'A4_GRID_100' ? (
          /* 1. A4 Dense Grid Format (5 columns x 20 rows = 100 cards per page) */
          <div className="a4-print-sheet-100">
            {printableCards.map((card, idx) => (
              <div key={card.id || idx} className="a4-card-item-mini">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '0.5px solid #cbd5e1',
                    paddingBottom: '1px',
                    fontWeight: 700,
                  }}
                >
                  <span style={{ color: '#0f766e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
                    {card.profile?.displayName || 'باقة إنترنت'}
                  </span>
                  <span style={{ color: '#b45309' }}>{card.price} SDG</span>
                </div>

                <div style={{ textAlign: 'center', margin: '2px 0' }}>
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontWeight: 800,
                      fontSize: '0.8rem',
                      letterSpacing: '1px',
                      color: '#0f172a',
                    }}
                  >
                    {card.username}
                  </div>
                  {card.clearPassword && card.clearPassword !== card.username && (
                    <div style={{ fontSize: '0.62rem', color: '#475569', fontWeight: 600 }}>
                      PIN: {card.clearPassword}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.55rem',
                    color: '#64748b',
                    borderTop: '0.5px dotted #e2e8f0',
                    paddingTop: '1px',
                  }}
                >
                  <span>{networkName || 'SudaFi'}</span>
                  <span>{card.serialNumber ? `#${card.serialNumber.slice(-5)}` : `#${idx + 1}`}</span>
                </div>
              </div>
            ))}
          </div>
        ) : printFormat === 'A4_GRID' ? (
          /* 2. A4 Standard Grid Format (3x4 = 12 cards) */
          <div
            className="a4-print-sheet"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
              maxWidth: '800px',
              margin: '0 auto',
              backgroundColor: '#ffffff',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            }}
          >
            {printableCards.map((card) => (
              <div
                key={card.id}
                className="card-ticket"
                style={{
                  border: `2px dashed ${currentTheme.primaryColor}`,
                  borderRadius: '8px',
                  padding: '12px',
                  backgroundColor: '#ffffff',
                  color: '#1e293b',
                  textAlign: 'center',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                  pageBreakInside: 'avoid',
                }}
              >
                <div
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    color: currentTheme.primaryColor,
                    marginBottom: '2px',
                  }}
                >
                  {networkName || 'شبكة الواي فاي'}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#64748b', marginBottom: '8px' }}>
                  كارت إنترنت هوتسبوت
                </div>

                <div
                  style={{
                    width: 72,
                    height: 72,
                    margin: '0 auto 8px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#ffffff',
                    overflow: 'hidden',
                  }}
                >
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(card.username)}`}
                    alt="QR Code"
                    style={{ width: 66, height: 66, display: 'block' }}
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>

                <div
                  style={{
                    backgroundColor: '#f1f5f9',
                    padding: '6px',
                    borderRadius: '4px',
                    marginBottom: '6px',
                  }}
                >
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>اسم المستخدم / الكود</div>
                  <div
                    style={{
                      fontSize: '1rem',
                      fontWeight: 900,
                      color: currentTheme.primaryColor,
                      fontFamily: 'monospace',
                    }}
                  >
                    {card.username}
                  </div>
                  {card.clearPassword && (
                    <div
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: '#ef4444',
                        fontFamily: 'monospace',
                      }}
                    >
                      الرمز: {card.clearPassword}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    color: '#334155',
                  }}
                >
                  <span>{card.profile?.displayName || 'باقة إنترنت'}</span>
                  <span style={{ color: currentTheme.accentColor, fontWeight: 800 }}>{card.price} SDG</span>
                </div>

                <div style={{ fontSize: '0.58rem', color: '#94a3b8', marginTop: '6px' }}>
                  تسلسلي: {card.serialNumber} {supportPhone ? `| هاتف: ${supportPhone}` : ''}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* 2. Thermal Roll Format (58mm/80mm) */
          <div
            className="thermal-receipt-print"
            style={{
              width: '280px',
              margin: '0 auto',
              backgroundColor: '#ffffff',
              color: '#000000',
              padding: '16px',
              borderRadius: '6px',
              border: '1px solid #ccc',
              fontFamily: 'monospace',
              fontSize: '11px',
              textAlign: 'center',
            }}
          >
            {printableCards.slice(0, 1).map((card) => (
              <div key={card.id}>
                <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{networkName || 'شبكة الواي فاي'}</div>
                <div style={{ fontSize: '10px' }}>إيصال شحن رصيد هوتسبوت</div>
                <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4px 0' }}>
                  <span>الباقة:</span>
                  <span>{card.profile?.displayName || 'باقة إنترنت'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4px 0' }}>
                  <span>السعر:</span>
                  <span>{card.price} SDG</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4px 0' }}>
                  <span>الرقم التسلسلي:</span>
                  <span>{card.serialNumber}</span>
                </div>

                <div style={{ margin: '12px 0' }}>
                  <div style={{ fontSize: '9px', color: '#555' }}>بيانات الدخول:</div>
                  <div
                    style={{
                      fontSize: '16px',
                      fontWeight: 'bold',
                      letterSpacing: '2px',
                      border: '1px solid #000',
                      padding: '4px',
                      margin: '4px 0',
                    }}
                  >
                    {card.username}
                  </div>
                  {card.clearPassword && (
                    <div style={{ fontSize: '12px', fontWeight: 'bold' }}>الرمز: {card.clearPassword}</div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(card.username)}`}
                    alt="QR Code"
                    style={{ width: 80, height: 80, display: 'block' }}
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>

                <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }} />
                {supportPhone && <div style={{ fontSize: '9px' }}>خدمة العملاء: {supportPhone}</div>}
                <div style={{ fontSize: '9px', marginTop: '4px' }}>نتمنى لكم تصفحاً ممتعاً وسريعاً</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
