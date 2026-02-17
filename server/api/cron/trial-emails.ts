import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { listUsers, type UserRecord } from '../_lib/users';
import { sendEmail, trialDripEmail } from '../_lib/email';

const CRON_SECRET = process.env.CRON_SECRET;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Verify cron secret (Vercel Cron sends this automatically)
  const authHeader = req.headers.authorization;
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const users = await listUsers('all');
    let sent = 0;
    let skipped = 0;

    for (const user of users) {
      // Skip converted or unsubscribed users
      if (user.convertedAt || user.unsubscribedAt) {
        skipped++;
        continue;
      }

      const dayNumber = Math.floor(
        (Date.now() - new Date(user.registeredAt).getTime()) / 86400000
      ) + 1; // Day 1 = first day

      // Only send for days 1-14
      if (dayNumber < 1 || dayNumber > 14) {
        skipped++;
        continue;
      }

      // Check if we already sent this day's email
      const lastDripDay = user.lastDripDay || 0;
      if (lastDripDay >= dayNumber) {
        skipped++;
        continue;
      }

      const emailContent = trialDripEmail(dayNumber);
      if (!emailContent) {
        skipped++;
        continue;
      }

      try {
        await sendEmail({
          to: user.email,
          subject: emailContent.subject,
          html: emailContent.html,
        });

        // Update lastDripDay in KV
        const key = `user:${user.email.toLowerCase()}`;
        const record = await kv.get<UserRecord>(key);
        if (record) {
          record.lastDripDay = dayNumber;
          await kv.set(key, record);
        }

        sent++;
      } catch (err: any) {
        console.error(`Failed to send drip email to ${user.email}: ${err.message}`);
      }
    }

    return res.status(200).json({ sent, skipped, total: users.length });
  } catch (err: any) {
    console.error('Trial emails cron error:', err.message);
    return res.status(500).json({ error: 'Cron job failed' });
  }
}
