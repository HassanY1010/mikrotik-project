import React, { useState, useEffect, useMemo } from 'react';
import {
  Palette,
  Smartphone,
  Monitor,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Save,
  Layers,
  Globe,
} from 'lucide-react';
import { apiClient } from '../../core/api/api-client';
import { DeviceItem, HotspotPortalConfigItem, AgentCommandStatusItem } from '../../core/types/view-models';

const PRESET_STYLES = {
  MODERN_DARK: {
    label: 'الوضع الداكن (Modern Dark)',
    primaryColor: '#0EA5E9',
    accentColor: '#10B981',
    backgroundColor: '#0F172A',
    cardColor: '#1E293B',
    textColor: '#F8FAFC',
    subtitle: 'أدخل كود الكرت للاتصال الفوري فائق السرعة',
  },
  STARLINK_CYAN: {
    label: 'ستارلينك الفضائي (Starlink Cyan)',
    primaryColor: '#06B6D4',
    accentColor: '#3B82F6',
    backgroundColor: '#0B132B',
    cardColor: '#1C2541',
    textColor: '#F1F5F9',
    subtitle: 'اتصال فضائي عالي السرعة عبر أقمار Starlink',
  },
  SUNSET_ORANGE: {
    label: 'الغروب الذهبي (Sunset Gold)',
    primaryColor: '#F59E0B',
    accentColor: '#EF4444',
    backgroundColor: '#18181B',
    cardColor: '#27272A',
    textColor: '#FAFAFA',
    subtitle: 'إنترنت غير محدود بأفضل استقرار وسرعة',
  },
  MINIMAL_LIGHT: {
    label: 'الأبيض الهادئ (Minimal Clean)',
    primaryColor: '#2563EB',
    accentColor: '#10B981',
    backgroundColor: '#F8FAFC',
    cardColor: '#FFFFFF',
    textColor: '#0F172A',
    subtitle: 'أدخل رقم الكرت لبدء التصفح الفوري',
  },
};

export const HotspotPortalDesignerView: React.FC = () => {
  const [viewport, setViewport] = useState<'mobile' | 'desktop'>('mobile');
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Portal form state
  const [templateId, setTemplateId] = useState<string>('');
  const [name, setName] = useState<string>('القالب المخصص للهوتسبوت');
  const [themePreset, setThemePreset] = useState<'MODERN_DARK' | 'STARLINK_CYAN' | 'SUNSET_ORANGE' | 'MINIMAL_LIGHT'>('MODERN_DARK');
  const [networkName, setNetworkName] = useState<string>('شبكة النجوم للإنترنت');
  const [title, setTitle] = useState<string>('مرحباً بكم في شبكتنا');
  const [subtitle, setSubtitle] = useState<string>('أدخل كود الكرت للاتصال الفوري');
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [primaryColor, setPrimaryColor] = useState<string>('#0EA5E9');
  const [accentColor, setAccentColor] = useState<string>('#10B981');
  const [backgroundColor, setBackgroundColor] = useState<string>('#0F172A');
  const [cardColor, setCardColor] = useState<string>('#1E293B');
  const [textColor, setTextColor] = useState<string>('#F8FAFC');
  const [loginMethod, setLoginMethod] = useState<'VOUCHER' | 'USER_PASS' | 'BOTH'>('VOUCHER');
  const [showRemainingTime, setShowRemainingTime] = useState<boolean>(true);
  const [contactPhone, setContactPhone] = useState<string>('0912345678');
  const [termsText, setTermsText] = useState<string>('الاستخدام مخصص لعملاء الشبكة وفق الشروط والأحكام');
  const [footerText, setFooterText] = useState<string>('مدعوم بواسطة منصة SudaFi');
  const [customCss, setCustomCss] = useState<string>('');

  // Publish to Router Modal & Tracking
  const [publishModalOpen, setPublishModalOpen] = useState<boolean>(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [targetDirectory, setTargetDirectory] = useState<string>('hotspot');
  const [applyToProfile, setApplyToProfile] = useState<string>('hsprof1');
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [commandStatus, setCommandStatus] = useState<AgentCommandStatusItem | null>(null);

  // Load initial templates and devices
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [devRes, tplRes] = await Promise.all([
        apiClient.get<DeviceItem[]>('/devices').catch(() => [] as DeviceItem[]),
        apiClient.get<HotspotPortalConfigItem[]>('/portal/templates').catch(() => [] as HotspotPortalConfigItem[]),
      ]);

      const devList = Array.isArray(devRes) ? devRes : [];
      setDevices(devList);
      if (devList.length > 0) {
        setSelectedDeviceId(devList[0].id);
      }

      const tplList = Array.isArray(tplRes) ? tplRes : [];
      if (tplList.length > 0) {
        const t = tplList[0];
        setTemplateId(t.id);
        setName(t.name);
        setThemePreset(t.themePreset);
        setNetworkName(t.networkName);
        setTitle(t.title);
        setSubtitle(t.subtitle);
        setLogoUrl(t.logoUrl || '');
        setPrimaryColor(t.primaryColor);
        setAccentColor(t.accentColor);
        setBackgroundColor(t.backgroundColor);
        setCardColor(t.cardColor);
        setTextColor(t.textColor);
        setLoginMethod(t.loginMethod);
        setShowRemainingTime(t.showRemainingTime);
        setContactPhone(t.contactPhone || '');
        setTermsText(t.termsText || '');
        setFooterText(t.footerText || '');
        setCustomCss(t.customCss || '');
      }
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  };

  // Preset Selection
  const applyPreset = (presetKey: keyof typeof PRESET_STYLES) => {
    const p = PRESET_STYLES[presetKey];
    setThemePreset(presetKey);
    setPrimaryColor(p.primaryColor);
    setAccentColor(p.accentColor);
    setBackgroundColor(p.backgroundColor);
    setCardColor(p.cardColor);
    setTextColor(p.textColor);
    setSubtitle(p.subtitle);
  };

  // Compile Live Preview HTML
  const compiledPreviewHtml = useMemo(() => {
    const isVoucherOnly = loginMethod === 'VOUCHER';
    const isUserPass = loginMethod === 'USER_PASS';

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: ${backgroundColor};
      color: ${textColor};
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 16px;
      line-height: 1.5;
    }
    .portal-card {
      background: ${cardColor};
      border-radius: 20px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
      width: 100%;
      max-width: 380px;
      padding: 28px 22px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      position: relative;
      overflow: hidden;
    }
    .portal-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0; height: 4px;
      background: linear-gradient(90deg, ${primaryColor}, ${accentColor});
    }
    .brand-header { text-align: center; margin-bottom: 22px; }
    .brand-logo { max-width: 70px; max-height: 70px; margin-bottom: 10px; border-radius: 14px; display: inline-block; }
    .network-badge {
      display: inline-block;
      padding: 4px 12px;
      background: rgba(255, 255, 255, 0.06);
      border-radius: 50px;
      font-size: 12px;
      font-weight: 600;
      color: ${primaryColor};
      margin-bottom: 8px;
    }
    .portal-title { font-size: 19px; font-weight: 700; color: ${textColor}; margin-bottom: 4px; }
    .portal-subtitle { font-size: 12px; color: rgba(255, 255, 255, 0.65); }
    .form-group { margin-bottom: 14px; }
    .form-label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 6px; color: rgba(255, 255, 255, 0.85); }
    .form-input {
      width: 100%;
      padding: 11px 14px;
      background: rgba(0, 0, 0, 0.25);
      border: 1.5px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      color: #FFFFFF;
      font-size: 15px;
      outline: none;
      text-align: center;
    }
    .submit-btn {
      width: 100%;
      padding: 13px;
      background: linear-gradient(135deg, ${primaryColor}, ${accentColor});
      border: none;
      border-radius: 12px;
      color: #FFFFFF;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
      margin-top: 6px;
    }
    .support-bar {
      margin-top: 18px;
      padding-top: 14px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 11px;
      color: rgba(255, 255, 255, 0.6);
      text-align: center;
    }
    .support-phone { color: ${accentColor}; font-weight: 600; direction: ltr; display: inline-block; }
    .footer-brand { margin-top: 20px; font-size: 10px; color: rgba(255, 255, 255, 0.4); text-align: center; }
    ${customCss}
  </style>
</head>
<body>
  <div class="portal-card">
    <div class="brand-header">
      ${logoUrl ? `<img class="brand-logo" src="${logoUrl}" alt="Logo">` : ''}
      <div><span class="network-badge">${networkName || 'اسم الشبكة'}</span></div>
      <h1 class="portal-title">${title || 'تسجيل الدخول'}</h1>
      <p class="portal-subtitle">${subtitle || ''}</p>
    </div>

    <form onsubmit="event.preventDefault(); alert('معاينة حية: إدخال الكرت يعمل بنجاح!');">
      ${isVoucherOnly ? `
      <div class="form-group">
        <label class="form-label">كود كرت الإنترنت</label>
        <input class="form-input" type="text" placeholder="مثال: 78945612" value="98421035">
      </div>
      ` : isUserPass ? `
      <div class="form-group">
        <label class="form-label">اسم المستخدم</label>
        <input class="form-input" type="text" placeholder="اسم المستخدم" value="user_01">
      </div>
      <div class="form-group">
        <label class="form-label">كلمة المرور</label>
        <input class="form-input" type="password" value="••••••••">
      </div>
      ` : `
      <div class="form-group">
        <label class="form-label">اسم المستخدم أو كود الكرت</label>
        <input class="form-input" type="text" placeholder="أدخل الحساب أو الكرت" value="78945612">
      </div>
      <div class="form-group">
        <label class="form-label">كلمة المرور (اختيارية للكروت)</label>
        <input class="form-input" type="password" placeholder="••••••••">
      </div>
      `}
      <button type="submit" class="submit-btn">تسجيل الدخول والاتصال</button>
    </form>

    ${(contactPhone || termsText) ? `
    <div class="support-bar">
      ${contactPhone ? `<div>خدمة العملاء: <span class="support-phone">${contactPhone}</span></div>` : ''}
      ${termsText ? `<div style="margin-top: 4px;">${termsText}</div>` : ''}
    </div>
    ` : ''}
  </div>
  <div class="footer-brand">${footerText || ''}</div>
</body>
</html>`;
  }, [
    backgroundColor,
    cardColor,
    textColor,
    primaryColor,
    accentColor,
    networkName,
    title,
    subtitle,
    logoUrl,
    loginMethod,
    contactPhone,
    termsText,
    footerText,
    customCss,
  ]);

  // Save template handler
  const handleSaveTemplate = async () => {
    setSaving(true);
    setToastMessage(null);
    try {
      const payload = {
        name,
        themePreset,
        networkName,
        title,
        subtitle,
        logoUrl: logoUrl || undefined,
        primaryColor,
        accentColor,
        backgroundColor,
        cardColor,
        textColor,
        loginMethod,
        showRemainingTime,
        contactPhone: contactPhone || undefined,
        termsText: termsText || undefined,
        footerText: footerText || undefined,
        customCss: customCss || undefined,
        isDefault: true,
      };

      if (templateId) {
        await apiClient.patch(`/portal/templates/${templateId}`, payload);
      } else {
        const res = await apiClient.post<HotspotPortalConfigItem>('/portal/templates', payload);
        if (res?.id) setTemplateId(res.id);
      }

      setToastMessage({ text: 'تم حفظ تصميم صفحة الدخول بنجاح!', type: 'success' });
    } catch (err: any) {
      setToastMessage({ text: err.message || 'فشل في حفظ التصميم', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Publish to Router via LAN Agent
  const handlePublishToRouter = async () => {
    if (!selectedDeviceId) {
      setToastMessage({ text: 'يرجى اختيار جهاز راوتر ميكروتك أولاً', type: 'error' });
      return;
    }

    setIsPublishing(true);
    setCommandStatus(null);
    try {
      // 1. First ensure current changes are saved
      await handleSaveTemplate();

      // 2. Dispatch publish command to API -> Agent queue
      const res = await apiClient.post<{
        operationId: string;
        queuedCommandId: string;
        status: string;
        message: string;
      }>(`/portal/devices/${selectedDeviceId}/publish`, {
        templateId: templateId || undefined,
        directoryName: targetDirectory || 'hotspot',
        applyToProfile: applyToProfile || undefined,
      });

      const cmdId = res?.queuedCommandId || res?.operationId;
      setToastMessage({ text: 'تم إرسال أمر النشر إلى طابور الوكيل بنجاح! جاري المتابعة...', type: 'success' });

      // Poll command status
      if (cmdId) {
        pollCommandStatus(cmdId);
      } else {
        setIsPublishing(false);
      }
    } catch (err: any) {
      setToastMessage({ text: err.message || 'فشل في نشر التصميم إلى الراوتر', type: 'error' });
      setIsPublishing(false);
    }
  };

  const pollCommandStatus = (cmdId: string) => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const cmdRes = await apiClient.get<AgentCommandStatusItem>(`/agent/commands/${cmdId}`);
        const cmd = cmdRes;
        if (cmd) {
          setCommandStatus(cmd);
          if (cmd.status === 'COMPLETED') {
            clearInterval(interval);
            setIsPublishing(false);
            setToastMessage({ text: 'اكتمل نشر صفحة تسجيل الدخول على الراوتر بنجاح! (COMPLETED)', type: 'success' });
          } else if (cmd.status === 'FAILED' || cmd.status === 'EXPIRED') {
            clearInterval(interval);
            setIsPublishing(false);
            setToastMessage({
              text: `فشل التنفيذ على الراوتر: ${cmd.errorMessage || 'خطأ غير معروف'}`,
              type: 'error',
            });
          }
        }
      } catch {
        // Polling retry
      }

      if (attempts >= 15) {
        clearInterval(interval);
        setIsPublishing(false);
      }
    }, 2000);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <RefreshCw className="animate-spin text-sky-500" size={32} />
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1440px', margin: '0 auto', direction: 'rtl' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <div style={{ padding: '0.5rem', background: 'rgba(14, 165, 233, 0.15)', borderRadius: '10px' }}>
              <Palette className="text-sky-400" size={24} />
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#FFFFFF', margin: 0 }}>
              مصمم صفحات الدخول للهوتسبوت (HotSpot Captive Portal)
            </h1>
          </div>
          <p style={{ color: '#94A3B8', fontSize: '0.875rem', margin: 0 }}>
            تخصيص الواجهة المرئية لصفحة تسجيل الدخول ونشرها مباشرة على راوترات MikroTik عبر الوكيل المحلي.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={handleSaveTemplate}
            disabled={saving}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.625rem 1.25rem',
              background: '#334155',
              color: '#FFFFFF',
              border: '1px solid #475569',
              borderRadius: '10px',
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            <Save size={18} />
            {saving ? 'جاري الحفظ...' : 'حفظ التصميم'}
          </button>

          <button
            onClick={() => setPublishModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.625rem 1.25rem',
              background: 'linear-gradient(135deg, #0EA5E9, #10B981)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '10px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(14, 165, 233, 0.25)',
            }}
          >
            <UploadCloud size={18} />
            نشر على الراوتر (Publish)
          </button>
        </div>
      </div>

      {/* Toast Alert */}
      {toastMessage && (
        <div
          style={{
            padding: '0.875rem 1.25rem',
            borderRadius: '10px',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            background: toastMessage.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${toastMessage.type === 'success' ? '#10B981' : '#EF4444'}`,
            color: toastMessage.type === 'success' ? '#34D399' : '#F87171',
          }}
        >
          {toastMessage.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Main Split Layout: Editor & Live Preview */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Left Column: Visual Customizer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Preset Themes Card */}
          <div style={{ background: '#1E293B', borderRadius: '16px', padding: '1.25rem', border: '1px solid #334155' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Sparkles className="text-amber-400" size={18} />
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#FFFFFF', margin: 0 }}>القوالب الجاهزة (Design Presets)</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
              {Object.entries(PRESET_STYLES).map(([key, item]) => {
                const isSelected = themePreset === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyPreset(key as any)}
                    style={{
                      padding: '0.875rem',
                      background: isSelected ? 'rgba(14, 165, 233, 0.12)' : '#0F172A',
                      border: `1.5px solid ${isSelected ? '#0EA5E9' : '#334155'}`,
                      borderRadius: '12px',
                      cursor: 'pointer',
                      textAlign: 'right',
                    }}
                  >
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: isSelected ? '#38BDF8' : '#F8FAFC', marginBottom: '0.35rem' }}>
                      {item.label}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <span style={{ width: 14, height: 14, borderRadius: '50%', background: item.primaryColor }} />
                      <span style={{ width: 14, height: 14, borderRadius: '50%', background: item.accentColor }} />
                      <span style={{ width: 14, height: 14, borderRadius: '50%', background: item.backgroundColor }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Branding & Texts Card */}
          <div style={{ background: '#1E293B', borderRadius: '16px', padding: '1.25rem', border: '1px solid #334155' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Layers className="text-sky-400" size={18} />
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#FFFFFF', margin: 0 }}>الهوية والنصوص (Branding)</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', color: '#94A3B8', marginBottom: '0.375rem' }}>اسم القالب</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{ width: '100%', padding: '0.625rem 0.875rem', background: '#0F172A', border: '1px solid #334155', borderRadius: '8px', color: '#FFFFFF' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', color: '#94A3B8', marginBottom: '0.375rem' }}>اسم الشبكة</label>
                  <input
                    type="text"
                    value={networkName}
                    onChange={(e) => setNetworkName(e.target.value)}
                    style={{ width: '100%', padding: '0.625rem 0.875rem', background: '#0F172A', border: '1px solid #334155', borderRadius: '8px', color: '#FFFFFF' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', color: '#94A3B8', marginBottom: '0.375rem' }}>عنوان الترحيب</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    style={{ width: '100%', padding: '0.625rem 0.875rem', background: '#0F172A', border: '1px solid #334155', borderRadius: '8px', color: '#FFFFFF' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', color: '#94A3B8', marginBottom: '0.375rem' }}>النص التوضيحي</label>
                <input
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  style={{ width: '100%', padding: '0.625rem 0.875rem', background: '#0F172A', border: '1px solid #334155', borderRadius: '8px', color: '#FFFFFF' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', color: '#94A3B8', marginBottom: '0.375rem' }}>رابط الشعار (Logo URL)</label>
                  <input
                    type="text"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    style={{ width: '100%', padding: '0.625rem 0.875rem', background: '#0F172A', border: '1px solid #334155', borderRadius: '8px', color: '#FFFFFF' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', color: '#94A3B8', marginBottom: '0.375rem' }}>هاتف الدعم الفني</label>
                  <input
                    type="text"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    style={{ width: '100%', padding: '0.625rem 0.875rem', background: '#0F172A', border: '1px solid #334155', borderRadius: '8px', color: '#FFFFFF' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', color: '#94A3B8', marginBottom: '0.375rem' }}>طريقة تسجيل الدخول</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                  {[
                    { id: 'VOUCHER', label: 'كروت فقط' },
                    { id: 'USER_PASS', label: 'مستخدم وكلمة سر' },
                    { id: 'BOTH', label: 'كلاهما (مزدوج)' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setLoginMethod(m.id as any)}
                      style={{
                        padding: '0.5rem',
                        background: loginMethod === m.id ? 'rgba(14, 165, 233, 0.2)' : '#0F172A',
                        border: `1px solid ${loginMethod === m.id ? '#0EA5E9' : '#334155'}`,
                        borderRadius: '8px',
                        color: loginMethod === m.id ? '#38BDF8' : '#94A3B8',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Color Palette Card */}
          <div style={{ background: '#1E293B', borderRadius: '16px', padding: '1.25rem', border: '1px solid #334155' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Palette className="text-emerald-400" size={18} />
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#FFFFFF', margin: 0 }}>لوحة الألوان (Colors)</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.875rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', color: '#94A3B8', marginBottom: '0.375rem' }}>اللون الأساسي (Primary)</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} style={{ width: 36, height: 36, borderRadius: 6, border: 'none', cursor: 'pointer' }} />
                  <input type="text" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} style={{ flex: 1, padding: '0.5rem', background: '#0F172A', border: '1px solid #334155', borderRadius: 6, color: '#FFFFFF' }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', color: '#94A3B8', marginBottom: '0.375rem' }}>لون الزر والتمييز (Accent)</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} style={{ width: 36, height: 36, borderRadius: 6, border: 'none', cursor: 'pointer' }} />
                  <input type="text" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} style={{ flex: 1, padding: '0.5rem', background: '#0F172A', border: '1px solid #334155', borderRadius: 6, color: '#FFFFFF' }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', color: '#94A3B8', marginBottom: '0.375rem' }}>خلفية الصفحة (Background)</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input type="color" value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} style={{ width: 36, height: 36, borderRadius: 6, border: 'none', cursor: 'pointer' }} />
                  <input type="text" value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} style={{ flex: 1, padding: '0.5rem', background: '#0F172A', border: '1px solid #334155', borderRadius: 6, color: '#FFFFFF' }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', color: '#94A3B8', marginBottom: '0.375rem' }}>لون بطاقة الدخول (Card)</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input type="color" value={cardColor} onChange={(e) => setCardColor(e.target.value)} style={{ width: 36, height: 36, borderRadius: 6, border: 'none', cursor: 'pointer' }} />
                  <input type="text" value={cardColor} onChange={(e) => setCardColor(e.target.value)} style={{ flex: 1, padding: '0.5rem', background: '#0F172A', border: '1px solid #334155', borderRadius: 6, color: '#FFFFFF' }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Interactive Device Preview */}
        <div style={{ position: 'sticky', top: '1.5rem', background: '#1E293B', borderRadius: '16px', padding: '1.25rem', border: '1px solid #334155', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Globe className="text-sky-400" size={18} />
              <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#FFFFFF' }}>معاينة حية فورية</span>
            </div>

            {/* Viewport switcher */}
            <div style={{ display: 'flex', background: '#0F172A', padding: '3px', borderRadius: '8px', border: '1px solid #334155' }}>
              <button
                type="button"
                onClick={() => setViewport('mobile')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  background: viewport === 'mobile' ? '#334155' : 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  color: viewport === 'mobile' ? '#FFFFFF' : '#94A3B8',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Smartphone size={14} />
                موبايل
              </button>
              <button
                type="button"
                onClick={() => setViewport('desktop')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  background: viewport === 'desktop' ? '#334155' : 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  color: viewport === 'desktop' ? '#FFFFFF' : '#94A3B8',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Monitor size={14} />
                حاسوب
              </button>
            </div>
          </div>

          {/* Device Frame */}
          <div
            style={{
              width: viewport === 'mobile' ? '360px' : '100%',
              height: '560px',
              borderRadius: viewport === 'mobile' ? '28px' : '12px',
              border: viewport === 'mobile' ? '8px solid #0F172A' : '2px solid #334155',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
              overflow: 'hidden',
              background: backgroundColor,
              transition: 'width 0.3s ease',
            }}
          >
            <iframe
              srcDoc={compiledPreviewHtml}
              title="HotSpot Portal Live Preview"
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                background: backgroundColor,
              }}
              sandbox="allow-scripts allow-forms"
            />
          </div>
          <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#64748B' }}>
            تحديث فوري مباشر أثناء التعديل — يتطابق بنسبة 100% مع مخرجات MikroTik RouterOS
          </div>
        </div>
      </div>

      {/* Publish to Router Modal */}
      {publishModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.75)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#1E293B', borderRadius: '20px', border: '1px solid #334155', width: '100%', maxWidth: '520px', padding: '1.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ padding: '0.625rem', background: 'rgba(16, 185, 129, 0.15)', borderRadius: '12px' }}>
                <UploadCloud className="text-emerald-400" size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>نشر التصميم إلى راوتر MikroTik</h3>
                <p style={{ fontSize: '0.8125rem', color: '#94A3B8', margin: 0 }}>
                  رفع ملفات HTML و CSS مباشرة إلى ذاكرة الراوتر عبر Windows LAN Agent
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', color: '#94A3B8', marginBottom: '0.375rem' }}>اختر جهاز الراوتر المستهدف</label>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  style={{ width: '100%', padding: '0.625rem 0.875rem', background: '#0F172A', border: '1px solid #334155', borderRadius: '8px', color: '#FFFFFF' }}
                >
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.host || 'LAN'}) — {d.status === 'ONLINE' ? '🟢 متصل' : '⚪ غير متصل'}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', color: '#94A3B8', marginBottom: '0.375rem' }}>مجلد الراوتر (html-directory)</label>
                  <input
                    type="text"
                    value={targetDirectory}
                    onChange={(e) => setTargetDirectory(e.target.value)}
                    placeholder="hotspot"
                    style={{ width: '100%', padding: '0.625rem 0.875rem', background: '#0F172A', border: '1px solid #334155', borderRadius: '8px', color: '#FFFFFF' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', color: '#94A3B8', marginBottom: '0.375rem' }}>بروفايل الهوتسبوت المستهدف</label>
                  <input
                    type="text"
                    value={applyToProfile}
                    onChange={(e) => setApplyToProfile(e.target.value)}
                    placeholder="hsprof1"
                    style={{ width: '100%', padding: '0.625rem 0.875rem', background: '#0F172A', border: '1px solid #334155', borderRadius: '8px', color: '#FFFFFF' }}
                  />
                </div>
              </div>

              {/* Command status monitor card */}
              {commandStatus && (
                <div style={{ padding: '1rem', background: '#0F172A', borderRadius: '12px', border: '1px solid #334155' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.8125rem', color: '#94A3B8' }}>حالة أمر النشر في الوكيل:</span>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background:
                          commandStatus.status === 'COMPLETED'
                            ? 'rgba(16, 185, 129, 0.2)'
                            : commandStatus.status === 'FAILED'
                            ? 'rgba(239, 68, 68, 0.2)'
                            : 'rgba(245, 158, 11, 0.2)',
                        color:
                          commandStatus.status === 'COMPLETED'
                            ? '#34D399'
                            : commandStatus.status === 'FAILED'
                            ? '#F87171'
                            : '#FBBF24',
                      }}
                    >
                      {commandStatus.status}
                    </span>
                  </div>
                  {commandStatus.errorMessage && (
                    <div style={{ fontSize: '0.75rem', color: '#F87171', marginTop: '0.25rem' }}>
                      {commandStatus.errorMessage}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setPublishModalOpen(false)}
                disabled={isPublishing}
                style={{ padding: '0.625rem 1.25rem', background: '#334155', color: '#FFFFFF', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handlePublishToRouter}
                disabled={isPublishing}
                style={{
                  padding: '0.625rem 1.25rem',
                  background: 'linear-gradient(135deg, #0EA5E9, #10B981)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 700,
                  cursor: isPublishing ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                {isPublishing ? <RefreshCw className="animate-spin" size={16} /> : <UploadCloud size={16} />}
                {isPublishing ? 'جاري النشر عبر الوكيل...' : 'تأكيد ونشر'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
