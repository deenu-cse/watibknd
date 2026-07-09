import { Router } from 'express';
import { protect, requireTenant } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { sendMessageSchema, updateConversationSchema } from '../validators/conversation.validator';
import * as conversationController from '../controllers/conversation.controller';

const router = Router();

// All routes require auth + tenant
router.use(protect, requireTenant);

router.get('/', conversationController.listConversations);
router.get('/:id', conversationController.getConversation);
router.post('/:id/messages', validate(sendMessageSchema), conversationController.sendMessage);
router.patch('/:id/status', validate(updateConversationSchema), conversationController.updateStatus);

export default router;
