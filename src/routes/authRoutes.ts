import { Router } from 'express';
import { login, logout, me, register } from '../controllers/authController';
import { authMiddleware } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/requireRole';
import { loginLimiter, registerLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/logout', logout);
router.get('/me', authMiddleware, me);

// Contoh route khusus admin, untuk mencoba requireRole
router.get('/admin-check', authMiddleware, requireRole('admin'), (_req, res) => {
  res.json({ message: 'Halo admin, kamu punya akses.' });
});

export default router;
