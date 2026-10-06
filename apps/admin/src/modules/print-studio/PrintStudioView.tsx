import React, { useState, useEffect } from 'react';
import { Printer, FileText, QrCode, LayoutGrid, Sliders, AlertCircle, RefreshCw } from 'lucide-react';
import { apiClient } from '../../core/api/api-client';
import { CardItem } from '../../core/types/view-models';

export const PrintStudioView: React.FC = () => {
  const [printFormat, setPrintFormat] = useState<'A4_GRID' | 'THERMAL_ROLL'>('A4_GRID');
  const [networkName, setNetworkName] = useState('');
  const [supportPhone, setSupportPhone] = useState('');
  const [cardsCount, setCardsCount] = useState(12);
  const [cards, setCards] = useState<CardItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [cardsRes, tenantRes] = await Promise.allSettled([
        apiClient.get<CardItem[]>('/cards', { status: 'AVAILABLE' }),
        apiClient.get<{ name?: string; contactPhone?: string }>('/tenants/current'),
      ]);

      if (cardsRes.status === 'fulfilled' && Array.isArray(cardsRes.value)) {
        setCards(cardsRes.value);
      } else {
        setCards([]);
      }

      if (tenantRes.status === 'fulfilled' && tenantRes.value) {
        if (tenantRes.value.name) setNetworkName(tenantRes.value.name);
        if (tenantRes.value.contactPhone) setSupportPhone(tenantRes.value.contactPhone);
      }
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handlePrint = () => {
    window.print();
  };

  // Slice available cards up to cardsCount
  const printableCards = cards.slice(0, cardsCount);

  return (
    <div>
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">
            <Printer color="var(--primary)" size={24} />
            استوديو طباعة كروت الهوتسبوت
          </h1>
          <p className="page-subtitle">
            تجهيز قوالب الطباعة لورق A4 أو الطابعات الحرارية مع رموز QR
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-outline" onClick={fetchData} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            تحديث الكروت
          </button>
          <button
            className="btn btn-primary"
            onClick={handlePrint}
            disabled={printableCards.length === 0}
          >
            <Printer size={16} />
            بدء الطباعة الآن ({printableCards.length} كرت)
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
            <label className="form-label">نوع ورق الطباعة</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className={`btn btn-sm ${printFormat === 'A4_GRID' ? 'btn-primary' : 'btn-outline'}`}
                style={{ flex: 1 }}
                onClick={() => setPrintFormat('A4_GRID')}
              >
                <LayoutGrid size={14} />
                ورق A4 (شبكة كروت)
              </button>
              <button
                type="button"
                className={`btn btn-sm ${printFormat === 'THERMAL_ROLL' ? 'btn-primary' : 'btn-outline'}`}
                style={{ flex: 1 }}
                onClick={() => setPrintFormat('THERMAL_ROLL')}
              >
                <FileText size={14} />
                طابعة حرارية (رول)
              </button>
            </div>
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
        ) : printFormat === 'A4_GRID' ? (
          /* 1. A4 Grid Format */
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
                  border: '2px dashed #0d9488',
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
                    color: '#0f766e',
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
                    backgroundColor: '#f8fafc',
                  }}
                >
                  <QrCode size={60} color="#000000" />
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
                      color: '#0d9488',
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
                  <span style={{ color: '#0f766e' }}>{card.price} YER</span>
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
                  <span>{card.price} YER</span>
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
                  <QrCode size={80} color="#000" />
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
