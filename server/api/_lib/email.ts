import crypto from 'crypto';

const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const FROM_EMAIL = process.env.FROM_EMAIL || 'Braidr <noreply@getbraider.com>';
const BASE_URL = process.env.BASE_URL || 'https://braidr-api.vercel.app';
const UNSUBSCRIBE_SECRET = process.env.ADMIN_API_KEY || 'braidr-unsub';

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

function unsubscribeUrl(email: string): string {
  const token = crypto.createHmac('sha256', UNSUBSCRIBE_SECRET).update(email.toLowerCase()).digest('hex');
  return `${BASE_URL}/api/users/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
}

function emailLayout(content: string, email?: string): string {
  const unsubLink = email
    ? `<p style="font-size: 12px; color: #a1a1aa; margin-top: 32px;"><a href="${unsubscribeUrl(email)}" style="color: #a1a1aa;">Unsubscribe</a> from Braidr emails</p>`
    : '';
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      ${content}
      <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;" />
      <p style="font-size: 13px; color: #a1a1aa;">Braidr — The braided novel writing tool</p>
      ${unsubLink}
    </div>
  `;
}

export function welcomeEmail(): string {
  return emailLayout(`
    <h1 style="font-size: 24px; color: #1a1a1a;">Welcome to Braidr!</h1>
    <p style="font-size: 16px; color: #4a4a4a; line-height: 1.6;">
      Your subscription is now active. Return to Braidr and click "I already subscribed" to activate your account.
    </p>
    <p style="font-size: 16px; color: #4a4a4a; line-height: 1.6;">
      If you ever need to manage your subscription, update your payment method, or view invoices, click
      "Manage Subscription" in Braidr's settings.
    </p>
  `);
}

export function paymentFailedEmail(): string {
  return emailLayout(`
    <h1 style="font-size: 24px; color: #1a1a1a;">Payment failed</h1>
    <p style="font-size: 16px; color: #4a4a4a; line-height: 1.6;">
      We weren't able to process your latest payment for Braidr. Please update your card to keep your subscription active.
    </p>
    <p style="font-size: 16px; color: #4a4a4a; line-height: 1.6;">
      You can update your payment method by clicking "Manage Subscription" in Braidr's settings.
    </p>
  `);
}

interface DripEmail {
  subject: string;
  html: string;
}

const DRIP_EMAILS: Record<number, { subject: string; content: string }> = {
  1: {
    subject: 'Welcome to Braidr',
    content: `
      <h1 style="font-size: 24px; color: #1a1a1a;">Welcome to Braidr!</h1>
      <p style="font-size: 16px; color: #4a4a4a; line-height: 1.6;">
        You're starting your 14-day free trial. Here's how to get started:
      </p>
      <ul style="font-size: 16px; color: #4a4a4a; line-height: 1.8;">
        <li>Create a project for your novel</li>
        <li>Add your POV characters</li>
        <li>Write your first scene</li>
      </ul>
      <p style="font-size: 16px; color: #4a4a4a; line-height: 1.6;">Happy writing!</p>
    `,
  },
  2: {
    subject: 'Your story has structure',
    content: `
      <h1 style="font-size: 24px; color: #1a1a1a;">Two ways to see your story</h1>
      <p style="font-size: 16px; color: #4a4a4a; line-height: 1.6;">
        <strong>POV View</strong> shows one character's arc — their journey through your story.
      </p>
      <p style="font-size: 16px; color: #4a4a4a; line-height: 1.6;">
        <strong>Braided View</strong> weaves all characters together in reading order.
      </p>
      <p style="font-size: 16px; color: #4a4a4a; line-height: 1.6;">
        This two-notebook model is what makes Braidr different — you can think about each character's arc independently while keeping the big picture in sync.
      </p>
    `,
  },
  3: {
    subject: 'The editor is your canvas',
    content: `
      <h1 style="font-size: 24px; color: #1a1a1a;">Writing in Braidr</h1>
      <p style="font-size: 16px; color: #4a4a4a; line-height: 1.6;">
        The scene editor is where your story comes to life. Write scene drafts, use focus mode to eliminate distractions, and keep your notes close at hand.
      </p>
    `,
  },
  4: {
    subject: 'Organize with tags',
    content: `
      <h1 style="font-size: 24px; color: #1a1a1a;">Tags bring your story together</h1>
      <p style="font-size: 16px; color: #4a4a4a; line-height: 1.6;">
        Create tags for characters, locations, and arcs. Then filter across both views to see every scene where a character appears, or every scene set in a particular location.
      </p>
    `,
  },
  5: {
    subject: 'Notes that connect',
    content: `
      <h1 style="font-size: 24px; color: #1a1a1a;">Keep your worldbuilding close</h1>
      <p style="font-size: 16px; color: #4a4a4a; line-height: 1.6;">
        Linked notes and scene references help you build a rich world without losing track of details. Everything stays connected to the scenes that matter.
      </p>
    `,
  },
  6: {
    subject: 'Set goals, track progress',
    content: `
      <h1 style="font-size: 24px; color: #1a1a1a;">Write with intention</h1>
      <p style="font-size: 16px; color: #4a4a4a; line-height: 1.6;">
        Set daily and project word goals. Track your writing streaks and see analytics on your progress over time.
      </p>
    `,
  },
  7: {
    subject: "You're halfway through your trial!",
    content: `
      <h1 style="font-size: 24px; color: #1a1a1a;">One week down!</h1>
      <p style="font-size: 16px; color: #4a4a4a; line-height: 1.6;">
        You're halfway through your free trial. Have you tried the braided timeline view yet? It's one of the features writers love most — drag and drop scenes to reorder your entire novel's reading order.
      </p>
    `,
  },
  8: {
    subject: 'Compile your manuscript',
    content: `
      <h1 style="font-size: 24px; color: #1a1a1a;">Export in one click</h1>
      <p style="font-size: 16px; color: #4a4a4a; line-height: 1.6;">
        When you're ready, compile your manuscript to Markdown, DOCX, or PDF. Your braided timeline becomes a complete, ordered manuscript.
      </p>
    `,
  },
  9: {
    subject: 'Connections & characters',
    content: `
      <h1 style="font-size: 24px; color: #1a1a1a;">Map your cast</h1>
      <p style="font-size: 16px; color: #4a4a4a; line-height: 1.6;">
        Map relationships between characters and visualize how your cast connects across storylines.
      </p>
    `,
  },
  10: {
    subject: 'Your data is yours',
    content: `
      <h1 style="font-size: 24px; color: #1a1a1a;">No lock-in, ever</h1>
      <p style="font-size: 16px; color: #4a4a4a; line-height: 1.6;">
        Your projects are stored as local files. Back them up however you like — Dropbox, iCloud, git. If you ever leave Braidr, your work goes with you.
      </p>
    `,
  },
  11: {
    subject: '3 days left on your trial',
    content: `
      <h1 style="font-size: 24px; color: #1a1a1a;">Your trial ends in 3 days</h1>
      <p style="font-size: 16px; color: #4a4a4a; line-height: 1.6;">
        Subscribe now to keep writing with the braided timeline, character tags, word goals, and all the tools that make multi-POV novels manageable.
      </p>
      <p style="font-size: 16px; color: #4a4a4a; line-height: 1.6;">
        <strong>$39/year</strong> — click "Subscribe" in Braidr to get started.
      </p>
    `,
  },
  12: {
    subject: 'Advanced: mood check-ins & milestones',
    content: `
      <h1 style="font-size: 24px; color: #1a1a1a;">There's more to discover</h1>
      <p style="font-size: 16px; color: #4a4a4a; line-height: 1.6;">
        Track your writing mood, set milestones for your project, and celebrate progress along the way. Braidr grows with your writing practice.
      </p>
      <p style="font-size: 16px; color: #4a4a4a; line-height: 1.6;">
        <strong>$39/year</strong> — click "Subscribe" in Braidr to continue.
      </p>
    `,
  },
  13: {
    subject: 'Your trial ends tomorrow',
    content: `
      <h1 style="font-size: 24px; color: #1a1a1a;">Last day of your trial</h1>
      <p style="font-size: 16px; color: #4a4a4a; line-height: 1.6;">
        Tomorrow your free trial ends. Subscribe today to keep access to all of Braidr's features.
      </p>
      <p style="font-size: 16px; color: #4a4a4a; line-height: 1.6;">
        <strong>$39/year</strong> — click "Subscribe" in Braidr.
      </p>
    `,
  },
  14: {
    subject: 'Your trial has ended',
    content: `
      <h1 style="font-size: 24px; color: #1a1a1a;">Your free trial is over</h1>
      <p style="font-size: 16px; color: #4a4a4a; line-height: 1.6;">
        Your 14-day free trial has ended. Subscribe to keep writing with Braidr — your projects and data are still there, waiting for you.
      </p>
      <p style="font-size: 16px; color: #4a4a4a; line-height: 1.6;">
        <strong>$39/year</strong> — open Braidr and click "Subscribe" to pick up where you left off.
      </p>
    `,
  },
};

export function trialDripEmail(dayNumber: number): DripEmail | null {
  const drip = DRIP_EMAILS[dayNumber];
  if (!drip) return null;

  return {
    subject: drip.subject,
    html: emailLayout(drip.content),
  };
}

// Keep for backward compatibility during migration — can be deleted after deploy
export function licenseKeyEmail(licenseKey: string): string {
  return emailLayout(`
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
  `);
}
