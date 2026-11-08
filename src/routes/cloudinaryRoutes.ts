import { Router } from 'express';
import { getSignature, confirmUpload } from '../controllers/cloudinaryController';
import { authMiddleware } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/requireRole';

const router = Router();

// Signed direct‑upload payload generation (admin only)
router.post('/signature', authMiddleware, requireRole('admin'), getSignature);

// Confirm the uploaded asset and update the store record (admin only)
router.post('/confirm', authMiddleware, requireRole('admin'), confirmUpload);

export default router;

