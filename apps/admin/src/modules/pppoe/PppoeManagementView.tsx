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

  // 3. Fetch Accounts for selected device (limit=100)
  const fetchAccounts = useCallback(async () => {
    if (!selectedDeviceId) return;
    setLoadingAccounts(true);
    try {
      const data = await apiClient.get<{
        items?: PppoeAccountItem[];
        data?: PppoeAccountItem[];
        pagination?: any;
      }>(`/pppoe/devices/${selectedDeviceId}/accounts?limit=100`);

      const list = data?.items || data?.data;
      setAccounts(Array.isArray(list) ? list : []);
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
        } else if (syncFromRouter) {
          showToast('تنبيه: لا يوجد وكيل SudaFi Agent نشط مرتبط بهذا الراوتر لإرسال أمر الاستعلام المباشر', 'warning');
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page Header & Device Selector */}
      <div
        className="card"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1.25rem',
          padding: '1.25rem 1.5rem',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '1.4rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              color: 'var(--text-primary)',
              margin: 0,
            }}
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
              <Network size={24} />
            </div>
            <span>إدارة اشتراكات النطاق العريض (PPPoE)</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.35rem', marginBottom: 0 }}>
            إدارة المشتركين المنزليين وباقات السرعة والجلسات المتصلة وأوامر المزامنة على راوترات MikroTik
          </p>
        </div>

        {/* Device Selector Card */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            backgroundColor: 'var(--bg-card-alt)',
            padding: '0.5rem 0.85rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>
            <RouterIcon size={16} color="var(--primary)" />
            <span>الراوتر المستهدف:</span>
          </div>

          {devicesLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <RefreshCw size={14} className="spin" />
              <span>جاري التحميل...</span>
            </div>
          ) : devices.length === 0 ? (
            <span style={{ fontSize: '0.85rem', color: 'var(--danger)', fontWeight: 600 }}>لا يوجد راوتر متاح</span>
          ) : (
            <select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              className="select"
              style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                padding: '0.35rem 0.75rem',
                width: 'auto',
                minWidth: '220px',
              }}
            >
              {devices.map((dev) => (
                <option key={dev.id} value={dev.id}>
                  {dev.name} ({dev.host || 'LAN Agent'}) {dev.status === 'ONLINE' ? '🟢 متصل' : '⚪ غير متصل'}
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
            className="btn btn-outline"
            style={{ padding: '0.45rem', minWidth: 'auto', borderRadius: 'var(--radius-md)' }}
            title="تحديث جميع بيانات الراوتر"
          >
            <RefreshCw
              size={15}
              className={loadingProfiles || loadingAccounts || loadingSessions ? 'spin' : ''}
            />
          </button>
        </div>
      </div>

      {/* No Device Warning */}
      {!devicesLoading && devices.length === 0 && (
        <div
          className="card"
          style={{
            backgroundColor: 'var(--warning-bg)',
            borderColor: 'var(--warning)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '1rem 1.25rem',
          }}
        >
          <AlertCircle size={24} color="var(--warning)" style={{ flexShrink: 0 }} />
          <div>
            <h3 style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', margin: 0 }}>
              لم يتم العثور على أجهزة راوتر مسجلة في هذا الحساب
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem', marginBottom: 0 }}>
              لاستخدام خدمات PPPoE، يجب أولاً إضافة راوتر MikroTik وربطه مع Windows LAN Agent من قسم "أجهزة وتوجيهات ميكروتك".
            </p>
          </div>
        </div>
      )}

      {/* Queued Command Notification Banner */}
      {latestQueuedNotice && (
        <div
          className="card"
          style={{
            backgroundColor: 'var(--primary-light)',
            borderColor: 'var(--primary)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            padding: '0.85rem 1.25rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: 'var(--primary)',
                boxShadow: '0 0 10px var(--primary)',
              }}
            />
            <div>
              <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                تمت جدولة أمر راوتر جديد: {latestQueuedNotice.description}
              </p>
              <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-secondary)', marginTop: '0.15rem', marginBottom: 0 }}>
                معرف الأمر: {latestQueuedNotice.commandId}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={() => {
                setActiveTab('commands');
                setSelectedCommandId(latestQueuedNotice.commandId);
                setLatestQueuedNotice(null);
              }}
              className="btn btn-primary"
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
            >
              <Terminal size={14} />
              <span>متابعة حالة الأمر في الراوتر</span>
            </button>
            <button
              onClick={() => setLatestQueuedNotice(null)}
              className="btn btn-outline"
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* KPI Cards Overview */}
      <div className="grid-cols-4">
        <div className="stat-card">
          <div
            className="stat-icon"
            style={{ backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38BDF8' }}
          >
            <Users size={22} />
          </div>
          <div>
            <div className="stat-value">{accounts.length}</div>
            <div className="stat-label">إجمالي المشتركين</div>
          </div>
        </div>

        <div className="stat-card">
          <div
            className="stat-icon"
            style={{ backgroundColor: 'var(--success-bg)', color: 'var(--success)' }}
          >
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div className="stat-value" style={{ color: 'var(--success)' }}>
              {activeSubscribersCount}
            </div>
            <div className="stat-label">الحسابات النشطة</div>
          </div>
        </div>

        <div className="stat-card">
          <div
            className="stat-icon"
            style={{ backgroundColor: 'rgba(168, 85, 247, 0.15)', color: '#A855F7' }}
          >
            <Radio size={22} />
          </div>
          <div>
            <div className="stat-value" style={{ color: '#A855F7' }}>
              {sessions.length}
            </div>
            <div className="stat-label">الجلسات المتصلة الآن</div>
          </div>
        </div>

        <div className="stat-card">
          <div
            className="stat-icon"
            style={{ backgroundColor: 'var(--warning-bg)', color: 'var(--warning)' }}
          >
            <Layers size={22} />
          </div>
          <div>
            <div className="stat-value" style={{ color: 'var(--warning)' }}>
              {profiles.length}
            </div>
            <div className="stat-label">باقات السرعة المعرفة</div>
          </div>
        </div>
      </div>

      {/* Modern Tabs Navigation Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          borderBottom: '1px solid var(--border)',
          overflowX: 'auto',
          paddingBottom: '0.25rem',
        }}
      >
        <button
          onClick={() => setActiveTab('accounts')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.75rem 1.25rem',
            borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
            backgroundColor: activeTab === 'accounts' ? 'var(--bg-card)' : 'transparent',
            color: activeTab === 'accounts' ? 'var(--primary)' : 'var(--text-secondary)',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            borderBottom: activeTab === 'accounts' ? '3px solid var(--primary)' : '3px solid transparent',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: 'pointer',
            transition: 'var(--transition)',
            whiteSpace: 'nowrap',
          }}
        >
          <Users size={16} />
          <span>حسابات المشتركين</span>
          <span
            style={{
              padding: '0.15rem 0.5rem',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.75rem',
              backgroundColor: activeTab === 'accounts' ? 'var(--primary-light)' : 'var(--bg-input)',
              color: activeTab === 'accounts' ? 'var(--primary)' : 'var(--text-muted)',
              fontFamily: 'monospace',
              fontWeight: 700,
            }}
          >
            {accounts.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('profiles')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.75rem 1.25rem',
            borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
            backgroundColor: activeTab === 'profiles' ? 'var(--bg-card)' : 'transparent',
            color: activeTab === 'profiles' ? 'var(--primary)' : 'var(--text-secondary)',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            borderBottom: activeTab === 'profiles' ? '3px solid var(--primary)' : '3px solid transparent',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: 'pointer',
            transition: 'var(--transition)',
            whiteSpace: 'nowrap',
          }}
        >
          <Layers size={16} />
          <span>بروفايلات السرعة والباقات</span>
          <span
            style={{
              padding: '0.15rem 0.5rem',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.75rem',
              backgroundColor: activeTab === 'profiles' ? 'var(--primary-light)' : 'var(--bg-input)',
              color: activeTab === 'profiles' ? 'var(--primary)' : 'var(--text-muted)',
              fontFamily: 'monospace',
              fontWeight: 700,
            }}
          >
            {profiles.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('sessions')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.75rem 1.25rem',
            borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
            backgroundColor: activeTab === 'sessions' ? 'var(--bg-card)' : 'transparent',
            color: activeTab === 'sessions' ? '#A855F7' : 'var(--text-secondary)',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            borderBottom: activeTab === 'sessions' ? '3px solid #A855F7' : '3px solid transparent',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: 'pointer',
            transition: 'var(--transition)',
            whiteSpace: 'nowrap',
          }}
        >
          <Radio size={16} />
          <span>الجلسات النشطة المباشرة</span>
          <span
            style={{
              padding: '0.15rem 0.5rem',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.75rem',
              backgroundColor: 'rgba(168, 85, 247, 0.15)',
              color: '#A855F7',
              fontFamily: 'monospace',
              fontWeight: 700,
            }}
          >
            {sessions.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('commands')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.75rem 1.25rem',
            borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
            backgroundColor: activeTab === 'commands' ? 'var(--bg-card)' : 'transparent',
            color: activeTab === 'commands' ? 'var(--primary)' : 'var(--text-secondary)',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            borderBottom: activeTab === 'commands' ? '3px solid var(--primary)' : '3px solid transparent',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: 'pointer',
            transition: 'var(--transition)',
            whiteSpace: 'nowrap',
          }}
        >
          <Terminal size={16} />
          <span>حالة أوامر الراوتر والوكيل</span>
          {trackedCommands.length > 0 && (
            <span
              style={{
                padding: '0.15rem 0.5rem',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.75rem',
                backgroundColor: 'var(--primary-light)',
                color: 'var(--primary)',
                fontFamily: 'monospace',
                fontWeight: 700,
              }}
            >
              {trackedCommands.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Panels */}
      {!selectedDeviceId ? (
        <div
          className="card"
          style={{
            textAlign: 'center',
            padding: '4rem 2rem',
            color: 'var(--text-muted)',
          }}
        >
          <RouterIcon size={48} color="var(--border-light)" style={{ margin: '0 auto 1rem auto' }} />
          <p style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)', margin: 0 }}>
            يرجى اختيار جهاز راوتر للمتابعة
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.4rem', marginBottom: 0 }}>
            حدد الراوتر من القائمة المنسدلة في الأعلى لعرض بيانات واشتراكات PPPoE
          </p>
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
