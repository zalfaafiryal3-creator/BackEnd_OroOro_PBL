import { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { cleanString, isRecord } from '../lib/validate';

export type ReviewType = 'store' | 'market';

const listByType = (type: ReviewType) =>
  prisma.review.findMany({
    where: { type },
    orderBy: { id: 'desc' },
    select: { id: true, name: true, date: true, text: true, rating: true },
  });

// GET: ambil semua ulasan (toko atau pasar)
export function listReviews(type: ReviewType) {
  return async (_req: Request, res: Response, next: NextFunction) => {
    try {
      return res.json(await listByType(type));
    } catch (error) {
      next(error);
    }
  };
}

// POST: kirim ulasan baru, balasannya daftar ulasan terbaru (sesuai review_api.dart)
export function createReview(type: ReviewType) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors: string[] = [];
      if (!isRecord(req.body)) errors.push('Data ulasan harus berupa objek.');
      const body = isRecord(req.body) ? req.body : {};
      const text = cleanString(body.text);
      const name = cleanString(body.name) || 'Anonim';
      const date = cleanString(body.date);
      const rating = body.rating;
      const ratingValue = typeof rating === 'number' ? rating : Number.NaN;

      if (typeof body.text !== 'string' || !text) {
        errors.push('Ulasan wajib berupa teks dan tidak boleh kosong.');
      } else if (text.length > 1000) {
        errors.push('Ulasan maksimal 1000 karakter.');
      }
      if (body.name !== undefined && typeof body.name !== 'string') {
        errors.push('Nama harus berupa teks.');
      } else if (name.length > 60) {
        errors.push('Nama maksimal 60 karakter.');
      }
      if (body.date !== undefined && typeof body.date !== 'string') {
        errors.push('Tanggal ulasan harus berupa teks.');
      } else if (date.length > 100) {
        errors.push('Tanggal ulasan maksimal 100 karakter.');
      }
      if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
        errors.push('Rating harus berupa bilangan bulat 1 sampai 5.');
      }
      if (errors.length > 0) {
        return res.status(400).json({ error: errors[0], errors });
      }

      await prisma.review.create({ data: { type, name, date, text, rating: ratingValue } });
      return res.status(201).json(await listByType(type));
    } catch (error) {
      next(error);
    }
  };
}
