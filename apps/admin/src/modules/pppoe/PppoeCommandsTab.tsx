import React, { useState, useEffect, useRef } from 'react';
import { apiClient } from '../../core/api/api-client';
import { useToast } from '../../core/context/ToastContext';
import { AgentCommandStatusItem } from '../../core/types/view-models';
import {
  Terminal,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Search,
  Hourglass,
  Send,
  Zap,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export interface TrackedCommandSummary {
  commandId: string;
  description: string;
  queuedAt: string;
  type?: string;
}

interface PppoeCommandsTabProps {
  deviceId: string;
  trackedCommands: TrackedCommandSummary[];
  selectedCommandId?: string | null;
  onSelectCommand?: (commandId: string) => void;
}

export const PppoeCommandsTab: React.FC<PppoeCommandsTabProps> = ({
  deviceId,
  trackedCommands,
  selectedCommandId,
  onSelectCommand,
}) => {
  const { showToast } = useToast();

  const [activeCommandId, setActiveCommandId] = useState<string>(
    selectedCommandId || trackedCommands[0]?.commandId || '',
  );
  const [manualInputId, setManualInputId] = useState('');
  const [commandDetails, setCommandDetails] = useState<AgentCommandStatusItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoPoll, setAutoPoll] = useState(true);
  const [showPayloadDetails, setShowPayloadDetails] = useState(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (selectedCommandId) {
      setActiveCommandId(selectedCommandId);
    }
  }, [selectedCommandId]);

  // Fetch command status
  const fetchStatus = async (cmdId: string) => {
    if (!cmdId || !deviceId) return;
    setLoading(true);
    try {
      const res = await apiClient.get<AgentCommandStatusItem>(
        `/pppoe/devices/${deviceId}/commands/${cmdId}`,
      );
      setCommandDetails(res);

      // If terminal status, turn off auto-poll
      if (res.status === 'COMPLETED' || res.status === 'FAILED' || res.status === 'EXPIRED') {
        setAutoPoll(false);
      }
    } catch (err: any) {
      showToast(err?.message || 'تعذر جلب حالة الأمر من الخادم', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeCommandId) {
      fetchStatus(activeCommandId);
    } else {
      setCommandDetails(null);
    }
  }, [activeCommandId, deviceId]);

  // Polling management
  useEffect(() => {
    if (!autoPoll || !activeCommandId) {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      return;
    }

    pollIntervalRef.current = setInterval(() => {
      fetchStatus(activeCommandId);
    }, 4000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [autoPoll, activeCommandId, deviceId]);

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const id = manualInputId.trim();
    if (!id) return;
    setActiveCommandId(id);
    if (onSelectCommand) onSelectCommand(id);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>تم التنفيذ بنجاح على الراوتر</span>
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
            <XCircle className="w-3.5 h-3.5" />
            <span>فشل التنفيذ على الراوتر</span>
          </span>
        );
      case 'DISPATCHED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-300 dark:border-blue-800 animate-pulse">
            <Send className="w-3.5 h-3.5" />
            <span>تم الإرسال لـ Windows Agent (قيد المعالجة)</span>
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            <Hourglass className="w-3.5 h-3.5 animate-spin" />
            <span>بانتظار استلام Agent (طابور الانتظار)</span>
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>انتهت مهلة الأمر قبل الوصول للراوتر</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {status}
          </span>
        );
    }
  };

  const translateCommandType = (type: string) => {
    switch (type) {
      case 'pppoe.profile.sync':
        return 'مزامنة بروفايل PPPoE';
      case 'pppoe.secret.add':
        return 'إنشاء اشتراك PPPoE (Secret Add)';
      case 'pppoe.secret.update':
        return 'تحديث اشتراك PPPoE (Secret Update)';
      case 'pppoe.secret.disable':
        return 'تعطيل اشتراك PPPoE وفصل اتصاله';
      case 'pppoe.secret.enable':
        return 'تفعيل اشتراك PPPoE';
      case 'pppoe.secret.remove':
        return 'حذف اشتراك PPPoE نهائياً';
      case 'pppoe.session.list':
        return 'استعلام الجلسات النشطة المباشرة';
      case 'pppoe.session.disconnect':
        return 'فصل جلسة مستخدم نشطة';
      default:
        return type;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner explaining Agent Architecture */}
      <div className="p-4 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 rounded-2xl flex items-start gap-3">
        <Info className="w-5 h-5 text-sky-600 dark:text-sky-400 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-sky-800 dark:text-sky-300 leading-relaxed">
          <strong>نظام أوامر MikroTik المعتمد:</strong> عند إنشاء أو تعديل بروفايلات واشتراكات
          PPPoE، يقوم النظام بوضع أمر مشفر في طابور الوكيل (Windows LAN Agent). لا تُعتبر العملية
          ناجحة على الراوتر حتى تتغير حالة الأمر من <span className="font-mono font-bold">PENDING / DISPATCHED</span>{' '}
          إلى <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">COMPLETED</span>.
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Recent Queued Commands in this session */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-primary-500" />
              <span>الأوامر المجدولة مؤخراً</span>
            </h3>
            <span className="text-xs text-slate-400">{trackedCommands.length} أمر</span>
          </div>

          {/* Manual Command ID search */}
          <form onSubmit={handleManualSearch} className="relative">
            <input
              type="text"
              placeholder="ابحث بمعرف الأمر (UUID)..."
              value={manualInputId}
              onChange={(e) => setManualInputId(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary-500 font-mono"
            />
            <button
              type="submit"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary-500"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* List of tracked commands */}
          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
            {trackedCommands.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                لم يتم إرسال أي أوامر راوتر جديدة خلال هذه الجلسة
              </div>
            ) : (
              trackedCommands.map((cmd) => {
                const isSelected = activeCommandId === cmd.commandId;
                return (
                  <button
                    key={cmd.commandId}
                    type="button"
                    onClick={() => {
                      setActiveCommandId(cmd.commandId);
                      if (onSelectCommand) onSelectCommand(cmd.commandId);
                    }}
                    className={`w-full text-right p-3 rounded-xl border text-xs transition-all ${
                      isSelected
                        ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-950/20 shadow-sm'
                        : 'border-slate-200 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-750/30'
                    }`}
                  >
                    <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {cmd.description}
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[11px] text-slate-400 font-mono">
                      <span>{cmd.commandId.substring(0, 8)}...</span>
                      <span>
                        {new Date(cmd.queuedAt).toLocaleTimeString('ar-EG', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right 2 Columns: Selected Command Monitor */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700/60 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" />
                <span>متابعة تفاصيل الأمر وحالة الراوتر</span>
              </h2>
              {activeCommandId && (
                <div className="text-xs text-slate-400 font-mono mt-1 select-all">
                  معرّف الأمر: {activeCommandId}
                </div>
              )}
            </div>

            {activeCommandId && (
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoPoll}
                    onChange={(e) => setAutoPoll(e.target.checked)}
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 w-3.5 h-3.5"
                  />
                  <span>تحديث تلقائي (Polling)</span>
                </label>

                <button
                  onClick={() => fetchStatus(activeCommandId)}
                  disabled={loading}
                  className="p-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors disabled:opacity-50"
                  title="تحديث الحالة الآن"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            )}
          </div>

          {!activeCommandId ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              <Terminal className="w-12 h-12 mx-auto mb-3 text-slate-300 stroke-[1.5]" />
              <p className="font-semibold text-slate-700 dark:text-slate-300">
                لم يتم اختيار أمر لمتابعته
              </p>
              <p className="text-xs mt-1">
                اختر أمراً من القائمة الجانبية أو أدخل معرف الأمر أعلاه للتحقق من وصوله وتطبيقه على
                الراوتر.
              </p>
            </div>
          ) : loading && !commandDetails ? (
            <div className="py-16 text-center text-slate-500">
              <RefreshCw className="w-8 h-8 mx-auto mb-3 text-primary-500 animate-spin" />
              <p className="text-sm">جاري الاستعلام عن نتيجة الأمر من الخادم...</p>
            </div>
          ) : !commandDetails ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              <AlertCircle className="w-10 h-10 mx-auto mb-2 text-rose-500" />
              <p className="font-semibold text-rose-600">تعذر العثور على الأمر المطلوب</p>
              <p className="text-xs mt-1">
                تأكد من صحة معرف الأمر وتطابقه مع الراوتر والمستأجر المصرح بهما.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Status Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700/60">
                <div className="space-y-1">
                  <span className="text-xs text-slate-400">حالة التنفيذ الحالية</span>
                  <div>{getStatusBadge(commandDetails.status)}</div>
                </div>

                <div className="space-y-1 sm:text-left">
                  <span className="text-xs text-slate-400">نوع العملية (Type)</span>
                  <div className="font-medium text-sm text-slate-800 dark:text-slate-200">
                    {translateCommandType(commandDetails.type)}
                  </div>
                </div>
              </div>

              {/* Error Box if FAILED */}
              {commandDetails.errorMessage && (
                <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl">
                  <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 font-semibold text-xs mb-1">
                    <XCircle className="w-4 h-4" />
                    <span>رسالة الخطأ الصادرة من الوكيل / الراوتر:</span>
                  </div>
                  <pre className="text-xs font-mono text-rose-800 dark:text-rose-300 whitespace-pre-wrap break-words">
                    {commandDetails.errorMessage}
                  </pre>
                </div>
              )}

              {/* Metadata Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl space-y-1">
                  <span className="text-slate-400">معرف العملية (Operation ID / Idempotency):</span>
                  <div className="font-mono text-slate-800 dark:text-slate-200 truncate select-all">
                    {commandDetails.operationId}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl space-y-1">
                  <span className="text-slate-400">معرف الوكيل (Agent ID):</span>
                  <div className="font-mono text-slate-800 dark:text-slate-200 truncate select-all">
                    {commandDetails.agentId}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl space-y-1">
                  <span className="text-slate-400">وقت الإنشاء والجدولة:</span>
                  <div className="text-slate-800 dark:text-slate-200">
                    {new Date(commandDetails.createdAt).toLocaleString('ar-EG')}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl space-y-1">
                  <span className="text-slate-400">وقت الإرسال للوكيل:</span>
                  <div className="text-slate-800 dark:text-slate-200">
                    {commandDetails.dispatchedAt
                      ? new Date(commandDetails.dispatchedAt).toLocaleString('ar-EG')
                      : 'لم يتم الإرسال بعد (في الانتظار)'}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl space-y-1">
                  <span className="text-slate-400">وقت الاكتمال:</span>
                  <div className="text-slate-800 dark:text-slate-200">
                    {commandDetails.completedAt
                      ? new Date(commandDetails.completedAt).toLocaleString('ar-EG')
                      : 'غير مكتمل بعد'}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl space-y-1">
                  <span className="text-slate-400">وقت انتهاء الصلاحية (Expires At):</span>
                  <div className="text-slate-800 dark:text-slate-200">
                    {new Date(commandDetails.expiresAt).toLocaleString('ar-EG')}
                  </div>
                </div>
              </div>

              {/* Collapsible Payload & Result Inspection */}
              <div className="border border-slate-200 dark:border-slate-700/60 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowPayloadDetails(!showPayloadDetails)}
                  className="w-full flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-850 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-slate-500" />
                    <span>عرض البيانات التقنية (Payload & Result Data)</span>
                  </span>
                  {showPayloadDetails ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>

                {showPayloadDetails && (
                  <div className="p-4 space-y-4 bg-slate-950 text-slate-200 font-mono text-xs overflow-x-auto">
                    <div>
                      <div className="text-slate-400 mb-1">// Payload المدخل:</div>
                      <pre className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-[11px]">
                        {JSON.stringify(commandDetails.payload, null, 2)}
                      </pre>
                    </div>

                    {commandDetails.result && (
                      <div>
                        <div className="text-emerald-400 mb-1">// Result المخرجات من الراوتر:</div>
                        <pre className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-[11px]">
                          {JSON.stringify(commandDetails.result, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
