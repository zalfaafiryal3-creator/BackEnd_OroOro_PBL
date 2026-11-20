import { Router } from 'express';
import {
  createPromotion,
  deletePromotion,
  listManagedPromotions,
  listPromotions,
  updatePromotion,
} from '../controllers/promotionController';
import { authMiddleware } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/requireRole';

const router = Router();
const staff = [authMiddleware, requireRole('admin', 'seller')];

router.get('/', listPromotions);
router.get('/manage', ...staff, listManagedPromotions);
router.post('/', ...staff, createPromotion);
router.put('/:id', ...staff, updatePromotion);
router.delete('/:id', ...staff, deletePromotion);

export default router;
