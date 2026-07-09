import { Router } from 'express';
import * as webhookController from '../controllers/webhook.controller';

const router = Router();

// Webhook routes are PUBLIC (called by Meta) — no auth middleware
// GET: Meta verification handshake
router.get('/whatsapp', webhookController.verifyWebhook);

// POST: Receive events — uses raw body middleware for signature verification
router.post('/whatsapp', webhookController.rawBodyMiddleware, webhookController.receiveWebhook);

export default router;
