const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const FROM_EMAIL = process.env.FROM_EMAIL || 'Braidr <noreply@getbraider.com>';

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send email: ${response.status} ${error}`);
  }
}

export function licenseKeyEmail(licenseKey: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <h1 style="font-size: 24px; color: #1a1a1a;">Welcome to Braidr!</h1>
      <p style="font-size: 16px; color: #4a4a4a; line-height: 1.6;">
        Thanks for your purchase. Here's your license key:
      </p>
      <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; margin: 24px 0; text-align: center;">
        <code style="font-size: 18px; color: #1a1a1a; letter-spacing: 1px; word-break: break-all;">${licenseKey}</code>
      </div>
      <p style="font-size: 16px; color: #4a4a4a; line-height: 1.6;">
        To activate, open Braidr and go to <strong>Braidr &rarr; Manage License</strong>, then paste the key above.
      </p>
      <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;" />
      <p style="font-size: 14px; color: #71717a;">
        You can manage your subscription and view your license key anytime at your
        <a href="https://braidr-api.vercel.app/portal" style="color: #2563eb;">customer portal</a>.
      </p>
    </div>
  `;
}

