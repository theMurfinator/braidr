import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendEmail } from './_lib/email';

const FEEDBACK_TO = process.env.FEEDBACK_TO || 'feedback@getbraider.com';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { category, message, appVersion, platform, timestamp } = req.body || {};

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const categoryLabel =
    category === 'bug' ? 'Bug Report' :
    category === 'feature' ? 'Feature Request' :
    'General Feedback';

  const subject = `[Braidr Feedback] ${categoryLabel}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <h2 style="font-size: 20px; color: #1a1a1a; margin: 0 0 16px;">${categoryLabel}</h2>
      <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; margin: 0 0 24px; white-space: pre-wrap; font-size: 15px; color: #1a1a1a; line-height: 1.6;">${escapeHtml(message)}</div>
      <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;" />
      <table style="font-size: 13px; color: #71717a;">
        <tr><td style="padding-right: 12px;">App version</td><td>${escapeHtml(appVersion || 'unknown')}</td></tr>
        <tr><td style="padding-right: 12px;">Platform</td><td>${escapeHtml(platform || 'unknown')}</td></tr>
        <tr><td style="padding-right: 12px;">Sent at</td><td>${escapeHtml(timestamp || new Date().toISOString())}</td></tr>
      </table>
    </div>
  `;

  try {
    await sendEmail({ to: FEEDBACK_TO, subject, html });
    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('Failed to send feedback email:', err.message);
    return res.status(500).json({ error: 'Failed to send feedback' });
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
