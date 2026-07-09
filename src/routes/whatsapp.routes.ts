import { Router } from 'express';
import { protect } from '../middlewares/auth.middleware';
import * as whatsappController from '../controllers/whatsapp.controller';

const router = Router();

// All WhatsApp routes require authentication
router.use(protect);

router.post('/connect', whatsappController.connectAccount);
router.get('/status', whatsappController.getStatus);

export default router;
