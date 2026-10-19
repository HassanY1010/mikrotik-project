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
          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}>
            <CheckCircle2 size={14} />
            <span>تم التنفيذ على الراوتر بنجاح (COMPLETED)</span>
          </span>
        );
      case 'FAILED':
        return (
          <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}>
            <XCircle size={14} />
            <span>فشل التنفيذ على الراوتر (FAILED)</span>
          </span>
        );
      case 'DISPATCHED':
        return (
          <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}>
            <Send size={14} />
            <span>تم الإرسال لـ Windows Agent (قيد المعالجة)</span>
          </span>
        );
      case 'PENDING':
        return (
          <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}>
            <Hourglass size={14} className="spin" />
            <span>بانتظار استلام Agent (طابور الانتظار)</span>
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="badge badge-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}>
            <AlertCircle size={14} />
            <span>انتهت مهلة الأمر قبل الوصول للراوتر</span>
          </span>
        );
      default:
        return (
          <span className="badge badge-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Banner explaining Agent Architecture */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.85rem',
          padding: '1rem 1.25rem',
          backgroundColor: 'rgba(56, 189, 248, 0.08)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          borderRadius: 'var(--radius-lg)',
          color: 'var(--text-primary)',
        }}
      >
        <Info size={20} style={{ color: '#38BDF8', flexShrink: 0, marginTop: '0.15rem' }} />
        <div style={{ fontSize: '0.85rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>نظام أوامر MikroTik المعتمد:</strong> عند إنشاء أو تعديل بروفايلات واشتراكات
          PPPoE، يقوم النظام بوضع أمر مشفر في طابور الوكيل (Windows LAN Agent). لا تُعتبر العملية
          ناجحة على الراوتر حتى تتغير حالة الأمر من <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#38BDF8' }}>PENDING / DISPATCHED</span>{' '}
          إلى <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--success)' }}>COMPLETED</span>.
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 1fr) 2fr',
          gap: '1.25rem',
          alignItems: 'start',
        }}
      >
        {/* Left Column: Recent Queued Commands in this session */}
        <div
          className="card"
          style={{
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3
              style={{
                fontSize: '0.95rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                margin: 0,
                color: 'var(--text-primary)',
              }}
            >
              <Terminal size={16} color="var(--primary)" />
              <span>الأوامر المجدولة مؤخراً</span>
            </h3>
            <span className="badge badge-secondary" style={{ fontFamily: 'monospace' }}>
              {trackedCommands.length} أمر
            </span>
          </div>

          {/* Manual Command ID search */}
          <form onSubmit={handleManualSearch} style={{ position: 'relative' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                right: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              placeholder="ابحث بمعرف الأمر (UUID)..."
              value={manualInputId}
              onChange={(e) => setManualInputId(e.target.value)}
              className="form-control"
              style={{
                paddingRight: '2.2rem',
                paddingLeft: '0.75rem',
                fontSize: '0.8rem',
                fontFamily: 'monospace',
              }}
            />
          </form>

          {/* List of tracked commands */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              maxHeight: 460,
              overflowY: 'auto',
              paddingLeft: '0.2rem',
            }}
          >
            {trackedCommands.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '2.5rem 1rem',
                  fontSize: '0.85rem',
                  color: 'var(--text-muted)',
                  border: '1px dashed var(--border)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
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
                    style={{
                      width: '100%',
                      textAlign: 'right',
                      padding: '0.75rem 0.85rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: isSelected ? 'var(--primary-light)' : 'var(--bg-card-alt)',
                      border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        color: isSelected ? 'var(--primary)' : 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {cmd.description}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        fontFamily: 'monospace',
                      }}
                    >
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

        {/* Right Column: Selected Command Monitor */}
        <div
          className="card"
          style={{
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
              borderBottom: '1px solid var(--border)',
              paddingBottom: '1rem',
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  margin: 0,
                  color: 'var(--text-primary)',
                }}
              >
                <Zap size={20} color="#F59E0B" />
                <span>متابعة تفاصيل الأمر وحالة الراوتر</span>
              </h2>
              {activeCommandId && (
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    fontFamily: 'monospace',
                    marginTop: '0.35rem',
                  }}
                >
                  معرّف الأمر: {activeCommandId}
                </div>
              )}
            </div>

            {activeCommandId && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={autoPoll}
                    onChange={(e) => setAutoPoll(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>تحديث تلقائي (Polling)</span>
                </label>

                <button
                  onClick={() => fetchStatus(activeCommandId)}
                  disabled={loading}
                  className="btn btn-secondary"
                  style={{ padding: '0.4rem 0.65rem' }}
                  title="تحديث الحالة الآن"
                >
                  <RefreshCw size={14} className={loading ? 'spin' : ''} />
                </button>
              </div>
            )}
          </div>

          {!activeCommandId ? (
            <div
              style={{
                textAlign: 'center',
                padding: '4rem 2rem',
                color: 'var(--text-muted)',
              }}
            >
              <Terminal size={42} style={{ margin: '0 auto 1rem auto', color: 'var(--border-light)' }} />
              <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', margin: 0 }}>
                لم يتم اختيار أمر لمتابعته
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                اختر أمراً من القائمة الجانبية أو أدخل معرف الأمر أعلاه للتحقق من وصوله وتطبيقه على الراوتر.
              </p>
            </div>
          ) : loading && !commandDetails ? (
            <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)' }}>
              <RefreshCw size={28} className="spin" style={{ margin: '0 auto 0.75rem auto' }} />
              <p style={{ margin: 0, fontWeight: 600 }}>جاري الاستعلام عن نتيجة الأمر من الخادم...</p>
            </div>
          ) : !commandDetails ? (
            <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
              <AlertCircle size={36} color="var(--danger)" style={{ margin: '0 auto 0.75rem auto' }} />
              <p style={{ fontWeight: 700, color: 'var(--danger)', margin: 0 }}>تعذر العثور على الأمر المطلوب</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                تأكد من صحة معرف الأمر وتطابقه مع الراوتر والمستأجر المصرح بهما.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Status Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem',
                  padding: '1rem 1.25rem',
                  backgroundColor: 'var(--bg-card-alt)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                    حالة التنفيذ الحالية
                  </span>
                  <div>{getStatusBadge(commandDetails.status)}</div>
                </div>

                <div style={{ textAlign: 'left' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                    نوع العملية (Type)
                  </span>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    {translateCommandType(commandDetails.type)}
                  </div>
                </div>
              </div>

              {/* Error Box if FAILED */}
              {commandDetails.errorMessage && (
                <div
                  style={{
                    padding: '1rem',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                    <XCircle size={16} />
                    <span>رسالة الخطأ الصادرة من الوكيل / الراوتر:</span>
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      fontSize: '0.8rem',
                      fontFamily: 'monospace',
                      color: 'var(--danger)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {commandDetails.errorMessage}
                  </pre>
                </div>
              )}

              {/* Metadata Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '0.85rem',
                  fontSize: '0.85rem',
                }}
              >
                <div
                  style={{
                    padding: '0.85rem 1rem',
                    backgroundColor: 'var(--bg-card-alt)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>معرف العملية (Operation ID):</span>
                  <div style={{ fontFamily: 'monospace', color: 'var(--text-primary)', marginTop: '0.25rem', wordBreak: 'break-all' }}>
                    {commandDetails.operationId}
                  </div>
                </div>

                <div
                  style={{
                    padding: '0.85rem 1rem',
                    backgroundColor: 'var(--bg-card-alt)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>معرف الوكيل (Agent ID):</span>
                  <div style={{ fontFamily: 'monospace', color: 'var(--text-primary)', marginTop: '0.25rem', wordBreak: 'break-all' }}>
                    {commandDetails.agentId}
                  </div>
                </div>

                <div
                  style={{
                    padding: '0.85rem 1rem',
                    backgroundColor: 'var(--bg-card-alt)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>وقت الإنشاء والجدولة:</span>
                  <div style={{ color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                    {new Date(commandDetails.createdAt).toLocaleString('ar-EG')}
                  </div>
                </div>

                <div
                  style={{
                    padding: '0.85rem 1rem',
                    backgroundColor: 'var(--bg-card-alt)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>وقت الإرسال للوكيل:</span>
                  <div style={{ color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                    {commandDetails.dispatchedAt
                      ? new Date(commandDetails.dispatchedAt).toLocaleString('ar-EG')
                      : 'لم يتم الإرسال بعد (في الانتظار)'}
                  </div>
                </div>

                <div
                  style={{
                    padding: '0.85rem 1rem',
                    backgroundColor: 'var(--bg-card-alt)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>وقت الاكتمال:</span>
                  <div style={{ color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                    {commandDetails.completedAt
                      ? new Date(commandDetails.completedAt).toLocaleString('ar-EG')
                      : 'غير مكتمل بعد'}
                  </div>
                </div>

                <div
                  style={{
                    padding: '0.85rem 1rem',
                    backgroundColor: 'var(--bg-card-alt)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>وقت انتهاء الصلاحية:</span>
                  <div style={{ color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                    {new Date(commandDetails.expiresAt).toLocaleString('ar-EG')}
                  </div>
                </div>
              </div>

              {/* Collapsible Technical Payload */}
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowPayloadDetails(!showPayloadDetails)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.85rem 1rem',
                    backgroundColor: 'var(--bg-card-alt)',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Terminal size={16} color="var(--primary)" />
                    <span>عرض البيانات التقنية (Payload & Result Data)</span>
                  </span>
                  {showPayloadDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {showPayloadDetails && (
                  <div
                    style={{
                      padding: '1rem',
                      backgroundColor: 'var(--bg-app)',
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      fontSize: '0.8rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.85rem',
                    }}
                  >
                    <div>
                      <div style={{ color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>// Payload المدخل:</div>
                      <pre
                        style={{
                          margin: 0,
                          backgroundColor: 'var(--bg-card-alt)',
                          padding: '0.75rem',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-primary)',
                          overflowX: 'auto',
                        }}
                      >
                        {JSON.stringify(commandDetails.payload, null, 2)}
                      </pre>
                    </div>

                    {commandDetails.result && (
                      <div>
                        <div style={{ color: 'var(--success)', marginBottom: '0.35rem' }}>// Result المخرجات من الراوتر:</div>
                        <pre
                          style={{
                            margin: 0,
                            backgroundColor: 'var(--bg-card-alt)',
                            padding: '0.75rem',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-primary)',
                            overflowX: 'auto',
                          }}
                        >
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
