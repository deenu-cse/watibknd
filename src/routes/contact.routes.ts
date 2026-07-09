import { Router } from 'express';
import multer from 'multer';
import { protect, requireTenant } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { createContactSchema, updateContactSchema, tagSchema } from '../validators/contact.validator';
import * as contactController from '../controllers/contact.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB max

// All routes require auth + tenant
router.use(protect, requireTenant);

router.get('/', contactController.listContacts);
router.post('/', validate(createContactSchema), contactController.createContact);
router.post('/import', upload.single('file'), contactController.importContacts);

router.get('/:id', contactController.getContact);
router.patch('/:id', validate(updateContactSchema), contactController.updateContact);
router.delete('/:id', contactController.deleteContact);

router.post('/:id/tags', validate(tagSchema), contactController.addTags);
router.delete('/:id/tags', validate(tagSchema), contactController.removeTags);

export default router;
