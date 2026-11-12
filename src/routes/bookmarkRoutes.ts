import { Router } from 'express';
import {
  addBookmark,
  getBookmarkStatus,
  listBookmarks,
  removeBookmark,
} from '../controllers/bookmarkController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.use(authMiddleware);
router.get('/', listBookmarks);
router.post('/', addBookmark);
router.get('/:productId/status', getBookmarkStatus);
router.delete('/:productId', removeBookmark);

export default router;
