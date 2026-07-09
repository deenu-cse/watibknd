import { Router } from 'express';
import { protect, requireTenant } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { createChatbotSchema, updateChatbotSchema } from '../validators/chatbot.validator';
import * as chatbotController from '../controllers/chatbot.controller';

const router = Router();

router.use(protect, requireTenant);

router.get('/', chatbotController.listChatbots);
router.post('/', validate(createChatbotSchema), chatbotController.createChatbot);
router.get('/:id', chatbotController.getChatbot);
router.patch('/:id', validate(updateChatbotSchema), chatbotController.updateChatbot);
router.delete('/:id', chatbotController.deleteChatbot);
router.patch('/:id/toggle', chatbotController.toggleChatbot);

export default router;
