// Shared symmetric encryption for at-rest secrets (settings, provider configs).
// AES-256-GCM with a key derived from OUTBOUND_SECRET_KEY (falls back to the
// DATABASE_URL, then a dev constant). Encrypted payloads are prefixed with
// `enc:` so callers can tell plaintext from ciphertext.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(value: string): string {
  try {
    const [, iv, tag, encrypted] = value.split(':');
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('enc:');
}

function encryptionKey() {
  return createHash('sha256')
    .update(process.env.OUTBOUND_SECRET_KEY || process.env.DATABASE_URL || 'geolead-ai-local-dev-key')
    .digest();
}
