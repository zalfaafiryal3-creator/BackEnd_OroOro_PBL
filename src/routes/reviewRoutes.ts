import { Router } from 'express';
import { createReview, listReviews, ReviewType } from '../controllers/reviewController';
import { reviewLimiter } from '../middleware/rateLimiter';

function buildReviewRouter(type: ReviewType) {
  const router = Router();
  router.get('/', listReviews(type));
  router.post('/', reviewLimiter, createReview(type));
  return router;
}

export const storeReviewRoutes = buildReviewRouter('store');
export const marketReviewRoutes = buildReviewRouter('market');
