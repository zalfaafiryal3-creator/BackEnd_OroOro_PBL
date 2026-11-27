import { Router } from 'express';
import { createSeller, deleteSeller, listSellers, updateSeller } from '../controllers/sellerController';
import { authMiddleware } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/requireRole';

const router = Router();
const staff = [authMiddleware, requireRole('admin', 'seller')];

router.get('/', ...staff, listSellers);
router.post('/', ...staff, createSeller);
router.put('/:id', ...staff, updateSeller);
router.delete('/:id', ...staff, deleteSeller);

export default router;
