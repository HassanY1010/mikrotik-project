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

    const formAction = isPreview ? '#' : '$(link-login-only)';
    const dstValue = isPreview ? 'https://google.com' : '$(link-orig)';
    const errorBlock = isPreview
      ? ''
      : `$(if error)<div class="err"><span>$(error)</span></div>$(endif)`;
    const chapForm = isPreview
      ? ''
      : `$(if chap-id)<form name="sendin" action="$(link-login-only)" method="post" style="display:none"><input type="hidden" name="username"/><input type="hidden" name="password"/><input type="hidden" name="dst" value="$(link-orig)"/><input type="hidden" name="popup" value="true"/></form>$(endif)`;
    const chapIdExpr = isPreview ? '""' : '"$(chap-id)"';
    const chapChalExpr = isPreview ? '""' : '"$(chap-challenge)"';

    const fieldsHtml = isVoucherOnly
      ? `<div class="fg"><label class="fl" for="username">كود كرت الإنترنت</label><input class="fi" id="username" name="username" type="text" placeholder="مثال: 78945612" required autofocus autocomplete="off" autocorrect="off" autocapitalize="none"><input type="hidden" id="password" name="password" value=""></div>`
      : isUserPass
        ? `<div class="fg"><label class="fl" for="username">اسم المستخدم</label><input class="fi" id="username" name="username" type="text" placeholder="اسم المستخدم" required autofocus autocomplete="off" autocapitalize="none"></div><div class="fg"><label class="fl" for="password">كلمة المرور</label><input class="fi" id="password" name="password" type="password" placeholder="••••••••" required></div>`
        : `<div class="fg"><label class="fl" for="username">اسم المستخدم أو كود الكرت</label><input class="fi" id="username" name="username" type="text" placeholder="أدخل الحساب أو الكرت" required autofocus autocomplete="off" autocapitalize="none"></div><div class="fg"><label class="fl" for="password">كلمة المرور (اتركها فارغة للكروت)</label><input class="fi" id="password" name="password" type="password" placeholder="كلمة المرور"></div>`;

    // Compact self-contained HTML (< 3.8KB) to fit RouterOS /file/set 4KB limit safely while supporting both CHAP & PAP
    return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>${networkName}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:${backgroundColor};color:${textColor};min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:16px}.card{background:${cardColor};border-radius:16px;width:100%;max-width:400px;padding:24px 20px;border:1px solid rgba(128,128,128,.25);border-top:4px solid ${primaryColor}}.hd{text-align:center;margin-bottom:16px}.logo{max-width:72px;max-height:72px;margin-bottom:8px;border-radius:12px}.badge{display:inline-block;padding:4px 12px;background:rgba(128,128,128,.12);border-radius:50px;font-size:13px;font-weight:600;color:${primaryColor};margin-bottom:6px}.ttl{font-size:20px;font-weight:700;color:${textColor};margin-bottom:4px}.sub,.sup,.ft{font-size:12px;color:${textColor};opacity:.75;text-align:center}.err{background:rgba(239,68,68,.15);border:1px solid #ef4444;color:#ef4444;padding:10px;border-radius:10px;margin-bottom:12px;font-size:13px;text-align:center}.fg{margin-bottom:12px}.fl{display:block;font-size:13px;font-weight:600;margin-bottom:5px;color:${textColor}}.fi{display:block;width:100%;padding:12px;background:rgba(128,128,128,.14);border:1.5px solid rgba(128,128,128,.35);border-radius:10px;color:${textColor};font-size:16px;text-align:center}.fi:focus{outline:none;border-color:${primaryColor}}.btn{width:100%;padding:13px;background:${primaryColor};border:none;border-radius:10px;color:#fff;font-size:16px;font-weight:700;cursor:pointer;margin-top:6px}.sup{margin-top:14px;padding-top:10px;border-top:1px solid rgba(128,128,128,.2)}.ph{color:${accentColor};font-weight:600;direction:ltr;display:inline-block}.ft{margin-top:14px;font-size:11px;opacity:.6}${customCss}</style></head><body>${chapForm}<div class="card"><div class="hd">${config.logoUrl ? `<img class="logo" src="${this.sanitizeText(config.logoUrl)}" alt="Logo">` : ''}<div><span class="badge">${networkName}</span></div><h1 class="ttl">${title}</h1><p class="sub">${subtitle}</p></div>${errorBlock}<form name="login" action="${formAction}" method="post" onsubmit="return doLogin()"><input type="hidden" name="dst" value="${dstValue}"><input type="hidden" name="popup" value="true">${fieldsHtml}<button type="submit" class="btn" id="submitBtn">تسجيل الدخول والاتصال</button></form>${(contactPhone || termsText) ? `<div class="sup">${contactPhone ? `<div>خدمة العملاء: <span class="ph">${contactPhone}</span></div>` : ''}${termsText ? `<div>${termsText}</div>` : ''}</div>` : ''}</div><div class="ft">${footerText}</div><script src="md5.js"></script><script>function doLogin(){var u=document.getElementById('username'),p=document.getElementById('password'),b=document.getElementById('submitBtn');if(!u)return true;var uv=u.value.trim(),pv=p?p.value:'';if(${isVoucherOnly}){pv=uv;if(p)p.value=uv}else if(${isBoth}&&(!pv||pv.trim()==='')){pv=uv;if(p)p.value=uv}if(b){b.disabled=true;b.innerText='جاري الاتصال...'}var cid=${chapIdExpr},cch=${chapChalExpr};if(cid&&cch&&document.sendin&&typeof hexMD5==='function'){document.sendin.username.value=uv;document.sendin.password.value=hexMD5(cid+pv+cch);document.sendin.submit();return false}return true}</script></body></html>`;
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
  compileMd5Js(): string {
    return `function hexMD5(s){function L(k,d){return(k<<d)|(k>>>(32-d))}function K(G,k){var I,d,F,H,x;F=(G&2147483648);H=(k&2147483648);I=(G&1073741824);d=(k&1073741824);x=(G&1073741823)+(k&1073741823);if(I&d)return(x^2147483648^F^H);if(I|d){if(x&1073741824)return(x^3221225472^F^H);else return(x^1073741824^F^H)}else return(x^F^H)}function F(d,F,k){return(d&F)|((~d)&k)}function G(d,F,k){return(d&k)|(F&(~k))}function H(d,F,k){return(d^F^k)}function I(d,F,k){return(F^(d|(~k)))}function C(G,F,H,I,k,d,x){G=K(G,K(K(F,k),K(d,x)));return K(L(G,d),F)}function f(q,p,o,n,m,l,k){return C(q,F(p,o,n),m,l,k)}function g(q,p,o,n,m,l,k){return C(q,G(p,o,n),m,l,k)}function h(q,p,o,n,m,l,k){return C(q,H(p,o,n),m,l,k)}function i(q,p,o,n,m,l,k){return C(q,I(p,o,n),m,l,k)}var x=[],k,A,B,E,D,a=1732584193,b=4023233417,c=2562383102,d=271733878,l=s.length;for(k=0;k<l;k++)x[k>>2]|=(s.charCodeAt(k)&255)<<((k%4)*8);x[l>>2]|=128<<((l%4)*8);x[(((l+8)>>6)<<4)+14]=l*8;for(k=0;k<x.length;k+=16){A=a;B=b;E=c;D=d;a=f(a,b,c,d,x[k],7,3614090360);d=f(d,a,b,c,x[k+1],12,3905402710);c=f(c,d,a,b,x[k+2],17,606105819);b=f(b,c,d,a,x[k+3],22,3250441966);a=f(a,b,c,d,x[k+4],7,4118548399);d=f(d,a,b,c,x[k+5],12,1200080426);c=f(c,d,a,b,x[k+6],17,2821735955);b=f(b,c,d,a,x[k+7],22,4249261313);a=f(a,b,c,d,x[k+8],7,1770035416);d=f(d,a,b,c,x[k+9],12,2336552879);c=f(c,d,a,b,x[k+10],17,4294925233);b=f(b,c,d,a,x[k+11],22,2304563134);a=f(a,b,c,d,x[k+12],7,1804603682);d=f(d,a,b,c,x[k+13],12,4254626195);c=f(c,d,a,b,x[k+14],17,2792965006);b=f(b,c,d,a,x[k+15],22,1236535329);a=g(a,b,c,d,x[k+1],5,4129170786);d=g(d,a,b,c,x[k+6],9,3225465664);c=g(c,d,a,b,x[k+11],14,643717713);b=g(b,c,d,a,x[k],20,3921069994);a=g(a,b,c,d,x[k+5],5,3593408605);d=g(d,a,b,c,x[k+10],9,38016083);c=g(c,d,a,b,x[k+15],14,3634488961);b=g(b,c,d,a,x[k+4],20,3889429448);a=g(a,b,c,d,x[k+9],5,568446438);d=g(d,a,b,c,x[k+14],9,3275163606);c=g(c,d,a,b,x[k+3],14,4107603335);b=g(b,c,d,a,x[k+8],20,1163531501);a=g(a,b,c,d,x[k+13],5,2850285829);d=g(d,a,b,c,x[k+2],9,4243563512);c=g(c,d,a,b,x[k+7],14,1735328473);b=g(b,c,d,a,x[k+12],20,2368359562);a=h(a,b,c,d,x[k+5],4,4294588738);d=h(d,a,b,c,x[k+8],11,2272392833);c=h(c,d,a,b,x[k+11],16,1839030562);b=h(b,c,d,a,x[k+14],23,4259657740);a=h(a,b,c,d,x[k+1],4,2763975236);d=h(d,a,b,c,x[k+4],11,1272893353);c=h(c,d,a,b,x[k+7],16,4139469664);b=h(b,c,d,a,x[k+10],23,3200236656);a=h(a,b,c,d,x[k+13],4,681279174);d=h(d,a,b,c,x[k],11,3936430074);c=h(c,d,a,b,x[k+3],16,3572445317);b=h(b,c,d,a,x[k+6],23,76029189);a=h(a,b,c,d,x[k+9],4,3654602809);d=h(d,a,b,c,x[k+12],11,3873151461);c=h(c,d,a,b,x[k+15],16,530742520);b=h(b,c,d,a,x[k+2],23,3299628645);a=i(a,b,c,d,x[k],6,4096336452);d=i(d,a,b,c,x[k+7],10,1126891415);c=i(c,d,a,b,x[k+14],15,2878612391);b=i(b,c,d,a,x[k+5],21,4237533241);a=i(a,b,c,d,x[k+12],6,1700485571);d=i(d,a,b,c,x[k+3],10,2399980690);c=i(c,d,a,b,x[k+10],15,4293915773);b=i(b,c,d,a,x[k+1],21,2240044497);a=i(a,b,c,d,x[k+8],6,1873313359);d=i(d,a,b,c,x[k+15],10,4264355552);c=i(c,d,a,b,x[k+6],15,2734768916);b=i(b,c,d,a,x[k+13],21,1309151649);a=i(a,b,c,d,x[k+4],6,4149444226);d=i(d,a,b,c,x[k+11],10,3174756917);c=i(c,d,a,b,x[k+2],15,718787259);b=i(b,c,d,a,x[k+9],21,3951481745);a=K(a,A);b=K(b,B);c=K(c,E);d=K(d,D)}function W(n){var r='',v,i;for(i=0;i<=3;i++){v=(n>>>(i*8))&255;r+=('0'+v.toString(16)).slice(-2)}return r}return(W(a)+W(b)+W(c)+W(d)).toLowerCase()}`;
  }

  compileAllFiles(config: HotspotPortalConfig): CompiledPortalFiles {
    const loginHtml = this.compileLoginHtml(config, 'router');
    const statusHtml = this.compileStatusHtml(config, 'router');
    const md5Js = this.compileMd5Js();

    return {
      loginHtml,
      statusHtml,
      files: [
        { name: 'login.html', content: loginHtml },
        { name: 'status.html', content: statusHtml },
        { name: 'md5.js', content: md5Js },
      ],
    };
  }
}
