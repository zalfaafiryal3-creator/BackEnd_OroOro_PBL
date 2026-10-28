import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { cleanString } from '../lib/validate';

export type ReviewType = 'store' | 'market';

const listByType = (type: ReviewType) =>
  prisma.review.findMany({
    where: { type },
    orderBy: { id: 'desc' },
    select: { id: true, name: true, date: true, text: true, rating: true },
  });

// GET: ambil semua ulasan (toko atau pasar)
export function listReviews(type: ReviewType) {
  return async (_req: Request, res: Response) => {
    try {
      return res.json(await listByType(type));
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Terjadi kesalahan di server.' });
    }
  };
}

// POST: kirim ulasan baru, balasannya daftar ulasan terbaru (sesuai review_api.dart)
export function createReview(type: ReviewType) {
  return async (req: Request, res: Response) => {
    try {
      const text = cleanString(req.body?.text);
      const name = cleanString(req.body?.name) || 'Anonim';
      const date = cleanString(req.body?.date);
      const rating = Math.round(Number(req.body?.rating ?? 5));

      if (!text) return res.status(400).json({ error: 'Ulasan tidak boleh kosong.' });
      if (text.length > 1000) return res.status(400).json({ error: 'Ulasan maksimal 1000 karakter.' });
      if (name.length > 60) return res.status(400).json({ error: 'Nama maksimal 60 karakter.' });
      if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Rating harus 1 sampai 5.' });

      await prisma.review.create({ data: { type, name, date, text, rating } });
      return res.status(201).json(await listByType(type));
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Terjadi kesalahan di server.' });
    }
  };
}
