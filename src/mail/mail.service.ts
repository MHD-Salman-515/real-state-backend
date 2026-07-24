import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { performance } from 'perf_hooks';

type SendMailParams = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;
  private readonly enabled: boolean;
  private readonly from: string;

  constructor() {
    const apiKey = String(process.env.RESEND_API_KEY || '').trim();

    this.from = String(process.env.MAIL_FROM || '').trim() || 'onboarding@resend.dev';
    this.enabled = Boolean(apiKey);
    this.resend = this.enabled ? new Resend(apiKey) : null;
  }

  getMailRuntimeInfo(): { enabled: boolean; provider: 'resend'; from: string } {
    return {
      enabled: this.enabled,
      provider: 'resend',
      from: this.from,
    };
  }

  async verifyConnection(): Promise<boolean> {
    return this.enabled;
  }

  async sendMail(params: SendMailParams): Promise<void> {
    const started = performance.now();

    if (!this.enabled || !this.resend) {
      const message = 'Resend is not configured';
      this.logger.error(
        `[MAIL] failed to=${params.to} subject="${params.subject}" error="${message}" code=RESEND_NOT_CONFIGURED`,
      );
      throw new Error(message);
    }

    try {
      const result = await this.resend.emails.send({
        from: this.from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      });
      const elapsed = Math.round(performance.now() - started);
      const messageId = result.data?.id || 'unknown';

      this.logger.log(
        `[MAIL] sent to=${params.to} subject="${params.subject}" provider=resend messageId=${messageId} ms=${elapsed}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown Resend error';

      this.logger.error(
        `[MAIL] failed to=${params.to} subject="${params.subject}" provider=resend error="${message}"`,
      );
      throw error;
    }
  }

  async sendOtpEmail(email: string, code: string, expiresAt: Date): Promise<void> {
    const subject = `Creos • رمز التحقق | Verification Code`;
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#F4F5F7;font-family:’Segoe UI’,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F7;padding:40px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">

        <!-- HEADER -->
        <tr>
          <td style="background:linear-gradient(135deg,#1A1A2E 0%,#16213E 50%,#0F3460 100%);padding:36px 40px;text-align:center">
            <div style="font-size:28px;font-weight:800;color:#E94560;letter-spacing:2px">CREOS</div>
            <div style="font-size:12px;color:#94A3B8;margin-top:4px;letter-spacing:3px">SMART REAL ESTATE</div>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="padding:40px 40px 20px">
            <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1A1A2E">تحقق من هويتك</h2>
            <p style="margin:0 0 24px;font-size:14px;color:#64748B;line-height:1.6">
              Verify Your Identity
            </p>
            <p style="margin:0 0 28px;font-size:14px;color:#475569;line-height:1.7;direction:rtl">
              استخدم الرمز أدناه لإكمال عملية تسجيل الدخول إلى حسابك في منصة كريوس.
              <br/>Use the code below to complete your Creos account verification.
            </p>

            <!-- OTP BOX -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:8px 0 32px">
                  <div style="background:#F8FAFC;border:2px dashed #E94560;border-radius:12px;padding:24px 40px;display:inline-block">
                    <div style="font-size:10px;color:#94A3B8;letter-spacing:3px;text-transform:uppercase;margin-bottom:8px">رمز التحقق / Verification Code</div>
                    <div style="font-size:42px;font-weight:800;color:#1A1A2E;letter-spacing:10px">${code}</div>
                  </div>
                </td>
              </tr>
            </table>

            <!-- EXPIRY -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF7F7;border-radius:8px;margin-bottom:28px">
              <tr>
                <td style="padding:14px 20px">
                  <span style="font-size:13px;color:#E94560;font-weight:600">&#9203; </span>
                  <span style="font-size:13px;color:#475569">
                    ينتهي هذا الرمز خلال <strong style="color:#E94560">10 دقائق</strong> /
                    This code expires in <strong style="color:#E94560">10 minutes</strong>
                  </span>
                </td>
              </tr>
            </table>

            <!-- SECURITY NOTE -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border-radius:8px;border-left:4px solid #0F3460;margin-bottom:28px">
              <tr>
                <td style="padding:14px 20px">
                  <p style="margin:0;font-size:12px;color:#64748B;line-height:1.6">
                    &#128274; إذا لم تطلب هذا الرمز، يمكنك تجاهل هذه الرسالة بأمان.<br/>
                    If you didn’t request this code, you can safely ignore this email.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#1A1A2E;padding:24px 40px;text-align:center">
            <p style="margin:0 0 4px;font-size:13px;color:#E94560;font-weight:700">CREOS — منصة العقارات الذكية</p>
            <p style="margin:0;font-size:11px;color:#475569">&#169; 2026 Creos · Secure Authentication System</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const text = `
Creos Verification Code / رمز التحقق

Code: ${code}

This code expires in 10 minutes.
ينتهي هذا الرمز خلال 10 دقائق.

If you did not request this code, you can safely ignore this email.
إذا لم تطلب هذا الرمز، يمكنك تجاهل هذه الرسالة بأمان.

CREOS — منصة العقارات الذكية
`.trim();
    await this.sendMail({
      to: email,
      subject,
      html,
      text,
    });
  }
}
