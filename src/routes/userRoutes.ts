import { Router } from 'express';
import { createUser, deleteUser, listUsers, updateUser } from '../controllers/userController';
import { authMiddleware } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/requireRole';

const router = Router();
const adminOnly = [authMiddleware, requireRole('admin')];

router.get('/', ...adminOnly, listUsers);
router.post('/', ...adminOnly, createUser);
router.put('/:id', ...adminOnly, updateUser);
router.delete('/:id', ...adminOnly, deleteUser);

export default router;
