import { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { getStoreReviewMetrics } from '../services/storeReviewMetrics';
import {
  buildRecommendationProductDto,
  listCatalogProducts,
} from '../services/recommendationData';
import { resolveStoreImageUrl } from '../services/storeImageUrl';

const publicStoreStatuses = ['buka', 'tutup'];
const recommendedStoreNames = [
  'Bakso Goreng Bagoplek',
  'Lumpur Kentang 27',
  'Sego Liwet Bakar Kemangi',
  'Klepon-ku',
];

type StoreRating = {
  rating: number;
  reviewCount: number;
};

function errorResponse(
  res: Response,
  status: number,
  message: string,
  data: unknown = null,
) {
  return res.status(status).json({
    success: false,
    message,
    data,
    error: message,
  });
}

function compareStoreQuality(
  first: StoreRating,
  second: StoreRating,
): number {
  return (
    second.rating - first.rating ||
    second.reviewCount - first.reviewCount
  );
}

export async function getRecommendedStores(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const stores = await prisma.store.findMany({
      where: { status: { in: publicStoreStatuses } },
      include: {
        category: true,
        _count: {
          select: {
            products: true,
          },
        },
      },
      orderBy: { id: 'asc' },
    });
    const metrics = await getStoreReviewMetrics(stores.map((store) => store.id));
    const byName = new Map(
      stores.map((store) => [store.name.trim().toLowerCase(), store]),
    );
    const missingStores = recommendedStoreNames.filter(
      (name) => !byName.has(name.toLowerCase()),
    );

    const recommended = recommendedStoreNames.flatMap((name) => {
      const store = byName.get(name.toLowerCase());
      if (!store) return [];

      const metric = metrics.get(store.id);
      return [{
        id: store.id,
        slug: store.slug,
        name: store.name,
        photoUrl: resolveStoreImageUrl(store.bannerUrl ?? store.logoUrl),
        bannerUrl: resolveStoreImageUrl(store.bannerUrl),
        logoUrl: resolveStoreImageUrl(store.logoUrl),
        categoryId: store.categoryId,
        category: store.category.name,
        location: store.zone,
        zone: store.zone,
        status: store.status,
        openTime: store.openTime,
        closeTime: store.closeTime,
        rating: metric?.rating ?? 0,
        reviewCount: metric?.reviewCount ?? 0,
        productCount: store._count.products,
      }];
    });

    if (missingStores.length > 0) {
      return errorResponse(
        res,
        409,
        'Daftar toko rekomendasi belum lengkap di database.',
        { stores: recommended, missingStores },
      );
    }

    return res.json({
      success: true,
      message: 'Toko rekomendasi berhasil dimuat.',
      data: recommended,
    });
  } catch (error) {
    next(error);
  }
}

export async function getRecommendedProducts(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const products = await listCatalogProducts();
    const metrics = await getStoreReviewMetrics(
      products.map((product) => product.storeId),
    );
    const ranked = products
      .map((product) => ({
        product,
        metric: metrics.get(product.storeId) ?? { rating: 0, reviewCount: 0 },
      }))
      .filter(({ metric }) => metric.reviewCount > 0);

    const byRating = [...ranked].sort((first, second) =>
      compareStoreQuality(first.metric, second.metric) ||
      second.product.id - first.product.id,
    );
    const byPopularity = [...ranked].sort(
      (first, second) =>
        second.metric.reviewCount - first.metric.reviewCount ||
        second.metric.rating - first.metric.rating ||
        second.product.id - first.product.id,
    );
    const byCombinedActivity = [...ranked].sort(
      (first, second) =>
        second.metric.rating * Math.log1p(second.metric.reviewCount) -
          first.metric.rating * Math.log1p(first.metric.reviewCount) ||
        second.metric.reviewCount - first.metric.reviewCount ||
        second.product.id - first.product.id,
    );

    const candidates = [
      {
        item: byRating[0],
        label: 'WAJIB COBA',
        reason: 'Produk dari toko dengan rating rata-rata tertinggi.',
      },
      {
        item: byPopularity[0],
        label: 'PRODUK LOKAL FAVORIT',
        reason: 'Produk dari toko dengan ulasan publik terbanyak.',
      },
      {
        item: byCombinedActivity.find(
          (candidate) =>
            ![byRating[0]?.product.id, byPopularity[0]?.product.id].includes(
              candidate.product.id,
            ),
        ) ?? byCombinedActivity[0],
        label: 'PILIHAN PENGUNJUNG',
        reason: 'Dipilih dari rating dan aktivitas ulasan toko pemilik.',
      },
    ];

    const seenProductIds = new Set<number>();
    const recommendations = candidates.flatMap(({ item, label, reason }) => {
      if (!item || seenProductIds.has(item.product.id)) return [];
      seenProductIds.add(item.product.id);
      return [{
        ...buildRecommendationProductDto(item.product, item.metric),
        recommendationLabel: label,
        recommendationReason: reason,
        recommendationBasis: 'owner_store_reviews',
      }];
    });

    return res.json({
      success: true,
      message: recommendations.length > 0
        ? 'Rekomendasi produk berhasil dimuat.'
        : 'Belum ada ulasan toko publik untuk menyusun rekomendasi.',
      data: {
        recommendations,
        metrics: {
          productRatingsAvailable: false,
          productReviewsAvailable: false,
          salesDataAvailable: false,
          fallback: 'ulasan_toko_pemilik',
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

type FeaturedSort =
  | 'best_selling'
  | 'highest_rating'
  | 'newest'
  | 'lowest_price'
  | 'highest_price';

const featuredSorts: FeaturedSort[] = [
  'best_selling',
  'highest_rating',
  'newest',
  'lowest_price',
  'highest_price',
];

export async function getFeaturedProducts(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const rawSort = req.query.sort;
    if (
      rawSort !== undefined &&
      (typeof rawSort !== 'string' ||
        !featuredSorts.includes(rawSort as FeaturedSort))
    ) {
      return errorResponse(
        res,
        400,
        'Sorting tidak valid.',
        { allowedSorts: featuredSorts },
      );
    }

    const sort = (rawSort as FeaturedSort | undefined) ?? 'best_selling';
    const products = await listCatalogProducts();
    const metrics = await getStoreReviewMetrics(
      products.map((product) => product.storeId),
    );
    const rows = products.map((product) => ({
      product,
      metric: metrics.get(product.storeId) ?? { rating: 0, reviewCount: 0 },
    }));

    rows.sort((first, second) => {
      switch (sort) {
        case 'highest_rating':
          return (
            compareStoreQuality(first.metric, second.metric) ||
            second.product.id - first.product.id
          );
        case 'newest':
          return second.product.id - first.product.id;
        case 'lowest_price':
          return first.product.price - second.product.price ||
            second.product.id - first.product.id;
        case 'highest_price':
          return second.product.price - first.product.price ||
            second.product.id - first.product.id;
        case 'best_selling':
          return (
            second.metric.reviewCount - first.metric.reviewCount ||
            second.metric.rating - first.metric.rating ||
            second.product.id - first.product.id
          );
      }
    });

    return res.json({
      success: true,
      message: 'Produk pilihan berhasil dimuat.',
      data: {
        sort,
        sortFallback: sort === 'best_selling'
          ? 'aktivitas_ulasan_toko'
          : sort === 'highest_rating'
            ? 'rating_toko'
            : sort === 'newest'
              ? 'id_produk_desc'
              : null,
        metrics: {
          productRatingsAvailable: false,
          productReviewsAvailable: false,
          salesDataAvailable: false,
          inventoryTracked: false,
        },
        products: rows.map(({ product, metric }) =>
          buildRecommendationProductDto(product, metric),
        ),
      },
    });
  } catch (error) {
    next(error);
  }
}
