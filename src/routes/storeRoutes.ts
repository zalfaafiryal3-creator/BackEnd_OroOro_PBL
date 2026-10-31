import { Router } from 'express';
import {
  createStore,
  deleteStore,
  getStore,
  listManagedStores,
  listStores,
  updateStore,
} from '../controllers/storeController';
import { authMiddleware } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/requireRole';

const router = Router();
const staff = [authMiddleware, requireRole('admin', 'seller')];

router.get('/', listStores); // terbuka untuk umum (dipakai mobile)
router.get('/manage', ...staff, listManagedStores); // HARUS di atas '/:id'
router.get('/:id', getStore); // terbuka untuk umum
router.post('/', ...staff, createStore);
router.put('/:id', ...staff, updateStore);
router.delete('/:id', ...staff, deleteStore);

export default router;