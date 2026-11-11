import { Request, Response } from 'express';
import { validateVisitPlannerInput } from '../validators/visitPlannerValidation';
import { generateVisitPlan } from '../services/visitPlannerService';

/**
 * Controller untuk endpoint AI Perencana Kunjungan
 * POST /api/visit-planner/recommendations
 */
export async function getVisitRecommendations(req: Request, res: Response): Promise<Response> {
  try {
    // 1. Validasi input request
    const validation = validateVisitPlannerInput(req.body);
    if (!validation.isValid || !validation.data) {
      return res.status(400).json({
        success: false,
        message: 'Validasi input gagal.',
        errors: validation.errors,
      });
    }

    // 2. Proses rekomendasi rute melalui service
    const result = await generateVisitPlan(validation.data);

    // 3. Kembalikan respons hasil rekomendasi
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in getVisitRecommendations:', error);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kegagalan pada server saat memproses rekomendasi rute.',
      error: error instanceof Error ? error.message : 'Internal Server Error',
    });
  }
}

