import React, { useEffect, useState } from 'react';
import { apiClient } from '../../core/api/api-client';
import { useToast } from '../../core/context/ToastContext';
import { BarChart3, Download, FileSpreadsheet, RefreshCw, Calendar } from 'lucide-react';
import { ShiftSummaryData } from '../../core/types/view-models';

export const ReportsView: React.FC = () => {
  const { showToast } = useToast();
  const [shiftSummary, setShiftSummary] = useState<ShiftSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const fetchShift = async (isManual = false) => {
    setLoading(true);
    try {
      const data = await apiClient.get<ShiftSummaryData>('/sales/shift-summary');
      setShiftSummary(data);
      if (isManual) {
        showToast('تم تحديث ومزامنة تقرير الوردية من الخادم بنجاح', 'success');
      }
    } catch {
      setShiftSummary({
        totalRevenue: 0,
        totalSalesCount: 0,
        currency: 'SDG',
        profileBreakdown: [],
      });
      if (isManual) {
        showToast('تعذر الاتصال بالخادم لتحديث تقرير الوردية', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShift(false);
  }, []);

  const downloadCsv = async (endpoint: string, filename: string) => {
    setDownloading(true);
    try {
      const csvText = await apiClient.get<string>(endpoint);
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('تم تصدير ملف الإكسل (CSV) المتوافق مع اللغة العربية بنجاح!', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل تحميل ملف التقرير';
      showToast(msg, 'error');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <BarChart3 color="var(--primary)" size={24} />
            التقارير المالية وتصدير البيانات
          </h1>
          <p className="page-subtitle">
            تصدير تقارير المبيعات، جرد المخزون، وملخصات الورديات المتوافقة مع اللغة العربية
          </p>
        </div>

        <button className="btn btn-outline" onClick={() => fetchShift(true)} disabled={loading}>
          <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          {loading ? 'جاري التحديث...' : 'تحديث التقرير'}
        </button>
      </div>

      {/* Export Action Cards Grid */}
      <div className="grid-cols-2" style={{ gap: '1.25rem', marginBottom: '1.5rem' }}>
        {/* Sales Export Card */}
        <div className="card">
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--primary-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary)',
              }}
            >
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem' }}>تصدير فواتير المبيعات الشاملة</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                ملف Excel/CSV بترميز UTF-8 BOM يدعم اللغة العربية لجميع العمليات
              </p>
            </div>
          </div>

          <p
            style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}
          >
            يتضمن: رقم الفاتورة، الرقم التسلسلي للكرت، المبلغ، العملة، طريقة الدفع، اسم العميل
            وهاتفه، والكاشير المنفذ.
          </p>

          <button
            className="btn btn-primary"
            onClick={() => downloadCsv('/reports/sales/csv', `sales_report_${Date.now()}.csv`)}
            disabled={downloading}
          >
            <Download size={16} />
            تصدير تقرير المبيعات
          </button>
        </div>

        {/* Cards Inventory Export Card */}
        <div className="card">
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--warning-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)',
              }}
            >
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem' }}>تصدير جرد كروت الهوتسبوت</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                سجل كامل بجميع الكروت الجاهزة والمباعة والنشطة والمعطلة
              </p>
            </div>
          </div>

          <p
            style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}
          >
            يتضمن: الأرقام التسلسلية، أسماء المستخدمين، الباقات، الأسعار، الحالات التشغيلية، والدفعة
            التابع لها الكرت.
          </p>

          <button
            className="btn btn-secondary"
            onClick={() => downloadCsv('/reports/cards/csv', `cards_inventory_${Date.now()}.csv`)}
            disabled={downloading}
          >
            <Download size={16} />
            تصدير كشف جرد الكروت
          </button>
        </div>
      </div>

      {/* Shift Summary Breakdown Card */}
      <div className="card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.25rem',
          }}
        >
          <div>
            <h3 style={{ fontSize: '1.15rem' }}>تقرير وردية الكاشير الحالية</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              ملخص المقبوضات النقدية ومبيعات الباقات خلال هذه الوردية
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'var(--text-secondary)',
              fontSize: '0.85rem',
            }}
          >
            <Calendar size={16} />
            <span>اليوم: {new Date().toLocaleDateString('ar-SD')}</span>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          <div
            style={{
              padding: '1rem',
              backgroundColor: 'var(--bg-app)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              إجمالي المبالغ في الصندوق
            </div>
            <div
              style={{
                fontSize: '1.6rem',
                fontWeight: 900,
                color: 'var(--primary)',
                marginTop: '0.25rem',
              }}
            >
              {Number(shiftSummary?.totalRevenue || 0).toLocaleString()}{' '}
              {shiftSummary?.currency || 'SDG'}
            </div>
          </div>

          <div
            style={{
              padding: '1rem',
              backgroundColor: 'var(--bg-app)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              إجمالي عدد الكروت المباعة
            </div>
            <div
              style={{
                fontSize: '1.6rem',
                fontWeight: 900,
                color: 'var(--accent)',
                marginTop: '0.25rem',
              }}
            >
              {shiftSummary?.totalSalesCount ?? shiftSummary?.totalTransactions ?? 0} كرت
            </div>
          </div>
        </div>

        <h4
          style={{ fontSize: '0.95rem', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}
        >
          تفصيل المبيعات حسب باقات الهوتسبوت:
        </h4>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>اسم الباقة</th>
                <th>عدد الكروت المباعة</th>
                <th>إجمالي المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {(shiftSummary?.profileBreakdown || []).map((p, idx) => (
                <tr key={idx}>
                  <td style={{ fontWeight: 700 }}>{p.profileName}</td>
                  <td>{p.count} كرت</td>
                  <td style={{ fontWeight: 800, color: 'var(--primary)' }}>
                    {Number(p.totalAmount ?? p.total ?? 0).toLocaleString()} {shiftSummary?.currency || 'SDG'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
