import crypto from 'crypto';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * Verify Meta webhook X-Hub-Signature-256 header.
 * Ensures the webhook payload actually came from Meta, not a spoofed request.
 *
 * @param rawBody - Raw request body (Buffer)
 * @param signature - X-Hub-Signature-256 header value
 * @returns true if signature is valid
 */
export function verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
  if (!env.META_APP_SECRET) {
    logger.warn('META_APP_SECRET not set — skipping webhook signature verification (dev only)');
    return true;
  }

  if (!signature) {
    logger.warn('Missing X-Hub-Signature-256 header on webhook request');
    return false;
  }

  const expectedSignature =
    'sha256=' +
    crypto
      .createHmac('sha256', env.META_APP_SECRET)
      .update(rawBody)
      .digest('hex');

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}
