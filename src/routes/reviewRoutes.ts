import { Router } from 'express';
import {
  getAllMarketReviewStatistics,
  createReview,
  getPaginatedMarketReviews,
  getMarketReviewStatistics,
  getMarketReviews,
  listReviews,
  ReviewType,
} from '../controllers/reviewController';
import { reviewLimiter } from '../middleware/rateLimiter';

function buildReviewRouter(type: ReviewType) {
  const router = Router();
  router.get('/', listReviews(type));
  router.post('/', reviewLimiter, createReview(type));
  return router;
}

export const storeReviewRoutes = buildReviewRouter('store');
export const marketReviewRoutes = buildReviewRouter('market');
marketReviewRoutes.get('/page', getPaginatedMarketReviews());
marketReviewRoutes.get('/statistics', getAllMarketReviewStatistics());

export const marketReviewListRouter = Router();
marketReviewListRouter.get('/:id/reviews', getMarketReviews());
marketReviewListRouter.get('/:id/reviews/statistics', getMarketReviewStatistics());
