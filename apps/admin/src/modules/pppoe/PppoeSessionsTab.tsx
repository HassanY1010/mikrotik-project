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
      const res = await apiClient.post<{
        success: boolean;
        message: string;
        queuedCommandId?: string;
      }>(`/pppoe/devices/${deviceId}/sessions/disconnect`, {
        username: disconnectSession.username,
        sessionId: disconnectSession.sessionId,
      });

      showToast(res.message || `تم فصل جلسة المشترك ${disconnectSession.username} بنجاح`, 'success');
      if (res.queuedCommandId && onCommandQueued) {
        onCommandQueued(
          res.queuedCommandId,
          `قطع اتصال المشترك [${disconnectSession.username}] على الراوتر`,
        );
      }

      setDisconnectSession(null);
      await onRefresh();
    } catch (err: any) {
      showToast(err?.message || 'تعذر فصل الجلسة النشطة', 'error');
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">الجلسات المتصلة الآن</p>
            <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">
              {sessions.length}
            </h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">إجمالي التنزيل (Download)</p>
            <h3 className="text-2xl font-bold text-sky-600 dark:text-sky-400 mt-1">
              {formatBytes(totalBytesOut)}
            </h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 flex items-center justify-center">
            <ArrowDownCircle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">إجمالي الرفع (Upload)</p>
            <h3 className="text-2xl font-bold text-violet-600 dark:text-violet-400 mt-1">
              {formatBytes(totalBytesIn)}
            </h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 flex items-center justify-center">
            <ArrowUpCircle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Control Bar: Search & Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-5 h-5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="بحث باسم المشترك، IP، أو MAC..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-10 pl-4 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={() => onRefresh(false)}
            disabled={loading}
            className="p-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors disabled:opacity-50"
            title="تحديث القائمة محلياً"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleForceSync}
            disabled={loading || isSyncing}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>مزامنة مباشرة مع الراوتر</span>
          </button>
        </div>
      </div>

      {/* Sessions Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700/60">
              <tr>
                <th className="py-4 px-6 font-semibold">المشترك</th>
                <th className="py-4 px-6 font-semibold">عنوان IP الممنوح</th>
                <th className="py-4 px-6 font-semibold">عنوان MAC / المتصل</th>
                <th className="py-4 px-6 font-semibold">مدة الاتصال</th>
                <th className="py-4 px-6 font-semibold">حركة البيانات (تنزيل / رفع)</th>
                <th className="py-4 px-6 font-semibold">وقت البدء</th>
                <th className="py-4 px-6 font-semibold text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700/60">
              {loading && sessions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 dark:text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <RefreshCw className="w-8 h-8 text-primary-500 animate-spin" />
                      <p>جاري تحميل الجلسات النشطة من الراوتر...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredSessions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 dark:text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <HardDrive className="w-10 h-10 text-slate-400 stroke-[1.5]" />
                      <p className="font-semibold text-slate-700 dark:text-slate-300">
                        لا توجد جلسات PPPoE نشطة حالياً
                      </p>
                      <p className="text-xs text-slate-400">
                        {searchTerm
                          ? 'لا توجد نتائج تطابق بحثك الحالي'
                          : 'يمكنك النقر على "مزامنة مباشرة مع الراوتر" للتحقق من الاتصالات الحية.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredSessions.map((session) => (
                  <tr
                    key={session.id || session.username}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-750/30 transition-colors"
                  >
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20 animate-pulse" />
                        <div>
                          <div className="font-medium text-slate-900 dark:text-slate-100 font-mono">
                            {session.username}
                          </div>
                          {session.sessionId && (
                            <div className="text-xs text-slate-400 font-mono">
                              ID: {session.sessionId}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="py-4 px-6">
                      <span className="font-mono text-xs bg-slate-100 dark:bg-slate-700/50 px-2.5 py-1 rounded-md text-slate-700 dark:text-slate-300">
                        {session.ipAddress}
                      </span>
                    </td>

                    <td className="py-4 px-6 text-slate-600 dark:text-slate-400 font-mono text-xs">
                      {session.macAddress || '—'}
                    </td>

                    <td className="py-4 px-6">
                      <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 text-xs">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{formatUptime(session.uptimeSeconds)}</span>
                      </div>
                    </td>

                    <td className="py-4 px-6">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400">
                          <ArrowDownCircle className="w-3 h-3" />
                          <span>{formatBytes(session.bytesOut)}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400">
                          <ArrowUpCircle className="w-3 h-3" />
                          <span>{formatBytes(session.bytesIn)}</span>
                        </div>
                      </div>
                    </td>

                    <td className="py-4 px-6 text-slate-500 dark:text-slate-400 text-xs font-mono">
                      {session.startedAt
                        ? new Date(session.startedAt).toLocaleTimeString('ar-EG', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })
                        : '—'}
                    </td>

                    <td className="py-4 px-6 text-center">
                      <button
                        onClick={() => setDisconnectSession(session)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 rounded-lg transition-colors"
                        title="فصل الاتصال الفوري"
                      >
                        <Unplug className="w-3.5 h-3.5" />
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
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl text-rose-800 dark:text-rose-300">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 text-rose-600" />
              <div className="text-xs leading-relaxed">
                هل أنت متأكد من رغبتك في قطع اتصال جلسة المشترك{' '}
                <strong className="font-mono text-rose-900 dark:text-rose-200">
                  {disconnectSession.username}
                </strong>
                ؟ سيؤدي هذا لإنهاء اتصال الإنترنت المباشر على الراوتر فوراً.
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl space-y-1 text-xs">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>عنوان IP:</span>
                <span className="font-mono">{disconnectSession.ipAddress}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>مدة الاتصال:</span>
                <span>{formatUptime(disconnectSession.uptimeSeconds)}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setDisconnectSession(null)}
                disabled={isDisconnecting}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmDisconnect}
                disabled={isDisconnecting}
                className="flex items-center gap-2 px-5 py-2 text-sm bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-xl transition-colors shadow-sm disabled:opacity-50"
              >
                {isDisconnecting && <RefreshCw className="w-4 h-4 animate-spin" />}
                <span>تأكيد الفصل الآن</span>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
