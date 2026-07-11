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
  return `enc:v2:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(value: string): string {
  try {
    const parts = value.split(':');
    const versioned = parts[1] === 'v2';
    const [iv, tag, encrypted] = versioned ? parts.slice(2) : parts.slice(1);
    const decipher = createDecipheriv('aes-256-gcm', versioned ? encryptionKey() : legacyEncryptionKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Stored credential could not be authenticated or decrypted.');
  }
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('enc:');
}

function encryptionKey() {
  const secret = process.env.SECRET_ENCRYPTION_KEY || (process.env.NODE_ENV !== 'production' ? process.env.OUTBOUND_SECRET_KEY : undefined);
  if (!secret) {
    throw new Error('SECRET_ENCRYPTION_KEY must be set for encryption in production.');
  }
  if (process.env.NODE_ENV === 'production' && secret.length < 32) throw new Error('SECRET_ENCRYPTION_KEY must be at least 32 characters.');
  return createHash('sha256').update(secret).digest();
}

function legacyEncryptionKey() {
  const secret = process.env.OUTBOUND_SECRET_KEY;
  if (!secret) throw new Error('OUTBOUND_SECRET_KEY is required temporarily to decrypt legacy credentials.');
  return createHash('sha256').update(secret).digest();
}
