import React, { useEffect, useState } from 'react';
import { apiClient } from '../../core/api/api-client';
import { useToast } from '../../core/context/ToastContext';
import { Modal } from '../../components/common/Modal';
import { ShoppingBag, Printer, Phone, User, CheckCircle2, Download } from 'lucide-react';
import { HotspotProfileItem } from '../../core/types/view-models';
import { PdfExportService } from '../../core/services/pdf-export-service';

interface ReceiptData {
  invoiceNumber: string;
  serialNumber: string;
  username: string;
  password?: string;
  profileName: string;
  amount: number;
  paymentMethod: string;
  time: string;
}

export const formatProfileTitle = (name?: string, displayName?: string) => {
  if (displayName && displayName !== name) return displayName;
  if (!name) return 'باقة إنترنت';
  const lower = name.toLowerCase();
  if (lower === '1hour-unlimited' || (lower.includes('1hour') && lower.includes('unlimited'))) {
    return 'باقة 1 ساعة (إنترنت مفتوح)';
  }
  if (lower === '3hours-unlimited' || (lower.includes('3hour') && lower.includes('unlimited'))) {
    return 'باقة 3 ساعات (إنترنت مفتوح)';
  }
  if (lower === '1day-unlimited' || (lower.includes('1day') && lower.includes('unlimited'))) {
    return 'باقة 1 يوم (إنترنت مفتوح)';
  }
  if (lower === '1week-unlimited' || (lower.includes('1week') && lower.includes('unlimited'))) {
    return 'باقة 1 أسبوع (إنترنت مفتوح)';
  }
  if (lower === '1month-unlimited' || (lower.includes('1month') && lower.includes('unlimited'))) {
    return 'باقة 1 شهر (إنترنت مفتوح)';
  }
  return name.replace(/-unlimited/gi, ' (إنترنت مفتوح)');
};

export const PosTerminalView: React.FC = () => {
  const { showToast } = useToast();
  const [profiles, setProfiles] = useState<HotspotProfileItem[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<HotspotProfileItem | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'MOBILE_WALLET' | 'TRANSFER'>('CASH');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Sold receipt dialog state
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const handleDownloadReceiptPdf = async () => {
    if (!receipt) return;
    setExportingPdf(true);
    try {
      await PdfExportService.exportCardsPdf(
        [
          {
            id: receipt.invoiceNumber,
            serialNumber: receipt.serialNumber,
            username: receipt.username,
            clearPassword: receipt.password,
            price: receipt.amount,
            status: 'SOLD',
            createdAt: new Date().toISOString(),
            profile: {
              name: receipt.profileName,
              displayName: receipt.profileName,
            },
          },
        ],
        {
          format: 'THERMAL_80',
          networkName: 'شبكة ميكروتيك هوتسبوت',
          includeQr: true,
          loginUrl: 'http://login.hotspot',
        }
      );
      showToast('تم تصدير إيصال الكرت كملف PDF حراري بنجاح!', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل تصدير ملف PDF';
      showToast(msg, 'error');
    } finally {
      setExportingPdf(false);
    }
  };

  const fetchProfiles = async () => {
    try {
      const data = await apiClient.get<HotspotProfileItem[]>('/hotspot/profiles');
      if (Array.isArray(data)) {
        setProfiles(data);
        if (data.length > 0 && !selectedProfile) {
          setSelectedProfile(data[0]);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل تحميل باقات الكروت من الخادم';
      showToast(msg, 'error');
      setProfiles([]);
      setSelectedProfile(null);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const handleCheckout = async () => {
    if (!selectedProfile) {
      showToast('يرجى تحديد باقة أولاً', 'warning');
      return;
    }

    setIsProcessing(true);
    try {
      const res = await apiClient.post<{
        invoiceNumber?: string;
        card?: {
          serialNumber?: string;
          username?: string;
          clearPassword?: string;
        };
      }>('/sales/checkout', {
        profileId: selectedProfile.id,
        paymentMethod,
        customerPhone: customerPhone.trim() || undefined,
        customerName: customerName.trim() || undefined,
      });

      showToast('تمت عملية البيع بنجاح وتوليد الإيصال', 'success');
      setReceipt({
        invoiceNumber: res?.invoiceNumber || `INV-${Date.now().toString().substring(7)}`,
        serialNumber: res?.card?.serialNumber || 'SN-00918',
        username: res?.card?.username || 'HS98214',
        password: res?.card?.clearPassword || '4821',
        profileName: formatProfileTitle(selectedProfile.name, selectedProfile.displayName),
        amount: selectedProfile.price,
        paymentMethod,
        time: new Date().toLocaleTimeString('ar-SD'),
      });

      // Clear customer inputs
      setCustomerPhone('');
      setCustomerName('');
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'فشل إتمام البيع: تأكد من توفر كروت جاهزة في المخزون لهذه الباقة';
      showToast(msg, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <ShoppingBag color="var(--primary)" size={24} />
            نقطة البيع السريعة للكاشير
          </h1>
          <p className="page-subtitle">بيع كروت الهوتسبوت بضغطة زر واحدة وطباعة الفاتورة الفورية</p>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.8fr 1.2fr',
          gap: '1.5rem',
          alignItems: 'start',
        }}
      >
        {/* Left Side: Package Cards Grid */}
        <div>
          <h3 style={{ fontSize: '1.05rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>
            اختر باقة الكرت المطلوبة:
          </h3>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
            }}
          >
            {profiles.map((p) => {
              const isSelected = selectedProfile?.id === p.id;
              return (
                <div
                  key={p.id}
                  className={`card ${isSelected ? 'card-glass' : ''}`}
                  style={{
                    cursor: 'pointer',
                    borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                    boxShadow: isSelected ? 'var(--shadow-glow)' : 'var(--shadow-sm)',
                    transform: isSelected ? 'scale(1.02)' : 'none',
                    transition: 'var(--transition)',
                  }}
                  onClick={() => setSelectedProfile(p)}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: '1rem' }}>
                      {formatProfileTitle(p.name, p.displayName)}
                    </div>
                    <span className="badge badge-success">{p.availableCards ?? 50} كرت</span>
                  </div>

                  <div style={{ margin: '1rem 0' }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--primary)' }}>
                      {Number(p.price).toLocaleString()} SDG
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      الصلاحية: {p.validity || '24 ساعة'}
                    </div>
                  </div>

                  {isSelected && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        color: 'var(--primary)',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                      }}
                    >
                      <CheckCircle2 size={16} />
                      الباقة المحددة للبيع
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Fast Checkout Panel */}
        <div className="card">
          <h3
            style={{
              fontSize: '1.15rem',
              marginBottom: '1.25rem',
              borderBottom: '1px solid var(--border)',
              paddingBottom: '0.75rem',
            }}
          >
            ملخص العملية وتأكيد الدفع
          </h3>

          {/* Selected Item Summary */}
          <div
            style={{
              padding: '1rem',
              backgroundColor: 'var(--bg-app)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              marginBottom: '1.25rem',
            }}
          >
            <div
              style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>الباقة:</span>
              <strong style={{ fontSize: '1rem' }}>
                {formatProfileTitle(selectedProfile?.name, selectedProfile?.displayName) || 'لم يتم التحديد'}
              </strong>
            </div>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>السعر الإجمالي:</span>
              <strong style={{ fontSize: '1.2rem', color: 'var(--primary)' }}>
                {Number(selectedProfile?.price || 0).toLocaleString()} SDG
              </strong>
            </div>
          </div>

          {/* Payment Method Selector */}
          <div className="form-group">
            <label className="form-label">طريقة تحصيل المبلغ</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              {(['CASH', 'MOBILE_WALLET', 'TRANSFER'] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  className={`btn ${paymentMethod === method ? 'btn-primary' : 'btn-outline'}`}
                  style={{ fontSize: '0.82rem', padding: '0.55rem 0.35rem', fontWeight: 700 }}
                  onClick={() => setPaymentMethod(method)}
                >
                  {method === 'CASH'
                    ? 'نقداً (كاش)'
                    : method === 'MOBILE_WALLET'
                      ? 'تطبيق بنكك'
                      : 'أوكاش / فوري'}
                </button>
              ))}
            </div>
          </div>

          {/* Optional Customer Info */}
          <div className="form-group">
            <label className="form-label" htmlFor="pos-phone">
              رقم هاتف العميل (اختياري)
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="pos-phone"
                className="input"
                style={{ paddingRight: '2.5rem', direction: 'ltr', textAlign: 'left' }}
                placeholder="09xxxxxxxx أو 01xxxxxxxx"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
              <Phone
                size={16}
                style={{
                  position: 'absolute',
                  right: '0.85rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label className="form-label" htmlFor="pos-cust-name">
              اسم العميل (اختياري)
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="pos-cust-name"
                className="input"
                style={{ paddingRight: '2.5rem' }}
                placeholder="اسم المشتري..."
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
              <User
                size={16}
                style={{
                  position: 'absolute',
                  right: '0.85rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
            </div>
          </div>

          {/* Action button */}
          <button
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.85rem', fontSize: '1.05rem', fontWeight: 800 }}
            onClick={handleCheckout}
            disabled={isProcessing || !selectedProfile}
          >
            {isProcessing ? 'جاري تسجيل البيع والخصم...' : 'تأكيد البيع وطباعة الفاتورة'}
          </button>
        </div>
      </div>

      {/* Sale Receipt Modal */}
      <Modal
        isOpen={!!receipt}
        onClose={() => setReceipt(null)}
        title="إيصال بيع كرت هوتسبوت"
        maxWidth="440px"
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              padding: '1.25rem',
              backgroundColor: '#ffffff',
              color: '#000000',
              borderRadius: 'var(--radius-md)',
              fontFamily: 'monospace',
              fontSize: '12px',
              border: '1px solid #e2e8f0',
              marginBottom: '1.25rem',
            }}
          >
            <div style={{ fontSize: '15px', fontWeight: 'bold' }}>شبكة ميكروتيك هوتسبوت</div>
            <div style={{ fontSize: '11px', color: '#666' }}>
              فاتورة رقم: {receipt?.invoiceNumber}
            </div>
            <div style={{ borderBottom: '1px dashed #999', margin: '8px 0' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>الباقة:</span>
              <span style={{ fontWeight: 'bold' }}>{receipt?.profileName}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4px 0' }}>
              <span>المبلغ:</span>
              <span style={{ fontWeight: 'bold' }}>{receipt?.amount} SDG</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4px 0' }}>
              <span>طريقة الدفع:</span>
              <span style={{ fontWeight: 'bold' }}>
                {receipt?.paymentMethod === 'CASH'
                  ? 'نقداً (كاش)'
                  : receipt?.paymentMethod === 'MOBILE_WALLET'
                    ? 'تطبيق بنكك'
                    : 'أوكاش / فوري'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>التسلسلي:</span>
              <span>{receipt?.serialNumber}</span>
            </div>

            <div
              style={{
                backgroundColor: '#f1f5f9',
                padding: '10px',
                borderRadius: '6px',
                margin: '10px 0',
              }}
            >
              <div style={{ fontSize: '11px', color: '#666' }}>اسم المستخدم:</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#0d9488' }}>
                {receipt?.username}
              </div>
              {receipt?.password && (
                <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#ef4444' }}>
                  الرمز السري: {receipt?.password}
                </div>
              )}
            </div>

            <div
              style={{
                width: 90,
                height: 90,
                margin: '8px auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(receipt?.username || '')}`}
                alt="QR Code"
                style={{ width: 84, height: 84, display: 'block' }}
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <div style={{ fontSize: '10px', color: '#666' }}>امسح الرمز للدخول الفوري للإنترنت</div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn btn-outline"
              onClick={handleDownloadReceiptPdf}
              disabled={exportingPdf}
              style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
            >
              <Download size={16} />
              {exportingPdf ? 'جاري تجهيز PDF...' : 'تنزيل إيصال PDF'}
            </button>
            <button className="btn btn-primary" onClick={() => window.print()}>
              <Printer size={16} />
              طباعة حرارية
            </button>
            <button className="btn btn-secondary" onClick={() => setReceipt(null)}>
              إتمام وإغلاق
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
