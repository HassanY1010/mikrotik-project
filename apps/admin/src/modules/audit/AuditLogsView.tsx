import React, { useEffect, useState, useCallback } from 'react';
import { apiClient } from '../../core/api/api-client';
import { useToast } from '../../core/context/ToastContext';
import {
  ShieldCheck,
  RefreshCw,
  Filter,
  Eye,
  Download,
  LogIn,
  LogOut,
  Building,
  Settings,
  CreditCard,
  Receipt,
  AlertTriangle,
  Router,
  Trash2,
  Activity,
  UserPlus,
  User,
  Clock,
  Globe,
  Code,
} from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { AuditLogItem } from '../../core/types/view-models';

export const AuditLogsView: React.FC = () => {
  const { showToast } = useToast();
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [actionFilter, setActionFilter] = useState('ALL');
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);

  const fetchLogs = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setLoading(true);
    } else {
      setIsUpdating(true);
    }
    try {
      const data = await apiClient.get<AuditLogItem[] | { data: AuditLogItem[]; total: number }>(
        '/audit-logs',
        {
          action: actionFilter !== 'ALL' ? actionFilter : undefined,
        },
      );
      const items = Array.isArray(data)
        ? data
        : data && typeof data === 'object' && 'data' in data && Array.isArray((data as { data: AuditLogItem[] }).data)
        ? (data as { data: AuditLogItem[] }).data
        : [];
      setLogs(items);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل تحميل سجل التدقيق من الخادم';
      showToast(msg, 'error');
      if (isInitial) {
        setLogs([]);
      }
    } finally {
      if (isInitial) {
        setLoading(false);
      }
      setIsUpdating(false);
    }
  }, [actionFilter, showToast]);

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
    fetchLogs(true);
  }, [fetchLogs]);

  const getActionDisplay = (action: string) => {
    const act = (action || '').toLowerCase();
    if (act.includes('login') || act === 'auth:login') {
      return {
        label: 'تسجيل دخول للنظام',
        badge: 'badge-info',
        icon: <LogIn size={13} />,
      };
    }
    if (act.includes('logout') || act === 'auth:logout') {
      return {
        label: 'تسجيل خروج',
        badge: 'badge-outline',
        icon: <LogOut size={13} />,
      };
    }
    if (act.includes('registered') || act.includes('tenant:registered')) {
      return {
        label: 'إنشاء منشأة جديدة',
        badge: 'badge-success',
        icon: <Building size={13} />,
      };
    }
    if (act.includes('settings_updated') || act.includes('settings')) {
      return {
        label: 'تعديل إعدادات المنشأة',
        badge: 'badge-warning',
        icon: <Settings size={13} />,
      };
    }
    if (act.includes('approved') || act.includes('subscription')) {
      return {
        label: 'تفعيل / ترقية الاشتراك',
        badge: 'badge-success',
        icon: <Building size={13} />,
      };
    }
    if (act.includes('card_generated') || act.includes('batch')) {
      return {
        label: 'توليد كروت هوتسبوت',
        badge: 'badge-success',
        icon: <CreditCard size={13} />,
      };
    }
    if (act.includes('card_sold') || act.includes('sold')) {
      return {
        label: 'بيع كرت لمشترك',
        badge: 'badge-success',
        icon: <Receipt size={13} />,
      };
    }
    if (act.includes('refund')) {
      return {
        label: 'استرجاع فاتورة كرت',
        badge: 'badge-danger',
        icon: <AlertTriangle size={13} />,
      };
    }
    if (act.includes('device_added') || act.includes('device:created')) {
      return {
        label: 'إضافة راوتر ميكروتك',
        badge: 'badge-primary',
        icon: <Router size={13} />,
      };
    }
    if (act.includes('device_updated') || act.includes('device:updated')) {
      return {
        label: 'تعديل إعدادات راوتر',
        badge: 'badge-warning',
        icon: <Router size={13} />,
      };
    }
    if (act.includes('device_deleted') || act.includes('device:deleted')) {
      return {
        label: 'حذف راوتر',
        badge: 'badge-danger',
        icon: <Trash2 size={13} />,
      };
    }
    if (act.includes('device_ping') || act.includes('ping')) {
      return {
        label: 'فحص اتصال راوتر',
        badge: 'badge-outline',
        icon: <Activity size={13} />,
      };
    }
    if (act.includes('user_created') || act.includes('user:created')) {
      return {
        label: 'إضافة موظف جديد',
        badge: 'badge-primary',
        icon: <UserPlus size={13} />,
      };
    }
    return {
      label: action,
      badge: 'badge-outline',
      icon: <Activity size={13} />,
    };
  };

  const getEntityDisplay = (log: AuditLogItem) => {
    const rawEntity = log.entity || log.entityType || '';
    const ent = rawEntity.toLowerCase();
    let name = 'غير محدد';

    if (ent.includes('user')) name = 'حساب مستخدم / موظف';
    else if (ent.includes('device')) name = 'راوتر MikroTik';
    else if (ent.includes('profile')) name = 'باقة هوتسبوت';
    else if (ent.includes('cardbatch') || ent.includes('batch')) name = 'دفعة كروت';
    else if (ent.includes('card')) name = 'كرت هوتسبوت';
    else if (ent.includes('tenant')) name = 'المنشأة والشبكة';
    else if (ent.includes('sale') || ent.includes('transaction')) name = 'فاتورة مبيعات';
    else if (rawEntity) name = rawEntity;

    const shortId = log.entityId ? ` (#${log.entityId.substring(0, 6)})` : '';
    return { name, shortId };
  };

  const getUserDisplay = (log: AuditLogItem) => {
    const directName = log.user?.fullName || log.userName;
    const directEmail = log.user?.email || log.userEmail;

    if (directName) {
      return {
        name: directName,
        email: directEmail || '',
        isSystem: false,
      };
    }

    // Check payload data fallback
    const meta = (log.newValues || log.oldValues || log.metadata) as Record<string, unknown> | undefined;
    if (meta && typeof meta.fullName === 'string') {
      return {
        name: meta.fullName,
        email: typeof meta.email === 'string' ? meta.email : '',
        isSystem: false,
      };
    }

    return {
      name: 'النظام التلقائي',
      email: 'عملية أمان مجدولة',
      isSystem: true,
    };
  };

  const getMeaningfulDetails = (log: AuditLogItem) => {
    const meta = (log.newValues || log.oldValues || log.metadata) as Record<string, unknown> | undefined;
    if (!meta || Object.keys(meta).length === 0) return null;

    const details: Array<{ label: string; value: string }> = [];

    if (meta.status) details.push({ label: 'حالة العملية', value: String(meta.status) });
    if (meta.platform) details.push({ label: 'منصة الدخول', value: String(meta.platform) });
    if (meta.role) details.push({ label: 'الدور الوظيفي', value: String(meta.role) });
    if (meta.email) details.push({ label: 'البريد الإلكتروني', value: String(meta.email) });
    if (meta.reason) details.push({ label: 'السبب أو المبرر', value: String(meta.reason) });
    if (meta.count) details.push({ label: 'العدد', value: String(meta.count) });
    if (meta.amount) details.push({ label: 'المبلغ', value: `${meta.amount} SDG` });
    if (meta.name) details.push({ label: 'الاسم', value: String(meta.name) });

    return details.length > 0 ? details : null;
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <ShieldCheck color="var(--primary)" size={24} />
            سجل التدقيق والرقابة والأمان
          </h1>
          <p className="page-subtitle">
            متابعة دقيقة لكل العمليات الحساسة (تسجيل الدخول، إنشاء الكروت، التعديلات، وعناوين IP)
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-outline" onClick={handleExportCsv} disabled={exporting}>
            <Download size={16} />
            {exporting ? 'جاري التصدير...' : 'تصدير السجل (CSV)'}
          </button>
          <button className="btn btn-primary" onClick={() => fetchLogs(false)} disabled={loading || isUpdating}>
            <RefreshCw size={16} className={loading || isUpdating ? 'spin' : ''} />
            تحديث السجل
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ marginBottom: '1.25rem', padding: '0.85rem 1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Filter size={16} color="var(--text-muted)" />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>تصفية حسب نوع العملية:</span>
          <select
            className="select"
            style={{ width: 'auto', padding: '0.45rem 0.75rem' }}
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            <option value="ALL">جميع العمليات المسجلة</option>
            <option value="login">تسجيل الدخول للنظام</option>
            <option value="card">عمليات الكروت والباقات</option>
            <option value="device">عمليات أجهزة الراوتر</option>
            <option value="tenant">إعدادات المنشأة والشبكة</option>
            <option value="user">إدارة الموظفين والكاشير</option>
          </select>
        </div>
      </div>

      {/* Audit Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>العملية المنفذة</th>
              <th>الكيان المستهدف</th>
              <th>المستخدم المنفذ</th>
              <th>عنوان IP</th>
              <th>التوقيت والتاريخ</th>
              <th style={{ textAlign: 'left' }}>التفاصيل</th>
            </tr>
          </thead>
          <tbody style={{ opacity: isUpdating ? 0.6 : 1, transition: 'opacity 0.2s ease' }}>
            {loading && logs.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem' }}>
                  جاري فحص وتحديث سجل العمليات...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                  لا توجد عمليات مسجلة تطابق التصفية الحالية.
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const actionInfo = getActionDisplay(log.action);
                const entityInfo = getEntityDisplay(log);
                const userInfo = getUserDisplay(log);

                return (
                  <tr key={log.id}>
                    <td>
                      <span
                        className={`badge ${actionInfo.badge}`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                      >
                        {actionInfo.icon}
                        {actionInfo.label}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{entityInfo.name}</div>
                      {entityInfo.shortId && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          معرف: {entityInfo.shortId}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: userInfo.isSystem ? 'var(--text-muted)' : 'inherit' }}>
                        {userInfo.name}
                      </div>
                      {userInfo.email && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', direction: 'ltr', textAlign: 'right' }}>
                          {userInfo.email}
                        </div>
                      )}
                    </td>
                    <td
                      style={{
                        direction: 'ltr',
                        textAlign: 'right',
                        fontFamily: 'monospace',
                        fontSize: '0.85rem',
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
                        onClick={() => {
                          setSelectedLog(log);
                          setShowRawJson(false);
                        }}
                        title="عرض تفاصيل وبيانات العملية"
                      >
                        <Eye size={14} />
                        عرض التفاصيل
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <Modal
          isOpen={!!selectedLog}
          onClose={() => setSelectedLog(null)}
          title={`تفاصيل العملية: ${getActionDisplay(selectedLog.action).label}`}
          maxWidth="560px"
        >
          <div>
            {/* Summary Cards */}
            <div
              className="form-grid-2"
              style={{
                marginBottom: '1.25rem',
              }}
            >
              <div
                style={{
                  padding: '0.75rem',
                  backgroundColor: 'var(--bg-app)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <User size={13} />
                  المستخدم المنفذ
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                  {getUserDisplay(selectedLog).name}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', direction: 'ltr', textAlign: 'right' }}>
                  {getUserDisplay(selectedLog).email}
                </div>
              </div>

              <div
                style={{
                  padding: '0.75rem',
                  backgroundColor: 'var(--bg-app)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Globe size={13} />
                  عنوان الشبكة (IP)
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', direction: 'ltr', textAlign: 'right', fontFamily: 'monospace' }}>
                  {selectedLog.ipAddress || '127.0.0.1'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {selectedLog.userAgent ? (selectedLog.userAgent.includes('Dart') ? 'تطبيق الموبايل' : 'متصفح ويب') : 'محلي'}
                </div>
              </div>
            </div>

            <div
              style={{
                padding: '0.75rem',
                backgroundColor: 'var(--bg-app)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                marginBottom: '1.25rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>الكيان المستهدف: </span>
                <strong>{getEntityDisplay(selectedLog).name}</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <Clock size={13} />
                {new Date(selectedLog.createdAt).toLocaleString('ar-SD')}
              </div>
            </div>

            {/* Meaningful Key-Value Details */}
            {getMeaningfulDetails(selectedLog) ? (
              <div style={{ marginBottom: '1rem' }}>
                <label className="form-label">بيانات ومخرجات العملية:</label>
                <div
                  style={{
                    backgroundColor: 'var(--bg-app)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    overflow: 'hidden',
                  }}
                >
                  {getMeaningfulDetails(selectedLog)?.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '0.6rem 0.85rem',
                        borderBottom: idx !== (getMeaningfulDetails(selectedLog)?.length || 0) - 1 ? '1px solid var(--border)' : 'none',
                        fontSize: '0.85rem',
                      }}
                    >
                      <span style={{ color: 'var(--text-secondary)' }}>{item.label}:</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: '1rem',
                  textAlign: 'center',
                  backgroundColor: 'var(--bg-app)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px dashed var(--border)',
                  color: 'var(--text-muted)',
                  fontSize: '0.85rem',
                  marginBottom: '1rem',
                }}
              >
                تم تنفيذ العملية بصورة قياسية بدون وسائط إضافية.
              </div>
            )}

            {/* Optional Raw JSON toggle */}
            <div style={{ marginBottom: '1rem' }}>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => setShowRawJson(!showRawJson)}
              >
                <Code size={14} />
                {showRawJson ? 'إخفاء البيانات التقنية (JSON)' : 'عرض البيانات التقنية (JSON)'}
              </button>

              {showRawJson && (
                <pre
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.75rem',
                    backgroundColor: 'var(--surface)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    color: 'var(--primary)',
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                    maxHeight: '180px',
                    overflowY: 'auto',
                    direction: 'ltr',
                    textAlign: 'left',
                  }}
                >
                  {JSON.stringify(
                    selectedLog.newValues || selectedLog.oldValues || selectedLog.metadata || {},
                    null,
                    2,
                  )}
                </pre>
              )}
            </div>

            <div className="modal-footer" style={{ padding: '0.75rem 0 0 0', marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => setSelectedLog(null)}>
                إغلاق
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
