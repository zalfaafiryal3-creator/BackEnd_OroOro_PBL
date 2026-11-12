import { Prisma } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { cleanString, isRecord } from '../lib/validate';

export type ReviewType = 'store' | 'market';

type ReviewFilter = 'all' | 'photo' | '5' | '4' | '1-3' | 'star_5' | 'star_4' | 'star_1_3';

const listByType = (type: ReviewType) =>
  prisma.review.findMany({
    where: { type, isDeleted: false, isPublic: true },
    orderBy: { id: 'desc' },
    select: { id: true, name: true, date: true, text: true, rating: true },
  });

const normalizeReviewFilter = (value?: string): ReviewFilter => {
  const normalized = (value ?? 'all').trim().toLowerCase();
  switch (normalized) {
    case 'photo':
    case 'with_photo':
      return 'photo';
    case '5':
    case 'star_5':
      return '5';
    case '4':
    case 'star_4':
      return '4';
    case '1-3':
    case '1_3':
    case 'star_1_3':
    case 'low':
      return '1-3';
    default:
      return 'all';
  }
};

const parseMarketId = (value: string | undefined): number | null => {
  if (!value) return null;
  const cleanValue = Number(value);
  return Number.isInteger(cleanValue) && cleanValue > 0 ? cleanValue : null;
};

const resolveStore = async (value: string | undefined) => {
  if (!value) return null;
  if (/^\d+$/.test(value)) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    return prisma.store.findUnique({ where: { id }, select: { id: true } });
  }
  if (value.length > 200 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    return null;
  }
  return prisma.store.findUnique({ where: { slug: value }, select: { id: true } });
};

const normalizePageValue = (value: unknown, fallback: number, max: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, max)
    : fallback;
};

const buildStoreReviewWhere = (
  storeId: number,
  filter: ReviewFilter,
  search?: string,
): Prisma.ReviewWhereInput => {
  const baseWhere: Prisma.ReviewWhereInput = {
    type: 'store',
    storeId,
    isDeleted: false,
    isPublic: true,
    rating: { gte: 1, lte: 5 },
  };
  const ratingWhere: Prisma.ReviewWhereInput = (() => {
    switch (filter) {
      case 'photo':
        return { photos: { some: { isPublic: true } } };
      case '5':
        return { rating: 5 };
      case '4':
        return { rating: 4 };
      case '1-3':
        return { rating: { in: [1, 2, 3] } };
      default:
        return {};
    }
  })();
  const conditions: Prisma.ReviewWhereInput[] = [baseWhere, ratingWhere];
  if (search) {
    conditions.push({
      OR: [
        { name: { contains: search } },
        { text: { contains: search } },
      ],
    });
  }
  return { AND: conditions };
};

export function getStoreReviews() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const store = await resolveStore(req.params.id);
      if (!store) {
        return res.status(404).json({ success: false, error: 'Toko tidak ditemukan.' });
      }

      const filter = normalizeReviewFilter(
        typeof req.query.filter === 'string' ? req.query.filter : undefined,
      );
      const search = cleanString(
        typeof req.query.search === 'string' ? req.query.search : undefined,
      )?.toLowerCase();
      const page = normalizePageValue(req.query.page, 1, Number.MAX_SAFE_INTEGER);
      const limit = normalizePageValue(req.query.limit, 20, 100);
      const skip = (page - 1) * limit;
      const where = buildStoreReviewWhere(store.id, filter, search);

      const [items, totalCount] = await Promise.all([
        prisma.review.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true,
            storeId: true,
            name: true,
            text: true,
            date: true,
            rating: true,
            createdAt: true,
            photos: {
              where: { isPublic: true },
              orderBy: { id: 'asc' },
              select: { id: true, url: true },
            },
          },
        }),
        prisma.review.count({ where }),
      ]);

      return res.json({
        success: true,
        data: items,
        total_count: totalCount,
        current_page_count: items.length,
        page,
        limit,
        filter,
      });
    } catch (error) {
      next(error);
    }
  };
}

export function getStoreReviewStatistics() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const store = await resolveStore(req.params.id);
      if (!store) {
        return res.status(404).json({ success: false, error: 'Toko tidak ditemukan.' });
      }

      const baseWhere: Prisma.ReviewWhereInput = {
        type: 'store',
        storeId: store.id,
        isDeleted: false,
        isPublic: true,
        rating: { gte: 1, lte: 5 },
      };
      const [totalReviews, withPhoto, star5, star4, star1To3] = await Promise.all([
        prisma.review.count({ where: baseWhere }),
        prisma.review.count({
          where: { ...baseWhere, photos: { some: { isPublic: true } } },
        }),
        prisma.review.count({ where: { ...baseWhere, rating: 5 } }),
        prisma.review.count({ where: { ...baseWhere, rating: 4 } }),
        prisma.review.count({ where: { ...baseWhere, rating: { in: [1, 2, 3] } } }),
      ]);

      return res.json({
        success: true,
        data: {
          total_reviews: totalReviews,
          with_photo: withPhoto,
          star_5: star5,
          star_4: star4,
          star_1_3: star1To3,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}

const buildMarketReviewWhere = (marketId: number, filter: ReviewFilter): Prisma.ReviewWhereInput => {
  const baseWhere: Prisma.ReviewWhereInput = {
    marketId,
    isDeleted: false,
    isPublic: true,
  };

  switch (filter) {
    case 'photo':
      return {
        ...baseWhere,
        photos: { some: { isPublic: true } },
      };
    case '5':
      return {
        ...baseWhere,
        overallRating: 5,
      };
    case '4':
      return {
        ...baseWhere,
        overallRating: 4,
      };
    case '1-3':
      return {
        ...baseWhere,
        overallRating: { in: [1, 2, 3] },
      };
    default:
      return baseWhere;
  }
};

const buildMarketReviewQuery = (
  marketId: number,
  filter: ReviewFilter,
  search?: string,
): Prisma.ReviewWhereInput => {
  const baseWhere = buildMarketReviewWhere(marketId, filter);

  if (!search) {
    return baseWhere;
  }

  return {
    AND: [
      baseWhere,
      {
        OR: [
          { name: { contains: search } },
          { text: { contains: search } },
        ],
      },
    ],
  };
};

const buildAllMarketReviewQuery = (
  filter: ReviewFilter,
  search?: string,
): Prisma.ReviewWhereInput => {
  const conditions: Prisma.ReviewWhereInput[] = [
    { type: 'market', isDeleted: false, isPublic: true },
  ];

  switch (filter) {
    case 'photo':
      conditions.push({ photos: { some: { isPublic: true } } });
      break;
    case '5':
      conditions.push({ overallRating: 5 });
      break;
    case '4':
      conditions.push({ overallRating: 4 });
      break;
    case '1-3':
      conditions.push({ overallRating: { in: [1, 2, 3] } });
      break;
    default:
      break;
  }

  if (search) {
    conditions.push({
      OR: [
        { name: { contains: search } },
        { text: { contains: search } },
      ],
    });
  }

  return { AND: conditions };
};

export function getPaginatedMarketReviews() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter = normalizeReviewFilter(
        typeof req.query.filter === 'string' ? req.query.filter : undefined,
      );
      const search = cleanString(
        typeof req.query.search === 'string' ? req.query.search : undefined,
      )?.toLowerCase();
      const page = normalizePageValue(req.query.page, 1, 1_000_000_000);
      const limit = normalizePageValue(req.query.limit, 10, 10);
      const skip = (page - 1) * limit;
      const where = buildAllMarketReviewQuery(filter, search);

      const [items, totalCount] = await Promise.all([
        prisma.review.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip,
          take: limit,
          select: {
            id: true,
            name: true,
            text: true,
            date: true,
            rating: true,
            overallRating: true,
            createdAt: true,
            photos: {
              where: { isPublic: true },
              orderBy: { id: 'asc' },
              select: { id: true, url: true },
            },
          },
        }),
        prisma.review.count({ where }),
      ]);

      return res.json({
        success: true,
        data: items,
        total_count: totalCount,
        current_page_count: items.length,
        page,
        limit,
        filter,
      });
    } catch (error) {
      next(error);
    }
  };
}

export function getAllMarketReviewStatistics() {
  return async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const baseWhere: Prisma.ReviewWhereInput = {
        type: 'market',
        isDeleted: false,
        isPublic: true,
      };
      const [totalReviews, withPhoto, star5, star4, star1To3] = await Promise.all([
        prisma.review.count({ where: baseWhere }),
        prisma.review.count({
          where: { ...baseWhere, photos: { some: { isPublic: true } } },
        }),
        prisma.review.count({ where: { ...baseWhere, overallRating: 5 } }),
        prisma.review.count({ where: { ...baseWhere, overallRating: 4 } }),
        prisma.review.count({
          where: { ...baseWhere, overallRating: { in: [1, 2, 3] } },
        }),
      ]);

      return res.json({
        success: true,
        data: {
          total_reviews: totalReviews,
          with_photo: withPhoto,
          star_5: star5,
          star_4: star4,
          star_1_3: star1To3,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}

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

export function getMarketReviews() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const marketId = parseMarketId(req.params.id);
      if (marketId === null) {
        return res.status(400).json({
          success: false,
          error: 'ID pasar tidak valid.',
        });
      }

      const filter = normalizeReviewFilter(req.query.filter as string | undefined);
      const search = cleanString(req.query.search as string | undefined)?.toLowerCase();
      const page = Math.max(1, Number(req.query.page ?? 1));
      const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 20)));
      const skip = (page - 1) * limit;

      const where = buildMarketReviewQuery(marketId, filter, search);

      const [items, totalCount] = await Promise.all([
        prisma.review.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true,
            marketId: true,
            name: true,
            text: true,
            date: true,
            rating: true,
            overallRating: true,
            createdAt: true,
            photos: {
              where: { isPublic: true },
              orderBy: { id: 'asc' },
              select: { id: true, url: true },
            },
          },
        }),
        prisma.review.count({ where }),
      ]);

      return res.json({
        success: true,
        data: items,
        total_count: totalCount,
        current_page_count: items.length,
        page,
        limit,
        filter,
      });
    } catch (error) {
      next(error);
    }
  };
}

export function getMarketReviewStatistics() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const marketId = parseMarketId(req.params.id);
      if (marketId === null) {
        return res.status(400).json({
          success: false,
          error: 'ID pasar tidak valid.',
        });
      }

      const baseWhere: Prisma.ReviewWhereInput = {
        marketId,
        isDeleted: false,
        isPublic: true,
      };

      const totalReviews = await prisma.review.count({ where: baseWhere });
      const withPhoto = await prisma.review.count({
        where: {
          ...baseWhere,
          photos: { some: { isPublic: true } },
        },
      });
      const star5 = await prisma.review.count({
        where: {
          ...baseWhere,
          overallRating: 5,
        },
      });
      const star4 = await prisma.review.count({
        where: {
          ...baseWhere,
          overallRating: 4,
        },
      });
      const star1To3 = await prisma.review.count({
        where: {
          ...baseWhere,
          overallRating: { in: [1, 2, 3] },
        },
      });

      const payload = {
        total_reviews: totalReviews,
        with_photo: withPhoto,
        star_5: star5,
        star_4: star4,
        star_1_3: star1To3,
      };

      return res.json({
        success: true,
        data: payload,
      });
    } catch (error) {
      next(error);
    }
  };
}

// POST: kirim ulasan baru, balasannya daftar ulasan terbaru (sesuai review_api.dart)
export function createReview(type: ReviewType, storeScoped = false) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const store = storeScoped ? await resolveStore(req.params.id) : null;
      if (storeScoped && !store) {
        return res.status(404).json({ success: false, error: 'Toko tidak ditemukan.' });
      }

      const errors: string[] = [];
      if (!isRecord(req.body)) errors.push('Data ulasan harus berupa objek.');
      const body = isRecord(req.body) ? req.body : {};
      const text = cleanString(body.text);
      const name = cleanString(body.name) || 'Anonim';
      const date = cleanString(body.date);
      const rating = body.rating;
      const ratingValue = typeof rating === 'number' ? rating : Number.NaN;
      const rawOverallRating = body.overallRating ?? body.overall_rating;
      const overallRatingValue =
        typeof rawOverallRating === 'number' && Number.isInteger(rawOverallRating)
          ? rawOverallRating
          : Number.NaN;
      const hasValidOverallRating =
        typeof rawOverallRating === 'number' && Number.isInteger(rawOverallRating) && rawOverallRating >= 1 && rawOverallRating <= 5;
      const marketId =
        body.marketId !== undefined || body.market_id !== undefined
          ? Number(body.marketId ?? body.market_id)
          : undefined;
      const isPublic = body.isPublic ?? body.is_public ?? true;
      const isDeleted = body.isDeleted ?? body.is_deleted ?? false;
      const photos = Array.isArray(body.photos) ? body.photos : [];

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
      if (rawOverallRating !== undefined && !hasValidOverallRating) {
        errors.push('Overall rating harus berupa bilangan bulat 1 sampai 5.');
      }
      if (marketId !== undefined && (!Number.isInteger(marketId) || marketId <= 0)) {
        errors.push('ID pasar tidak valid.');
      }
      if (typeof isPublic !== 'boolean') {
        errors.push('Status publik harus berupa boolean.');
      }
      if (typeof isDeleted !== 'boolean') {
        errors.push('Status dihapus harus berupa boolean.');
      }
      if (photos.some((entry) => typeof entry !== 'string')) {
        errors.push('URL foto harus berupa string.');
      }
      if (errors.length > 0) {
        return res.status(400).json({ error: errors[0], errors });
      }

      await prisma.review.create({
        data: {
          type,
          marketId: type === 'market' ? marketId ?? null : null,
          storeId: type === 'store' ? store?.id ?? null : null,
          name,
          date,
          text,
          rating: ratingValue,
          overallRating: Number.isNaN(overallRatingValue) ? ratingValue : overallRatingValue,
          isPublic: Boolean(isPublic),
          isDeleted: Boolean(isDeleted),
          photos: {
            create: photos.map((url) => ({ url, isPublic: true })),
          },
        },
      });
      if (storeScoped && store) {
        return res.status(201).json({
          success: true,
          data: await prisma.review.findMany({
            where: {
              type: 'store',
              storeId: store.id,
              isDeleted: false,
              isPublic: true,
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true, name: true, date: true, text: true, rating: true },
          }),
        });
      }
      return res.status(201).json(await listByType(type));
    } catch (error) {
      next(error);
    }
  };
}
