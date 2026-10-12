import React, { useState } from 'react';
import { apiClient } from '../../core/api/api-client';
import { useToast } from '../../core/context/ToastContext';
import { Modal } from '../../components/common/Modal';
import { PppoeActiveSessionItem } from '../../core/types/view-models';
import {
  Search,
  RefreshCw,
  Unplug,
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  Radio,
  HardDrive,
} from 'lucide-react';

interface PppoeSessionsTabProps {
  deviceId: string;
  sessions: PppoeActiveSessionItem[];
  loading: boolean;
  onRefresh: (syncFromRouter?: boolean) => Promise<void> | void;
  onCommandQueued?: (commandId: string, desc: string) => void;
}

export const PppoeSessionsTab: React.FC<PppoeSessionsTabProps> = ({
  deviceId,
  sessions,
  loading,
  onRefresh,
  onCommandQueued,
}) => {
  const { showToast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  // Disconnect Modal
  const [disconnectSession, setDisconnectSession] = useState<PppoeActiveSessionItem | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // Helpers
  const formatUptime = (seconds: number): string => {
    if (!seconds || seconds <= 0) return '0 ثانية';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const parts: string[] = [];
    if (d > 0) parts.push(`${d} يوم`);
    if (h > 0) parts.push(`${h} س`);
    if (m > 0) parts.push(`${m} د`);
    if (parts.length === 0 || (d === 0 && h === 0)) parts.push(`${s} ث`);
    return parts.join(' ');
  };

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let val = bytes;
    let idx = 0;
    while (val >= 1024 && idx < units.length - 1) {
      val /= 1024;
      idx++;
    }
    return `${val.toFixed(2)} ${units[idx]}`;
  };

  const filteredSessions = sessions.filter((s) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return (
      s.username.toLowerCase().includes(q) ||
      s.ipAddress.toLowerCase().includes(q) ||
      (s.macAddress && s.macAddress.toLowerCase().includes(q))
    );
  });

  // Aggregate stats
  const totalBytesIn = sessions.reduce((acc, s) => acc + (s.bytesIn || 0), 0);
  const totalBytesOut = sessions.reduce((acc, s) => acc + (s.bytesOut || 0), 0);

  // Trigger sync from router via agent command
  const handleForceSync = async () => {
    setIsSyncing(true);
    try {
      await onRefresh(true);
      showToast('تم إرسال طلب استعلام الجلسات النشطة إلى الراوتر بنجاح', 'success');
    } catch (err: any) {
      showToast(err?.message || 'تعذر استعلام الجلسات من الراوتر', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Disconnect handler
  const handleConfirmDisconnect = async () => {
    if (!disconnectSession) return;
    setIsDisconnecting(true);
    try {
      const res = await apiClient.post<{ success: boolean; queuedCommandId: string }>(
        `/pppoe/devices/${deviceId}/sessions/disconnect`,
        {
          username: disconnectSession.username,
          sessionId: disconnectSession.sessionId,
        },
      );

      showToast(`تم إرسال أمر فصل الجلسة للمشترك "${disconnectSession.username}"`, 'success');

      if (res?.queuedCommandId && onCommandQueued) {
        onCommandQueued(res.queuedCommandId, `فصل جلسة ${disconnectSession.username}`);
      }

      setDisconnectSession(null);
      onRefresh(false);
    } catch (err: any) {
      showToast(err?.message || 'فشل فصل الجلسة', 'error');
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Banner / Metrics Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1rem',
        }}
      >
        <div className="stat-card">
          <div
            className="stat-icon"
            style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10B981' }}
          >
            <Radio size={22} className={sessions.length > 0 ? 'spin' : ''} />
          </div>
          <div>
            <div className="stat-value" style={{ color: '#10B981' }}>{sessions.length}</div>
            <div className="stat-label">الجلسات المتصلة الآن</div>
          </div>
        </div>

        <div className="stat-card">
          <div
            className="stat-icon"
            style={{ backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38BDF8' }}
          >
            <ArrowDownCircle size={22} />
          </div>
          <div>
            <div className="stat-value" style={{ color: '#38BDF8', direction: 'ltr', textAlign: 'right' }}>
              {formatBytes(totalBytesOut)}
            </div>
            <div className="stat-label">إجمالي التنزيل (Download)</div>
          </div>
        </div>

        <div className="stat-card">
          <div
            className="stat-icon"
            style={{ backgroundColor: 'rgba(168, 85, 247, 0.15)', color: '#A855F7' }}
          >
            <ArrowUpCircle size={22} />
          </div>
          <div>
            <div className="stat-value" style={{ color: '#A855F7', direction: 'ltr', textAlign: 'right' }}>
              {formatBytes(totalBytesIn)}
            </div>
            <div className="stat-label">إجمالي الرفع (Upload)</div>
          </div>
        </div>
      </div>

      {/* Control Bar: Search & Action Buttons */}
      <div
        className="card"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          padding: '1rem 1.25rem',
        }}
      >
        <div style={{ position: 'relative', width: '100%', maxWidth: 360 }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              right: '0.85rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="بحث باسم المشترك، IP، أو MAC..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="form-control"
            style={{
              paddingRight: '2.4rem',
              width: '100%',
              fontSize: '0.85rem',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => onRefresh(false)}
            disabled={loading}
            className="btn btn-secondary"
            title="تحديث القائمة محلياً"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 0.9rem' }}
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
            <span>تحديث</span>
          </button>

          <button
            onClick={handleForceSync}
            disabled={loading || isSyncing}
            className="btn btn-primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: '#10B981',
              borderColor: '#10B981',
              padding: '0.55rem 1.1rem',
              fontWeight: 600,
            }}
          >
            <RefreshCw size={15} className={isSyncing ? 'spin' : ''} />
            <span>مزامنة مباشرة مع الراوتر</span>
          </button>
        </div>
      </div>

      {/* Sessions Table */}
      <div
        className="card"
        style={{
          padding: 0,
          overflow: 'hidden',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                <th style={{ padding: '0.9rem 1.25rem', fontWeight: 600, color: 'var(--text-secondary)' }}>المشترك</th>
                <th style={{ padding: '0.9rem 1.25rem', fontWeight: 600, color: 'var(--text-secondary)' }}>عنوان IP الممنوح</th>
                <th style={{ padding: '0.9rem 1.25rem', fontWeight: 600, color: 'var(--text-secondary)' }}>عنوان MAC / المتصل</th>
                <th style={{ padding: '0.9rem 1.25rem', fontWeight: 600, color: 'var(--text-secondary)' }}>مدة الاتصال</th>
                <th style={{ padding: '0.9rem 1.25rem', fontWeight: 600, color: 'var(--text-secondary)' }}>حركة البيانات (تنزيل / رفع)</th>
                <th style={{ padding: '0.9rem 1.25rem', fontWeight: 600, color: 'var(--text-secondary)' }}>وقت البدء</th>
                <th style={{ padding: '0.9rem 1.25rem', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center' }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading && sessions.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <RefreshCw size={26} className="spin" style={{ margin: '0 auto 0.75rem auto' }} />
                    <p style={{ margin: 0, fontWeight: 600 }}>جاري استعلام الجلسات النشطة من الراوتر...</p>
                  </td>
                </tr>
              ) : filteredSessions.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <HardDrive size={38} style={{ margin: '0 auto 0.75rem auto', color: 'var(--border-light)' }} />
                    <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                      لا توجد جلسات PPPoE نشطة حالياً
                    </p>
                    <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {searchTerm
                        ? 'لا توجد نتائج تطابق بحثك الحالي'
                        : 'يمكنك النقر على "مزامنة مباشرة مع الراوتر" للتحقق من الاتصالات الحية.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredSessions.map((session) => (
                  <tr
                    key={session.id || session.username}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    <td style={{ padding: '0.9rem 1.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: '#10B981',
                            display: 'inline-block',
                            boxShadow: '0 0 8px #10B981',
                          }}
                        />
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                            {session.username}
                          </div>
                          {session.sessionId && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                              ID: {session.sessionId}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: '0.9rem 1.25rem' }}>
                      <span
                        className="badge badge-info"
                        style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                      >
                        {session.ipAddress}
                      </span>
                    </td>

                    <td style={{ padding: '0.9rem 1.25rem', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {session.macAddress || '—'}
                    </td>

                    <td style={{ padding: '0.9rem 1.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                        <Clock size={13} style={{ color: 'var(--text-muted)' }} />
                        <span>{formatUptime(session.uptimeSeconds)}</span>
                      </div>
                    </td>

                    <td style={{ padding: '0.9rem 1.25rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#38BDF8', direction: 'ltr', justifyContent: 'flex-end' }}>
                          <ArrowDownCircle size={12} />
                          <span>{formatBytes(session.bytesOut)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#A855F7', direction: 'ltr', justifyContent: 'flex-end' }}>
                          <ArrowUpCircle size={12} />
                          <span>{formatBytes(session.bytesIn)}</span>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: '0.9rem 1.25rem', color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                      {session.startedAt
                        ? new Date(session.startedAt).toLocaleTimeString('ar-EG', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })
                        : '—'}
                    </td>

                    <td style={{ padding: '0.9rem 1.25rem', textAlign: 'center' }}>
                      <button
                        onClick={() => setDisconnectSession(session)}
                        className="btn btn-secondary"
                        style={{
                          padding: '0.35rem 0.75rem',
                          fontSize: '0.75rem',
                          color: 'var(--danger)',
                          borderColor: 'rgba(239, 68, 68, 0.3)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                        title="فصل الاتصال الفوري"
                      >
                        <Unplug size={13} />
                        <span>فصل</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Disconnect Confirmation Modal */}
      {disconnectSession && (
        <Modal
          isOpen={true}
          onClose={() => !isDisconnecting && setDisconnectSession(null)}
          title="تأكيد فصل الجلسة النشطة"
          maxWidth="max-w-md"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.5rem 0' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
                padding: '0.9rem 1rem',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--danger)',
              }}
            >
              <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: '0.15rem' }} />
              <div style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
                هل أنت متأكد من رغبتك في قطع اتصال جلسة المشترك{' '}
                <strong style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                  {disconnectSession.username}
                </strong>
                ؟ سيؤدي هذا لإنهاء اتصال الإنترنت المباشر على الراوتر فوراً.
              </div>
            </div>

            <div
              style={{
                backgroundColor: 'var(--bg-card-alt)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '0.85rem 1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                fontSize: '0.85rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span>عنوان IP:</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {disconnectSession.ipAddress}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span>مدة الاتصال:</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {formatUptime(disconnectSession.uptimeSeconds)}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setDisconnectSession(null)}
                disabled={isDisconnecting}
                className="btn btn-secondary"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmDisconnect}
                disabled={isDisconnecting}
                className="btn btn-primary"
                style={{
                  backgroundColor: 'var(--danger)',
                  borderColor: 'var(--danger)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                {isDisconnecting && <RefreshCw size={14} className="spin" />}
                <span>تأكيد الفصل الآن</span>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
