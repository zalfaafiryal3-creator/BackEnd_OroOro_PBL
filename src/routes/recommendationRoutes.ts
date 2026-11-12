import { Router } from 'express';
import {
  getFeaturedProducts,
  getRecommendedProducts,
  getRecommendedStores,
} from '../controllers/recommendationController';

const router = Router();

router.get('/stores', getRecommendedStores);
router.get('/products', getRecommendedProducts);
router.get('/featured-products', getFeaturedProducts);

export default router;
