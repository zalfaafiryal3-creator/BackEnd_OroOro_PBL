import { Router } from 'express';
import {
  createStore,
  deleteStore,
  getManagedStore,
  getStore,
  listManagedStores,
  listStores,
  updateStore,
} from '../controllers/storeController';
import {
  dryRunMobileStoreSync,
  importMobileStores,
} from '../controllers/mobileStoreSyncController';
import { authMiddleware } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/requireRole';

const router = Router();
const staff = [authMiddleware, requireRole('admin', 'seller')];
const adminOnly = [authMiddleware, requireRole('admin')];

router.get('/', listStores); // terbuka untuk umum (dipakai mobile)
router.get('/manage', ...staff, listManagedStores); // HARUS di atas '/:id'
router.get('/manage/:id', ...staff, getManagedStore);
router.post('/mobile-sync/dry-run', ...adminOnly, dryRunMobileStoreSync);
router.post('/mobile-sync/import', ...adminOnly, importMobileStores);
router.get('/:id', getStore); // terbuka untuk umum
router.post('/', ...staff, createStore);
router.put('/:id', ...staff, updateStore);
router.delete('/:id', ...staff, deleteStore);

export default router;