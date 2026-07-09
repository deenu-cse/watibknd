import crypto from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Get the encryption key as a Buffer.
 * Uses first 32 bytes of TOKEN_ENCRYPTION_KEY.
 */
function getKey(): Buffer {
  // If the key is hex-encoded (64 chars), decode it; otherwise use as-is
  const keyStr = env.TOKEN_ENCRYPTION_KEY;
  if (keyStr.length === 64 && /^[0-9a-fA-F]+$/.test(keyStr)) {
    return Buffer.from(keyStr, 'hex');
  }
  // Use SHA-256 hash of the key string to ensure exactly 32 bytes
  return crypto.createHash('sha256').update(keyStr).digest();
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a combined string: iv:encrypted:authTag (all hex-encoded).
 *
 * Used to encrypt WhatsApp access tokens at rest in the database.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:encrypted:authTag
  return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
}

/**
 * Decrypt an AES-256-GCM encrypted string.
 * Expects format: iv:encrypted:authTag (all hex-encoded).
 */
export function decrypt(encryptedData: string): string {
  const key = getKey();
  const parts = encryptedData.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const authTag = Buffer.from(parts[2], 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
