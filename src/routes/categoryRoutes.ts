import { Router } from 'express';
import { createCategory, deleteCategory, listCategories, updateCategory } from '../controllers/categoryController';
import { authMiddleware } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/requireRole';

const router = Router();

router.get('/', listCategories); // terbuka untuk umum (dipakai mobile)
router.post('/', authMiddleware, requireRole('admin'), createCategory);
router.put('/:id', authMiddleware, requireRole('admin'), updateCategory);
router.delete('/:id', authMiddleware, requireRole('admin'), deleteCategory);

export default router;