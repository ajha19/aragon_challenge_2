import { Router } from 'express';
import multer from 'multer';
import { MediaController } from '../controllers/media.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload', upload.single('file'), MediaController.upload);
router.get('/:id/status', MediaController.getStatus);
router.post('/:id/reprocess', MediaController.reprocess);

export default router;
