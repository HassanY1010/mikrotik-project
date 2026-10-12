import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../core/api/api-client';
import { useToast } from '../../core/context/ToastContext';
import {
  DeviceItem,
  PppoeProfileItem,
  PppoeAccountItem,
  PppoeActiveSessionItem,
} from '../../core/types/view-models';
import { PppoeProfilesTab } from './PppoeProfilesTab';
import { PppoeAccountsTab } from './PppoeAccountsTab';
import { PppoeSessionsTab } from './PppoeSessionsTab';
import { PppoeCommandsTab, TrackedCommandSummary } from './PppoeCommandsTab';
import {
  Network,
  Users,
  Layers,
  Radio,
  Terminal,
  Router as RouterIcon,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

export type PppoeSubTab = 'accounts' | 'profiles' | 'sessions' | 'commands';

export const PppoeManagementView: React.FC = () => {
  const { showToast } = useToast();

  // Router Devices State
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [devicesLoading, setDevicesLoading] = useState(true);

  // Active Tab
  const [activeTab, setActiveTab] = useState<PppoeSubTab>('accounts');

  // PPPoE Domain Data
  const [profiles, setProfiles] = useState<PppoeProfileItem[]>([]);
  const [accounts, setAccounts] = useState<PppoeAccountItem[]>([]);
  const [sessions, setSessions] = useState<PppoeActiveSessionItem[]>([]);

  // Loading States
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Tracked Router Commands State
  const [trackedCommands, setTrackedCommands] = useState<TrackedCommandSummary[]>([]);
  const [selectedCommandId, setSelectedCommandId] = useState<string | null>(null);
  const [latestQueuedNotice, setLatestQueuedNotice] = useState<{
    commandId: string;
    description: string;
  } | null>(null);

  // 1. Fetch available router devices
  const fetchDevices = useCallback(async () => {
    setDevicesLoading(true);
    try {
      const data = await apiClient.get<DeviceItem[]>('/devices');
      if (Array.isArray(data)) {
        setDevices(data);
        if (data.length > 0 && !selectedDeviceId) {
          // Select first device by default
          setSelectedDeviceId(data[0].id);
        }
      }
    } catch (err: any) {
      showToast(err?.message || 'تعذر تحميل قائمة أجهزة الراوتر', 'error');
    } finally {
      setDevicesLoading(false);
    }
  }, [selectedDeviceId, showToast]);

  useEffect(() => {
    fetchDevices();
  }, []);

  // 2. Fetch Profiles for selected device
  const fetchProfiles = useCallback(async () => {
    if (!selectedDeviceId) return;
    setLoadingProfiles(true);
    try {
      const data = await apiClient.get<PppoeProfileItem[]>(
        `/pppoe/devices/${selectedDeviceId}/profiles`,
      );
      setProfiles(Array.isArray(data) ? data : []);
    } catch (err: any) {
      showToast(err?.message || 'تعذر تحميل بروفايلات PPPoE', 'error');
      setProfiles([]);
    } finally {
      setLoadingProfiles(false);
    }
  }, [selectedDeviceId, showToast]);

  // 3. Fetch Accounts for selected device
  const fetchAccounts = useCallback(async () => {
    if (!selectedDeviceId) return;
    setLoadingAccounts(true);
    try {
      const data = await apiClient.get<{
        items: PppoeAccountItem[];
        pagination: any;
      }>(`/pppoe/devices/${selectedDeviceId}/accounts?limit=200`);
      setAccounts(Array.isArray(data?.items) ? data.items : []);
    } catch (err: any) {
      showToast(err?.message || 'تعذر تحميل حسابات المشتركين', 'error');
      setAccounts([]);
    } finally {
      setLoadingAccounts(false);
    }
  }, [selectedDeviceId, showToast]);

  // 4. Fetch Sessions for selected device
  const fetchSessions = useCallback(
    async (syncFromRouter = false) => {
      if (!selectedDeviceId) return;
      setLoadingSessions(true);
      try {
        const url = `/pppoe/devices/${selectedDeviceId}/sessions${
          syncFromRouter ? '?sync=true' : ''
        }`;
        const data = await apiClient.get<{
          sessions: PppoeActiveSessionItem[];
          queuedCommandId: string | null;
        }>(url);

        setSessions(Array.isArray(data?.sessions) ? data.sessions : []);

        if (data?.queuedCommandId) {
          handleCommandQueued(
            data.queuedCommandId,
            'طلب استعلام ومزامنة الجلسات الحية من الراوتر',
          );
        }
      } catch (err: any) {
        showToast(err?.message || 'تعذر استعلام الجلسات النشطة', 'error');
        setSessions([]);
      } finally {
        setLoadingSessions(false);
      }
    },
    [selectedDeviceId, showToast],
  );

  // Trigger loads when device changes
  useEffect(() => {
    if (selectedDeviceId) {
      fetchProfiles();
      fetchAccounts();
      fetchSessions(false);
    } else {
      setProfiles([]);
      setAccounts([]);
      setSessions([]);
    }
  }, [selectedDeviceId, fetchProfiles, fetchAccounts, fetchSessions]);

  // Handle command queued from any tab
  const handleCommandQueued = (commandId: string, description: string) => {
    const item: TrackedCommandSummary = {
      commandId,
      description,
      queuedAt: new Date().toISOString(),
    };

    setTrackedCommands((prev) => {
      const exists = prev.some((c) => c.commandId === commandId);
      if (exists) return prev;
      return [item, ...prev];
    });

    setSelectedCommandId(commandId);
    setLatestQueuedNotice({ commandId, description });
  };

  // KPIs
  const activeSubscribersCount = accounts.filter((a) => a.status === 'ACTIVE').length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-3">
            <span className="p-2.5 bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 rounded-2xl">
              <Network className="w-6 h-6" />
            </span>
            <span>إدارة اشتراكات النطاق العريض (PPPoE)</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            إدارة المشتركين المنزليين وباقات السرعة والجلسات المتصلة وأوامر المزامنة على راوترات
            MikroTik
          </p>
        </div>

        {/* Device Selector */}
        <div className="flex items-center gap-3 bg-white dark:bg-slate-800 p-2 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm">
          <div className="flex items-center gap-2 pr-3 text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <RouterIcon className="w-4 h-4 text-primary-500" />
            <span>الراوتر المستهدف:</span>
          </div>

          {devicesLoading ? (
            <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-400">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>جاري التحميل...</span>
            </div>
          ) : devices.length === 0 ? (
            <div className="text-xs text-rose-500 px-3 py-1 font-medium">
              لا يوجد راوتر متاح
            </div>
          ) : (
            <select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            >
              {devices.map((dev) => (
                <option key={dev.id} value={dev.id}>
                  {dev.name} ({dev.host || 'LAN Agent'}) {dev.status === 'ONLINE' ? '🟢' : '⚪'}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={() => {
              fetchProfiles();
              fetchAccounts();
              fetchSessions(false);
            }}
            disabled={!selectedDeviceId || loadingProfiles || loadingAccounts || loadingSessions}
            className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            title="تحديث جميع بيانات الراوتر"
          >
            <RefreshCw
              className={`w-4 h-4 ${
                loadingProfiles || loadingAccounts || loadingSessions ? 'animate-spin' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* No Device Warning */}
      {!devicesLoading && devices.length === 0 && (
        <div className="p-6 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="font-semibold text-amber-900 dark:text-amber-200 text-sm">
              لم يتم العثور على أجهزة راوتر مسجلة في هذا الحساب
            </h3>
            <p className="text-xs text-amber-800 dark:text-amber-300">
              لاستخدام خدمات PPPoE، يجب أولاً إضافة راوتر MikroTik وربطه مع Windows LAN Agent من قسم
              "إدارة الأجهزة".
            </p>
          </div>
        </div>
      )}

      {/* Queued Command Notification Banner */}
      {latestQueuedNotice && (
        <div className="p-4 bg-primary-50 dark:bg-primary-950/50 border border-primary-200 dark:border-primary-800/60 rounded-2xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-primary-500 animate-ping" />
            <div>
              <p className="text-xs font-semibold text-primary-900 dark:text-primary-200">
                تمت جدولة أمر راوتر جديد: {latestQueuedNotice.description}
              </p>
              <p className="text-[11px] font-mono text-primary-700 dark:text-primary-400">
                معرف الأمر: {latestQueuedNotice.commandId}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setActiveTab('commands');
                setSelectedCommandId(latestQueuedNotice.commandId);
                setLatestQueuedNotice(null);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-primary-600 hover:bg-primary-700 text-white rounded-xl transition-colors shadow-sm"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>متابعة حالة الأمر في الراوتر</span>
            </button>
            <button
              onClick={() => setLatestQueuedNotice(null)}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline px-2 py-1"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* KPI Cards Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">إجمالي المشتركين</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-2">
            {accounts.length}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">مشترك مسجل في قاعدة البيانات</span>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">الحسابات النشطة</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
            {activeSubscribersCount}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">جاهز للاتصال بالإنترنت</span>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">الجلسات المتصلة الآن</span>
            <div className="w-8 h-8 rounded-xl bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 flex items-center justify-center">
              <Radio className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-violet-600 dark:text-violet-400 mt-2">
            {sessions.length}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">متصل فعلياً على الراوتر</span>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">باقات السرعة</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-2">
            {profiles.length}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">بروفايل سرعة مُعرّف</span>
        </div>
      </div>

      {/* Tabs Switcher Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700/60 pb-px overflow-x-auto">
        <button
          onClick={() => setActiveTab('accounts')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'accounts'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>حسابات المشتركين</span>
          <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
            {accounts.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('profiles')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'profiles'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>بروفايلات السرعة والباقات</span>
          <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
            {profiles.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('sessions')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'sessions'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>الجلسات النشطة المباشرة</span>
          <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-mono">
            {sessions.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('commands')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'commands'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>حالة أوامر الراوتر والوكيل</span>
          {trackedCommands.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-primary-100 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300 font-mono">
              {trackedCommands.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Panels */}
      {!selectedDeviceId ? (
        <div className="py-20 text-center text-slate-400 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60">
          <RouterIcon className="w-12 h-12 mx-auto mb-3 text-slate-300 stroke-[1.5]" />
          <p className="font-semibold text-slate-700 dark:text-slate-300">
            يرجى اختيار جهاز راوتر للمتابعة
          </p>
          <p className="text-xs mt-1">حدد الراوتر من القائمة المنسدلة في الأعلى لعرض بيانات PPPoE</p>
        </div>
      ) : (
        <div>
          {activeTab === 'accounts' && (
            <PppoeAccountsTab
              deviceId={selectedDeviceId}
              accounts={accounts}
              profiles={profiles}
              loading={loadingAccounts}
              onRefresh={fetchAccounts}
              onCommandQueued={handleCommandQueued}
            />
          )}

          {activeTab === 'profiles' && (
            <PppoeProfilesTab
              deviceId={selectedDeviceId}
              profiles={profiles}
              loading={loadingProfiles}
              onRefresh={fetchProfiles}
              onCommandQueued={handleCommandQueued}
            />
          )}

          {activeTab === 'sessions' && (
            <PppoeSessionsTab
              deviceId={selectedDeviceId}
              sessions={sessions}
              loading={loadingSessions}
              onRefresh={fetchSessions}
              onCommandQueued={handleCommandQueued}
            />
          )}

          {activeTab === 'commands' && (
            <PppoeCommandsTab
              deviceId={selectedDeviceId}
              trackedCommands={trackedCommands}
              selectedCommandId={selectedCommandId}
              onSelectCommand={(cmdId) => setSelectedCommandId(cmdId)}
            />
          )}
        </div>
      )}
    </div>
  );
};
