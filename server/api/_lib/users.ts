import { kv } from '@vercel/kv';

export interface UserRecord {
  email: string;
  registeredAt: string;
  trialStartDate: string;
  source?: string;
  convertedAt?: string;
  unsubscribedAt?: string;
  lastDripDay?: number;
}

function userKey(email: string): string {
  return `user:${email.toLowerCase()}`;
}

export async function registerUser(email: string, source?: string): Promise<UserRecord> {
  const key = userKey(email);
  const existing = await kv.get<UserRecord>(key);
  if (existing) return existing;

  const now = new Date().toISOString();
  const record: UserRecord = {
    email: email.toLowerCase(),
    registeredAt: now,
    trialStartDate: now,
    source: source || 'app',
  };

  await kv.set(key, record);
  return record;
}

export async function markConverted(email: string): Promise<void> {
  const key = userKey(email);
  const existing = await kv.get<UserRecord>(key);
  if (existing) {
    existing.convertedAt = new Date().toISOString();
    await kv.set(key, existing);
  }
}

export async function getUser(email: string): Promise<UserRecord | null> {
  return kv.get<UserRecord>(userKey(email));
}

export async function unsubscribeUser(email: string): Promise<void> {
  const key = userKey(email);
  const existing = await kv.get<UserRecord>(key);
  if (existing) {
    existing.unsubscribedAt = new Date().toISOString();
    await kv.set(key, existing);
  }
}

export async function listUsers(filter?: 'trial' | 'converted' | 'expired' | 'all'): Promise<UserRecord[]> {
  const keys: string[] = [];
  let cursor: number = 0;
  do {
    const result = await kv.scan(cursor, { match: 'user:*', count: 100 });
    cursor = Number(result[0]);
    keys.push(...(result[1] as string[]));
  } while (cursor !== 0);

  const users: UserRecord[] = [];
  for (const key of keys) {
    const user = await kv.get<UserRecord>(key);
    if (!user) continue;

    if (!filter || filter === 'all') {
      users.push(user);
      continue;
    }

    const trialDays = 14;
    const trialExpired = new Date(user.trialStartDate).getTime() + trialDays * 86400000 < Date.now();

    if (filter === 'converted' && user.convertedAt) {
      users.push(user);
    } else if (filter === 'trial' && !user.convertedAt && !trialExpired) {
      users.push(user);
    } else if (filter === 'expired' && !user.convertedAt && trialExpired) {
      users.push(user);
    }
  }

  return users;
}
