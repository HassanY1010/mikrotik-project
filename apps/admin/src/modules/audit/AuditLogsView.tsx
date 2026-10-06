import React, { useEffect, useState } from 'react';
import { apiClient } from '../../core/api/api-client';
import { useToast } from '../../core/context/ToastContext';
import { ShieldCheck, RefreshCw, Filter, Eye, Download } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { AuditLogItem } from '../../core/types/view-models';

export const AuditLogsView: React.FC = () => {
  const { showToast } = useToast();
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [actionFilter, setActionFilter] = useState('ALL');
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<AuditLogItem[] | { data: AuditLogItem[]; total: number }>('/audit-logs', {
        action: actionFilter !== 'ALL' ? actionFilter : undefined,
      });
      const items = Array.isArray(data)
        ? data
        : data && typeof data === 'object' && 'data' in data && Array.isArray((data as { data: AuditLogItem[] }).data)
        ? (data as { data: AuditLogItem[] }).data
        : [];
      setLogs(items);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل تحميل سجل التدقيق من الخادم';
      showToast(msg, 'error');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const csvText = await apiClient.get<string>('/audit-logs/export', {
        action: actionFilter !== 'ALL' ? actionFilter : undefined,
      });
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit_logs_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('تم تصدير سجل التدقيق والأمان بنجاح!', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل تصدير سجل التدقيق';
      showToast(msg, 'error');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [actionFilter]);

  const getActionBadge = (action: string) => {
    if (action.includes('AUTH')) return <span className="badge badge-info">{action}</span>;
    if (action.includes('CARD')) return <span className="badge badge-success">{action}</span>;
    if (action.includes('REFUND') || action.includes('DELETE'))
      return <span className="badge badge-danger">{action}</span>;
    return <span className="badge badge-warning">{action}</span>;
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <ShieldCheck color="var(--primary)" size={24} />
            سجل التدقيق والرقابة
          </h1>
          <p className="page-subtitle">
            تتبع العمليات الحساسة، التوليد، المبيعات، والدخول مع عناوين IP والتفاصيل
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-outline" onClick={handleExportCsv} disabled={exporting}>
            <Download size={16} />
            {exporting ? 'جاري التصدير...' : 'تصدير السجل (CSV)'}
          </button>
          <button className="btn btn-primary" onClick={fetchLogs} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            تحديث السجل
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ marginBottom: '1.25rem', padding: '0.85rem 1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Filter size={16} color="var(--text-muted)" />
          <select
            className="select"
            style={{ width: 'auto', padding: '0.45rem 0.75rem' }}
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            <option value="ALL">جميع العمليات</option>
            <option value="AUTH_LOGIN">تسجيل الدخول</option>
            <option value="CARD_GENERATED">توليد الكروت</option>
            <option value="CARD_SOLD">بيع كرت</option>
            <option value="SALE_REFUND">استرجاع فاتورة</option>
            <option value="DEVICE_PING">فحص راوتر</option>
          </select>
        </div>
      </div>

      {/* Audit Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>العملية</th>
              <th>الكيان المستهدف</th>
              <th>المستخدم المنفذ</th>
              <th>عنوان IP</th>
              <th>التوقيت</th>
              <th style={{ textAlign: 'left' }}>البيانات الإضافية</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{getActionBadge(log.action)}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {log.entityType} ({log.entityId?.substring(0, 8)}...)
                </td>
                <td>
                  <div style={{ fontWeight: 700 }}>{log.user?.fullName || 'النظام التلقائي'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {log.user?.email}
                  </div>
                </td>
                <td
                  style={{
                    direction: 'ltr',
                    textAlign: 'right',
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                  }}
                >
                  {log.ipAddress || '127.0.0.1'}
                </td>
                <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {new Date(log.createdAt).toLocaleString('ar-SD')}
                </td>
                <td style={{ textAlign: 'left' }}>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setSelectedLog(log)}
                    title="عرض بيانات JSON للتغيير"
                  >
                    <Eye size={14} />
                    عرض التفاصيل
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Metadata Detail Modal */}
      <Modal
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title={`تفاصيل سجل التدقيق: ${selectedLog?.action || ''}`}
        maxWidth="520px"
      >
        <div>
          <div
            style={{ marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}
          >
            <div>
              المستخدم: <strong>{selectedLog?.user?.fullName}</strong> ({selectedLog?.user?.email})
            </div>
            <div>
              عنوان IP: <strong>{selectedLog?.ipAddress}</strong>
            </div>
            <div>
              التوقيت:{' '}
              <strong>
                {selectedLog && new Date(selectedLog.createdAt).toLocaleString('ar-SD')}
              </strong>
            </div>
          </div>

          <label className="form-label">البيانات الوصفية للعملية:</label>
          <pre
            style={{
              padding: '1rem',
              backgroundColor: 'var(--bg-app)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              color: 'var(--primary)',
              fontSize: '0.8rem',
              fontFamily: 'monospace',
              maxHeight: '260px',
              overflowY: 'auto',
              direction: 'ltr',
              textAlign: 'left',
            }}
          >
            {JSON.stringify(selectedLog?.metadata || {}, null, 2)}
          </pre>

          <div className="modal-footer" style={{ padding: '1rem 0 0 0', marginTop: '1.25rem' }}>
            <button className="btn btn-secondary" onClick={() => setSelectedLog(null)}>
              إغلاق
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
