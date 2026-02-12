import * as crypto from 'crypto';

const MAGIC_LINK_SECRET = process.env.MAGIC_LINK_SECRET || 'change-me-in-production';
const TOKEN_EXPIRY_MINUTES = 60;

export function generateMagicToken(email: string): string {
  const payload = JSON.stringify({
    email: email.toLowerCase().trim(),
    exp: Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000,
  });
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(MAGIC_LINK_SECRET, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(payload, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function verifyMagicToken(token: string): string | null {
  try {
    const [ivHex, encrypted] = token.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const key = crypto.scryptSync(MAGIC_LINK_SECRET, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    const payload = JSON.parse(decrypted);
    if (payload.exp < Date.now()) return null;
    return payload.email;
  } catch {
    return null;
  }
}
