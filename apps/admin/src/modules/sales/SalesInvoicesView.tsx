import React, { useEffect, useState } from 'react';
import { apiClient } from '../../core/api/api-client';
import { useToast } from '../../core/context/ToastContext';
import { Modal } from '../../components/common/Modal';
import { Receipt, Search, RefreshCw, RotateCcw, AlertTriangle } from 'lucide-react';
import { SaleTransactionItem } from '../../core/types/view-models';

export const SalesInvoicesView: React.FC = () => {
  const { showToast } = useToast();
  const [sales, setSales] = useState<SaleTransactionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Refund modal state
  const [selectedTx, setSelectedTx] = useState<SaleTransactionItem | null>(null);
  const [refundReason, setRefundReason] = useState('خطأ في إدخال الباقة من الكاشير');
  const [isRefunding, setIsRefunding] = useState(false);

  const fetchSales = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<SaleTransactionItem[]>('/sales/transactions', {
        search: search || undefined,
      });
      if (Array.isArray(data)) setSales(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل تحميل سجل المبيعات من الخادم';
      showToast(msg, 'error');
      setSales([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, []);

  const handleRefund = async () => {
    if (!selectedTx) return;
    setIsRefunding(true);

    try {
      await apiClient.post(`/sales/transactions/${selectedTx.id}/refund`, {
        reason: refundReason,
      });

      showToast(
        `تم استرجاع الفاتورة ${selectedTx.invoiceNumber} وتعطيل الكرت على راوتر ميكروتيك بنجاح`,
        'success',
      );
      setSelectedTx(null);
      fetchSales();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل استرجاع الفاتورة';
      showToast(msg, 'error');
    } finally {
      setIsRefunding(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Receipt color="var(--primary)" size={24} />
            فواتير ومبيعات الكروت
          </h1>
          <p className="page-subtitle">
            سجل العمليات المالية، تتبع المبيعات، وإجراء الاسترجاع الآمن
          </p>
        </div>

        <button className="btn btn-outline" onClick={fetchSales} disabled={loading}>
          <RefreshCw size={16} />
          تحديث الفواتير
        </button>
      </div>

      {/* Search Bar */}
      <div className="card" style={{ marginBottom: '1.25rem', padding: '0.85rem 1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Search size={16} color="var(--text-muted)" />
          <input
            className="input"
            style={{ padding: '0.45rem 0.75rem' }}
            placeholder="بحث برقم الفاتورة أو هاتف العميل أو اسم المستخدم..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchSales()}
          />
          <button className="btn btn-primary btn-sm" onClick={fetchSales}>
            بحث
          </button>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>رقم الفاتورة</th>
              <th>الكرت المباع</th>
              <th>المبلغ</th>
              <th>طريقة الدفع</th>
              <th>بيانات العميل</th>
              <th>تاريخ البيع</th>
              <th>الحالة</th>
              <th style={{ textAlign: 'left' }}>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((tx) => (
              <tr key={tx.id}>
                <td style={{ fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace' }}>
                  {tx.invoiceNumber}
                </td>
                <td style={{ fontFamily: 'monospace' }}>
                  {tx.card?.username} ({tx.card?.serialNumber})
                </td>
                <td style={{ fontWeight: 800 }}>
                  {Number(tx.amount).toLocaleString()} {tx.currency || 'YER'}
                </td>
                <td>
                  <span className="badge badge-info">
                    {tx.paymentMethod === 'CASH' ? 'نقداً' : tx.paymentMethod}
                  </span>
                </td>
                <td>
                  {tx.customerName || tx.customerPhone ? (
                    <div style={{ fontSize: '0.8rem' }}>
                      <div>{tx.customerName}</div>
                      <div
                        style={{ color: 'var(--text-muted)', direction: 'ltr', textAlign: 'right' }}
                      >
                        {tx.customerPhone}
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>عميل مباشر</span>
                  )}
                </td>
                <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {new Date(tx.createdAt).toLocaleString('ar-YE')}
                </td>
                <td>
                  {tx.isRefunded ? (
                    <span className="badge badge-danger">مسترجع</span>
                  ) : (
                    <span className="badge badge-success">مدفوع ومكتمل</span>
                  )}
                </td>
                <td style={{ textAlign: 'left' }}>
                  {!tx.isRefunded && (
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                      onClick={() => setSelectedTx(tx)}
                      title="استرجاع الفاتورة وتعطيل الكرت"
                    >
                      <RotateCcw size={14} />
                      استرجاع
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Refund Modal */}
      <Modal
        isOpen={!!selectedTx}
        onClose={() => setSelectedTx(null)}
        title="تأكيد استرجاع الفاتورة وتعطيل الكرت"
        maxWidth="500px"
      >
        <div>
          <div
            style={{
              padding: '1rem',
              backgroundColor: 'var(--danger-bg)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '1.25rem',
              display: 'flex',
              gap: '0.75rem',
            }}
          >
            <AlertTriangle size={24} color="var(--danger)" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: '0.85rem', color: 'var(--danger)' }}>
              <strong>تحذير أمني:</strong> عند استرجاع هذه الفاتورة ({selectedTx?.invoiceNumber})،
              سيتم تلقائياً تعطيل الكرت وسحب جلسة المستخدم فوراً من راوتر ميكروتيك عبر الـ API.
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="refund-reason">
              سبب الاسترجاع (إلزامي للتدقيق والامتثال)
            </label>
            <textarea
              id="refund-reason"
              className="textarea"
              rows={3}
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="اكتب سبب استرجاع المبلغ..."
              required
            />
          </div>

          <div className="modal-footer" style={{ padding: '1rem 0 0 0', marginTop: '1.25rem' }}>
            <button type="button" className="btn btn-outline" onClick={() => setSelectedTx(null)}>
              إلغاء
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleRefund}
              disabled={isRefunding || !refundReason.trim()}
            >
              {isRefunding ? 'جاري الاسترجاع والتعطيل...' : 'تأكيد الاسترجاع والخصم'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
