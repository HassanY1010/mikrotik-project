import { Injectable } from '@nestjs/common';
import {
  HotspotPortalConfig,
  HotspotPortalLoginMethod,
} from '@mikrotik-saas/shared-types';

export interface CompiledPortalFiles {
  loginHtml: string;
  statusHtml: string;
  files: Array<{ name: string; content: string }>;
}

@Injectable()
export class PortalCompilerService {

  /**
   * Escapes dangerous characters to prevent HTML/XSS injection.
   */
  sanitizeText(input?: string | null): string {
    if (!input) return '';
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Sanitizes custom CSS to prevent CSS injection, external script loading, or expressions.
   */
  sanitizeCss(css?: string | null): string {
    if (!css) return '';
    return css
      .replace(/expression\s*\(.*?\)/gi, '')
      .replace(/javascript\s*:/gi, '')
      .replace(/behavior\s*:/gi, '')
      .replace(/@import\s+url\([^)]+\);?/gi, '')
      .replace(/<\/?style>/gi, '')
      .trim();
  }

  /**
   * Compiles the production MikroTik login.html or safe browser preview.
   */
  compileLoginHtml(config: HotspotPortalConfig, mode: 'preview' | 'router' = 'router'): string {
    const isPreview = mode === 'preview';
    const networkName = this.sanitizeText(config.networkName || 'شبكة الإنترنت');
    const title = this.sanitizeText(config.title || 'مرحباً بكم في شبكتنا');
    const subtitle = this.sanitizeText(config.subtitle || 'أدخل كود الكرت للاتصال الفوري');
    const contactPhone = this.sanitizeText(config.contactPhone);
    const termsText = this.sanitizeText(config.termsText);
    const footerText = this.sanitizeText(config.footerText || 'مدعوم بواسطة منصة SudaFi');
    const customCss = this.sanitizeCss(config.customCss);

    const primaryColor = config.primaryColor || '#0EA5E9';
    const accentColor = config.accentColor || '#10B981';
    const backgroundColor = config.backgroundColor || '#0F172A';
    const cardColor = config.cardColor || '#1E293B';
    const textColor = config.textColor || '#F8FAFC';

    const isVoucherOnly = config.loginMethod === HotspotPortalLoginMethod.VOUCHER;
    const isUserPass = config.loginMethod === HotspotPortalLoginMethod.USER_PASS;
    const isBoth = config.loginMethod === HotspotPortalLoginMethod.BOTH;

    // MikroTik variables vs Preview values
    const formAction = isPreview ? '#' : '$(link-login-only)';
    const dstValue = isPreview ? 'https://google.com' : '$(link-orig)';
    const errorBlock = isPreview
      ? ''
      : `$(if error)
      <div class="alert-error">
        <svg class="alert-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
        </svg>
        <span>$(error)</span>
      </div>
      $(endif)`;

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${networkName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
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
      max-width: 400px;
      padding: 32px 24px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      position: relative;
      overflow: hidden;
    }
    .portal-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: linear-gradient(90deg, ${primaryColor}, ${accentColor});
    }
    .brand-header {
      text-align: center;
      margin-bottom: 24px;
    }
    .brand-logo {
      max-width: 80px;
      max-height: 80px;
      margin-bottom: 12px;
      border-radius: 16px;
      display: inline-block;
    }
    .network-badge {
      display: inline-block;
      padding: 4px 12px;
      background: rgba(255, 255, 255, 0.06);
      border-radius: 50px;
      font-size: 13px;
      font-weight: 600;
      color: ${primaryColor};
      margin-bottom: 8px;
    }
    .portal-title {
      font-size: 20px;
      font-weight: 700;
      color: ${textColor};
      margin-bottom: 6px;
    }
    .portal-subtitle {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.65);
    }
    .alert-error {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #FCA5A5;
      padding: 12px 14px;
      border-radius: 12px;
      margin-bottom: 18px;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .alert-icon {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }
    .form-group {
      margin-bottom: 16px;
    }
    .form-label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 6px;
      color: rgba(255, 255, 255, 0.85);
    }
    .form-input {
      width: 100%;
      padding: 12px 16px;
      background: rgba(0, 0, 0, 0.25);
      border: 1.5px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      color: #FFFFFF;
      font-size: 16px;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
      text-align: center;
      font-family: inherit;
    }
    .form-input:focus {
      border-color: ${primaryColor};
      box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.25);
    }
    .form-input::placeholder {
      color: rgba(255, 255, 255, 0.35);
    }
    .submit-btn {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, ${primaryColor}, ${accentColor});
      border: none;
      border-radius: 12px;
      color: #FFFFFF;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
      transition: transform 0.1s, opacity 0.2s;
      margin-top: 8px;
    }
    .submit-btn:active {
      transform: scale(0.98);
    }
    .support-bar {
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 12px;
      color: rgba(255, 255, 255, 0.6);
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .support-phone {
      color: ${accentColor};
      font-weight: 600;
      direction: ltr;
      display: inline-block;
    }
    .footer-brand {
      margin-top: 24px;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.4);
      text-align: center;
    }
    ${customCss}
  </style>
</head>
<body>
  <div class="portal-card">
    <div class="brand-header">
      ${config.logoUrl ? `<img class="brand-logo" src="${this.sanitizeText(config.logoUrl)}" alt="Logo">` : ''}
      <div><span class="network-badge">${networkName}</span></div>
      <h1 class="portal-title">${title}</h1>
      <p class="portal-subtitle">${subtitle}</p>
    </div>

    ${errorBlock}

    <form name="login" action="${formAction}" method="post" onsubmit="return handleLoginSubmit();">
      <input type="hidden" name="dst" value="${dstValue}" />
      <input type="hidden" name="popup" value="true" />

      ${isVoucherOnly ? `
      <div class="form-group">
        <label class="form-label" for="username">كود كرت الإنترنت</label>
        <input class="form-input" id="username" name="username" type="text" placeholder="مثال: 78945612" required autofocus autocomplete="off" autocorrect="off" autocapitalize="none">
        <input type="hidden" id="password" name="password" value="">
      </div>
      ` : isUserPass ? `
      <div class="form-group">
        <label class="form-label" for="username">اسم المستخدم</label>
        <input class="form-input" id="username" name="username" type="text" placeholder="اسم المستخدم" required autofocus>
      </div>
      <div class="form-group">
        <label class="form-label" for="password">كلمة المرور</label>
        <input class="form-input" id="password" name="password" type="password" placeholder="••••••••" required>
      </div>
      ` : `
      <div class="form-group">
        <label class="form-label" for="username">اسم المستخدم أو كود الكرت</label>
        <input class="form-input" id="username" name="username" type="text" placeholder="أدخل الحساب أو الكرت" required autofocus>
      </div>
      <div class="form-group">
        <label class="form-label" for="password">كلمة المرور (اتركها فارغة للكروت)</label>
        <input class="form-input" id="password" name="password" type="password" placeholder="كلمة المرور">
      </div>
      `}

      <button type="submit" class="submit-btn" id="submitBtn">تسجيل الدخول والاتصال</button>
    </form>

    ${(contactPhone || termsText) ? `
    <div class="support-bar">
      ${contactPhone ? `<div>خدمة العملاء والدعم: <span class="support-phone">${contactPhone}</span></div>` : ''}
      ${termsText ? `<div>${termsText}</div>` : ''}
    </div>
    ` : ''}
  </div>

  <div class="footer-brand">${footerText}</div>

  <script>
    function handleLoginSubmit() {
      var userField = document.getElementById('username');
      var passField = document.getElementById('password');
      var btn = document.getElementById('submitBtn');

      if (${isVoucherOnly}) {
        if (userField && passField) {
          passField.value = userField.value.trim();
        }
      } else if (${isBoth}) {
        if (passField && (!passField.value || passField.value.trim() === '')) {
          passField.value = userField.value.trim();
        }
      }

      if (btn) {
        btn.disabled = true;
        btn.innerText = 'جاري الاتصال...';
      }
      return true;
    }
  </script>
</body>
</html>`;
  }

  /**
   * Compiles the companion status.html (active session overview and logoff).
   */
  compileStatusHtml(config: HotspotPortalConfig, mode: 'preview' | 'router' = 'router'): string {
    const isPreview = mode === 'preview';
    const networkName = this.sanitizeText(config.networkName || 'شبكة الإنترنت');
    const primaryColor = config.primaryColor || '#0EA5E9';
    const accentColor = config.accentColor || '#10B981';
    const backgroundColor = config.backgroundColor || '#0F172A';
    const cardColor = config.cardColor || '#1E293B';
    const textColor = config.textColor || '#F8FAFC';

    const logoffAction = isPreview ? '#' : '$(link-logout)';
    const usernameVar = isPreview ? 'TEST-VOUCHER-01' : '$(username)';
    const ipVar = isPreview ? '192.168.88.105' : '$(ip)';
    const uptimeVar = isPreview ? '01:24:30' : '$(uptime)';
    const bytesInVar = isPreview ? '145.2 MB' : '$(bytes-in-nice)';
    const bytesOutVar = isPreview ? '32.1 MB' : '$(bytes-out-nice)';
    const remainVar = isPreview ? '3 ساعات' : '$(session-time-left)';

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>حالة الاتصال — ${networkName}</title>
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
    }
    .status-card {
      background: ${cardColor};
      border-radius: 20px;
      width: 100%;
      max-width: 400px;
      padding: 28px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.4);
      border: 1px solid rgba(255,255,255,0.08);
      border-top: 4px solid ${primaryColor};
      text-align: center;
    }
    .status-badge {
      display: inline-block;
      padding: 6px 16px;
      background: rgba(16, 185, 129, 0.15);
      color: ${accentColor};
      border-radius: 50px;
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 16px;
    }
    .user-greeting {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 20px;
    }
    .metric-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      font-size: 14px;
    }
    .metric-label { color: rgba(255,255,255,0.6); }
    .metric-val { font-weight: 600; color: ${textColor}; direction: ltr; }
    .logout-btn {
      margin-top: 22px;
      width: 100%;
      padding: 12px;
      background: rgba(239, 68, 68, 0.2);
      border: 1px solid rgba(239, 68, 68, 0.4);
      color: #F87171;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="status-card">
    <div class="status-badge">● متصل بالإنترنت بنجاح</div>
    <div class="user-greeting">${networkName}</div>

    <div class="metric-row">
      <span class="metric-label">المشترك / الكرت:</span>
      <span class="metric-val">${usernameVar}</span>
    </div>
    <div class="metric-row">
      <span class="metric-label">عنوان IP:</span>
      <span class="metric-val">${ipVar}</span>
    </div>
    <div class="metric-row">
      <span class="metric-label">مدة الاتصال:</span>
      <span class="metric-val">${uptimeVar}</span>
    </div>
    <div class="metric-row">
      <span class="metric-label">التنزيل:</span>
      <span class="metric-val">${bytesOutVar}</span>
    </div>
    <div class="metric-row">
      <span class="metric-label">الرفع:</span>
      <span class="metric-val">${bytesInVar}</span>
    </div>
    ${config.showRemainingTime ? `
    <div class="metric-row">
      <span class="metric-label">الوقت المتبقي:</span>
      <span class="metric-val">${remainVar}</span>
    </div>
    ` : ''}

    <form action="${logoffAction}" method="post">
      <button type="submit" class="logout-btn">قطع الاتصال (تسجيل الخروج)</button>
    </form>
  </div>
</body>
</html>`;
  }

  /**
   * Bundles all necessary files ready for deployment to MikroTik RouterOS storage.
   */
  compileAllFiles(config: HotspotPortalConfig): CompiledPortalFiles {
    const loginHtml = this.compileLoginHtml(config, 'router');
    const statusHtml = this.compileStatusHtml(config, 'router');

    return {
      loginHtml,
      statusHtml,
      files: [
        { name: 'login.html', content: loginHtml },
        { name: 'status.html', content: statusHtml },
      ],
    };
  }
}
