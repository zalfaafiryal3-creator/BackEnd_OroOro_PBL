import { Router } from 'express';
import { getVisitRecommendations } from '../controllers/visitPlannerController';

const router = Router();

// POST /api/visit-planner/recommendations
router.post('/recommendations', getVisitRecommendations);

export default router;

