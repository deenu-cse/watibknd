import { Router } from 'express';
import { protect, requireTenant } from '../middlewares/auth.middleware';
import * as templateController from '../controllers/template.controller';

const router = Router();

router.use(protect, requireTenant);

router.get('/', templateController.listTemplates);
router.post('/', templateController.createTemplate);

export default router;
