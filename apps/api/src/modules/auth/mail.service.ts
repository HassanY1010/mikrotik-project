import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface SendPasswordResetOptions {
  to: string;
  fullName: string;
  code: string;
  resetLink: string;
  expiresInMinutes: number;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initTransporter();
  }

  private initTransporter(): void {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT) || 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;

    // Check if real SMTP credentials are provided
    if (host && host !== 'smtp.example.com' && user && pass && pass !== 'CHANGE_ME_SMTP_PASSWORD') {
      try {
        this.transporter = nodemailer.createTransport({
          host,
          port,
          secure,
          auth: { user, pass },
          tls: {
            rejectUnauthorized: process.env.NODE_ENV === 'production',
          },
        });
        this.logger.log(`SMTP Mailer initialized successfully for ${host}:${port}`);
      } catch (err) {
        this.logger.error(`Failed to initialize SMTP transporter: ${err}`);
        this.transporter = null;
      }
    } else {
      this.logger.log('SMTP not configured or placeholder detected — mailer will log reset codes to server logger for development & testing.');
    }
  }

  /**
   * Sends password recovery instructions containing 6-digit verification code and reset link.
   */
  async sendPasswordResetEmail(options: SendPasswordResetOptions): Promise<boolean> {
    const fromName = process.env.SMTP_FROM_NAME || 'سودافاي | SudaFi Net';
    const fromAddress = process.env.SMTP_FROM_ADDRESS || 'noreply@sudafi.sd';
    const from = `"${fromName}" <${fromAddress}>`;

    const subject = '🔐 رمز واستعادة كلمة المرور — سودافاي SudaFi';

    const htmlContent = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 20px; direction: rtl; }
    .container { max-width: 540px; margin: 0 auto; background: #1e293b; border-radius: 16px; border: 1px solid #334155; padding: 32px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); }
    .header { text-align: center; margin-bottom: 24px; }
    .logo-badge { display: inline-block; background: rgba(13, 148, 136, 0.2); border: 1px solid #0d9488; color: #2dd4bf; padding: 6px 16px; border-radius: 9999px; font-size: 13px; font-weight: bold; }
    .title { color: #ffffff; font-size: 20px; font-weight: 800; margin-top: 14px; margin-bottom: 6px; }
    .subtitle { color: #94a3b8; font-size: 13px; margin: 0; }
    .code-box { background: #0f172a; border: 2px dashed #0284c7; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
    .code-label { font-size: 12px; color: #38bdf8; font-weight: 600; margin-bottom: 8px; }
    .code-value { font-size: 34px; letter-spacing: 10px; font-weight: 900; color: #ffffff; font-family: monospace; }
    .btn-action { display: block; text-align: center; background: #0284c7; color: #ffffff !important; text-decoration: none; padding: 14px 24px; border-radius: 10px; font-weight: bold; font-size: 14px; margin: 24px 0; }
    .notice { font-size: 12px; color: #64748b; line-height: 1.6; border-top: 1px solid #334155; padding-top: 16px; margin-top: 24px; }
    .warning { color: #f59e0b; font-size: 12px; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="logo-badge">سودافاي | SudaFi Net</span>
      <h1 class="title">طلب استعادة كلمة المرور</h1>
      <p class="subtitle">مرحباً ${options.fullName || 'عزيزنا المشترك'}</p>
    </div>

    <p style="font-size: 14px; line-height: 1.6; color: #cbd5e1;">
      تلقينا طلباً لإعادة تعيين كلمة المرور لحسابك في منصة سودافاي لإدارة شبكات MikroTik. يمكنك استخدام رمز التحقق أدناه في تطبيق الموبايل أو الضغط على زر إعادة التعيين المباشر:
    </p>

    <div class="code-box">
      <div class="code-label">رمز التحقق المكون من 6 أرقام (صالِح لمدة ${options.expiresInMinutes} دقيقة)</div>
      <div class="code-value">${options.code}</div>
    </div>

    <div style="text-align: center;">
      <a href="${options.resetLink}" class="btn-action" target="_blank">اضغط هنا لتعيين كلمة مرور جديدة</a>
    </div>

    <p class="warning">
      ⚠️ تنبيه أمني: الرمز والرابط صالحان للاستخدام مرة واحدة فقط لمدة ${options.expiresInMinutes} دقيقة. إذا لم تكن أنت من طلب استعادة كلمة المرور، فيمكنك تجاهل هذه الرسالة بأمان وستظل كلمة مرورك الحالية نشطة ومحمية.
    </p>

    <div class="notice">
      المنظومة السحابية الذكية لإدارة بطاقات MikroTik وشبكات HotSpot.<br>
      © 2026 SudaFi Network OS. All rights reserved.
    </div>
  </div>
</body>
</html>
    `;

    const textContent = `
سودافاي | SudaFi Net — طلب استعادة كلمة المرور
---------------------------------------------
مرحباً ${options.fullName || 'عزيزنا المشترك'}

رمز التحقق لاستعادة كلمة المرور هو: ${options.code}
(صالح لمدة ${options.expiresInMinutes} دقيقة)

أو يمكنك استخدام رابط الاستعادة المباشر التالي:
${options.resetLink}

إذا لم تطلب هذا الإجراء، يمكنك تجاهل هذه الرسالة بأمان.
    `.trim();

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from,
          to: options.to,
          subject,
          text: textContent,
          html: htmlContent,
        });
        this.logger.log(`Password reset email dispatched to ${options.to}`);
        return true;
      } catch (err) {
        this.logger.error(`Failed to dispatch reset email to ${options.to}: ${err}`);
      }
    }

    // Fallback in development or testing without active SMTP server
    this.logger.warn(`[DEV/TEST RESET DISPATCH] To: ${options.to} | Code: [${options.code}] | Link: ${options.resetLink}`);
    return true;
  }
}
