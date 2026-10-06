import React, { useState } from 'react';
import { Printer, FileText, QrCode, LayoutGrid, Sliders } from 'lucide-react';

export const PrintStudioView: React.FC = () => {
  const [printFormat, setPrintFormat] = useState<'A4_GRID' | 'THERMAL_ROLL'>('A4_GRID');
  const [networkName, setNetworkName] = useState('شبكة النجوم للإنترنت');
  const [supportPhone, setSupportPhone] = useState('777-123456');
  const [cardsCount, setCardsCount] = useState(12);

  // Generate mock preview cards based on count
  const previewCards = Array.from({ length: cardsCount }, (_, i) => ({
    serial: `SN-2610-${String(i + 1).padStart(4, '0')}`,
    username: `HS${Math.floor(100000 + Math.random() * 900000)}`,
    password: `${Math.floor(1000 + Math.random() * 9000)}`,
    profile: 'باقة 1 جيجا (يومي)',
    price: 500,
    validity: '24 ساعة',
  }));

  const handlePrint = () => {
    window.print();
  };

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

        <button className="btn btn-primary" onClick={handlePrint}>
          <Printer size={16} />
          بدء الطباعة الآن
        </button>
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
          <Sliders size={16} color="var(--primary)" />
          خيارات وإعدادات نموذج الطباعة
        </h3>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1rem',
          }}
        >
          <div className="form-group">
            <label className="form-label" htmlFor="print-format">
              صيغة الطباعة
            </label>
            <select
              id="print-format"
              className="select"
              value={printFormat}
              onChange={(e) => setPrintFormat(e.target.value as 'A4_GRID' | 'THERMAL_ROLL')}
            >
              <option value="A4_GRID">شبكة ورق A4 مقسمة</option>
              <option value="THERMAL_ROLL">بكرات طابعة فواتير حرارية</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="net-name">
              اسم الشبكة التجاري
            </label>
            <input
              id="net-name"
              className="input"
              value={networkName}
              onChange={(e) => setNetworkName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="support-phone">
              هاتف الدعم والاستفسار
            </label>
            <input
              id="support-phone"
              className="input"
              style={{ direction: 'ltr', textAlign: 'left' }}
              value={supportPhone}
              onChange={(e) => setSupportPhone(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="cards-count">
              عدد الكروت المعاينة
            </label>
            <select
              id="cards-count"
              className="select"
              value={cardsCount}
              onChange={(e) => setCardsCount(Number(e.target.value))}
            >
              <option value={6}>6 كروت</option>
              <option value={9}>9 كروت (صفحة A4 كاملة)</option>
              <option value={12}>12 كرت</option>
              <option value={24}>24 كرت</option>
            </select>
          </div>
        </div>
      </div>

      {/* Print Preview Canvas */}
      <div
        className="card"
        style={{
          padding: '2rem 1.5rem',
          minHeight: '500px',
          backgroundColor: 'var(--bg-card-alt)',
        }}
      >
        <div
          className="no-print"
          style={{
            marginBottom: '1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'var(--text-secondary)',
              fontSize: '0.875rem',
            }}
          >
            {printFormat === 'A4_GRID' ? <LayoutGrid size={18} /> : <FileText size={18} />}
            <span>معاينة حية دقيقة لما سيظهر على الورق المطبوع</span>
          </div>
          <span className="badge badge-info">جاهز للطباعة المباشرة</span>
        </div>

        {/* 1. A4 Grid Format */}
        {printFormat === 'A4_GRID' ? (
          <div
            className="a4-print-sheet"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '14px',
              maxWidth: '850px',
              margin: '0 auto',
            }}
          >
            {previewCards.map((card, idx) => (
              <div
                key={idx}
                className="a4-card-item"
                style={{
                  backgroundColor: '#ffffff',
                  color: '#0f172a',
                  borderRadius: '8px',
                  padding: '12px',
                  border: '1.5px dashed #cbd5e1',
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
                  {networkName}
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
                  {card.password && (
                    <div
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: '#ef4444',
                        fontFamily: 'monospace',
                      }}
                    >
                      الرمز: {card.password}
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
                  <span>{card.profile}</span>
                  <span style={{ color: '#0f766e' }}>{card.price} YER</span>
                </div>

                <div style={{ fontSize: '0.58rem', color: '#94a3b8', marginTop: '6px' }}>
                  تسلسلي: {card.serial} | هاتف: {supportPhone}
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
            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{networkName}</div>
            <div style={{ fontSize: '10px' }}>إيصال شحن رصيد هوتسبوت</div>
            <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4px 0' }}>
              <span>الباقة:</span>
              <span>باقة 1 جيجا (يومي)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4px 0' }}>
              <span>السعر:</span>
              <span>500 YER</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4px 0' }}>
              <span>التاريخ:</span>
              <span>{new Date().toLocaleDateString('ar-YE')}</span>
            </div>

            <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }} />

            <div style={{ backgroundColor: '#eee', padding: '8px', margin: '6px 0' }}>
              <div style={{ fontSize: '10px' }}>اسم المستخدم:</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', letterSpacing: '1px' }}>
                HS892415
              </div>
              <div style={{ fontSize: '12px', fontWeight: 'bold', marginTop: '2px' }}>
                الرمز: 4892
              </div>
            </div>

            <div
              style={{
                margin: '10px auto',
                width: '100px',
                height: '100px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <QrCode size={90} color="#000000" />
            </div>
            <div style={{ fontSize: '9px', marginBottom: '8px' }}>
              امسح الرمز لتسجيل الدخول التلقائي
            </div>

            <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }} />
            <div style={{ fontSize: '9px' }}>خدمة العملاء: {supportPhone}</div>
            <div style={{ fontSize: '9px', marginTop: '2px' }}>شكراً لاختياركم شبكتنا!</div>
          </div>
        )}
      </div>
    </div>
  );
};
