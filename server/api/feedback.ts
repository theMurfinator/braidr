import type { VercelRequest, VercelResponse } from '@vercel/node';
import { put, list } from '@vercel/blob';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FEEDBACK_TO = process.env.FEEDBACK_TO || 'feedback@getbraider.com';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Braidr <noreply@getbraider.com>';
const FEEDBACK_SECRET = process.env.FEEDBACK_SECRET;

interface FeedbackEntry {
  id: string;
  category: string;
  categoryLabel: string;
  message: string;
  appVersion: string;
  platform: string;
  timestamp: string;
  receivedAt: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return handleGet(req, res);
  }

  if (req.method === 'POST') {
    return handlePost(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const token = req.query.token as string;
  if (!FEEDBACK_SECRET || token !== FEEDBACK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { blobs } = await list({ prefix: 'feedback/' });
    const entries: FeedbackEntry[] = [];

    for (const blob of blobs) {
      const response = await fetch(blob.url);
      if (response.ok) {
        entries.push(await response.json());
      }
    }

    entries.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());

    return res.status(200).json({
      count: entries.length,
      feedback: entries,
    });
  } catch (err: any) {
    console.error('Failed to retrieve feedback:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve feedback' });
  }
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const { category, message, appVersion, platform, timestamp } = req.body || {};

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const categoryLabel =
    category === 'bug' ? 'Bug Report' :
    category === 'feature' ? 'Feature Request' :
    'General Feedback';

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const receivedAt = new Date().toISOString();

  const entry: FeedbackEntry = {
    id,
    category: category || 'general',
    categoryLabel,
    message: message.trim(),
    appVersion: appVersion || 'unknown',
    platform: platform || 'unknown',
    timestamp: timestamp || receivedAt,
    receivedAt,
  };

  // Always store in Blob
  try {
    await put(`feedback/${id}.json`, JSON.stringify(entry, null, 2), {
      contentType: 'application/json',
      access: 'public',
    });
  } catch (err: any) {
    console.error('Failed to store feedback in blob:', err.message);
    // Don't fail the request — log it and continue
  }

  // Try email via Resend if configured
  if (RESEND_API_KEY) {
    try {
      const html = formatEmailHtml(categoryLabel, message, appVersion, platform, timestamp);
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: FEEDBACK_TO,
          subject: `[Braidr Feedback] ${categoryLabel}`,
          html,
        }),
      });
    } catch (err: any) {
      console.error('Resend email failed (non-fatal):', err.message);
    }
  }

  // Always log to Vercel logs as backup
  console.log('FEEDBACK_RECEIVED', JSON.stringify(entry));

  return res.status(200).json({ received: true, id });
}

function formatEmailHtml(
  categoryLabel: string,
  message: string,
  appVersion?: string,
  platform?: string,
  timestamp?: string,
): string {
  return `
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
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
