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
    const subject = `Urbanex • رمز التحقق | Verification Code`;
    const expiresText = expiresAt.toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      hour12: true,
    });
    const html = `
  <div style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:40px 16px;background:#f3f6fb;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 12px 40px rgba(15,23,42,0.08);">
            
            <tr>
              <td style="padding:36px 32px;background:linear-gradient(135deg,#0b1220 0%,#1e3a8a 100%);text-align:center;">
                <div style="width:64px;height:64px;line-height:64px;margin:0 auto 18px auto;border-radius:50%;background:rgba(255,255,255,0.12);color:#ffffff;font-size:24px;font-weight:800;">
                  U
                </div>
                <h1 style="margin:0;font-size:30px;color:#ffffff;font-weight:800;letter-spacing:0.3px;">
                  Urbanex
                </h1>
                <p style="margin:12px 0 0 0;font-size:15px;line-height:1.8;color:rgba(255,255,255,0.82);">
                  Secure verification for your account<br>
                  تحقق آمن لتسجيل الدخول إلى حسابك
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:34px 32px 28px 32px;">
                <p style="margin:0 0 10px 0;text-align:center;font-size:15px;color:#6b7280;">
                  استخدم الرمز التالي لإكمال عملية التحقق
                </p>
                <p style="margin:0 0 24px 0;text-align:center;font-size:15px;color:#6b7280;">
                  Use the code below to verify your email address
                </p>

                <div style="text-align:center;margin-bottom:28px;">
                  <div style="display:inline-block;padding:20px 26px;border-radius:18px;background:linear-gradient(180deg,#eff6ff 0%,#dbeafe 100%);border:1px solid #bfdbfe;color:#1d4ed8;font-size:38px;font-weight:800;letter-spacing:12px;">
                    ${code}
                  </div>
                </div>

                <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:16px;padding:18px 20px;margin-bottom:22px;">
                  <p style="margin:0 0 8px 0;font-size:14px;font-weight:700;color:#111827;">
                    Expiration / انتهاء الصلاحية
                  </p>
                  <p style="margin:0;font-size:14px;line-height:1.8;color:#4b5563;">
                    This code expires on <strong>${expiresText}</strong>.<br>
                    ينتهي هذا الرمز في <strong>${expiresText}</strong>.
                  </p>
                </div>

                <div style="font-size:14px;line-height:1.9;color:#4b5563;">
                  <p style="margin:0 0 10px 0;">
                    If you didn’t request this email, you can safely ignore it.
                  </p>
                  <p style="margin:0;">
                    إذا لم تطلب هذا الرمز، يمكنك تجاهل هذه الرسالة بأمان.
                  </p>
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 32px;background:#fafafa;border-top:1px solid #f0f0f0;text-align:center;">
                <p style="margin:0;font-size:12px;line-height:1.8;color:#9ca3af;">
                  © ${new Date().getFullYear()} Urbanex - Secure Authentication System
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </div>
`;
    const text = `
Urbanex Verification Code / رمز التحقق

Code: ${code}
Expires on: ${expiresText}

If you did not request this email, you can ignore it.
إذا لم تطلب هذا الرمز، يمكنك تجاهل هذه الرسالة.

Urbanex Team
`.trim();
    await this.sendMail({
      to: email,
      subject,
      html,
      text,
    });
  }
}
