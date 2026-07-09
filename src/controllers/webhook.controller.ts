import { Request, Response } from 'express';
import express from 'express';
import { asyncHandler } from '../middlewares/error.middleware';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { verifyWebhookSignature } from '../utils/webhookVerify';
import { processWebhookEvent } from '../services/webhook.service';

/**
 * GET /api/webhooks/whatsapp
 * Meta webhook verification (challenge-response handshake).
 */
export const verifyWebhook = (req: Request, res: Response) => {
  const mode = req.query['hub.mode'] as string;
  const token = req.query['hub.verify_token'] as string;
  const challenge = req.query['hub.challenge'] as string;

  if (mode === 'subscribe' && token === env.WEBHOOK_VERIFY_TOKEN) {
    logger.info('✅ Webhook verified successfully');
    return res.status(200).send(challenge);
  }

  logger.warn('❌ Webhook verification failed');
  return res.sendStatus(403);
};

/**
 * POST /api/webhooks/whatsapp
 * Receive incoming webhook events from Meta.
 * Uses raw body for signature verification.
 */
export const receiveWebhook = asyncHandler(async (req: Request, res: Response) => {
  // Always respond 200 immediately — Meta expects fast acknowledgement
  res.sendStatus(200);

  // Verify signature
  const signature = req.headers['x-hub-signature-256'] as string;
  const rawBody = (req as any).rawBody as Buffer;

  if (rawBody && !verifyWebhookSignature(rawBody, signature)) {
    logger.error('Webhook signature verification failed — ignoring payload');
    return;
  }

  // Parse the body (it was buffered as raw)
  let body: any;
  try {
    body = JSON.parse(rawBody?.toString() || '{}');
  } catch {
    logger.error('Failed to parse webhook body');
    return;
  }

  if (body.object !== 'whatsapp_business_account') {
    logger.debug('Ignoring non-WhatsApp webhook event');
    return;
  }

  // Process events asynchronously
  const io = req.app.get('io');
  processWebhookEvent(body.entry || [], io).catch((err) => {
    logger.error('Webhook processing error:', err);
  });
});

/**
 * Raw body middleware for webhook route.
 * Captures raw buffer before JSON parsing for signature verification.
 */
export const rawBodyMiddleware = express.raw({
  type: 'application/json',
  limit: '1mb',
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  },
});
