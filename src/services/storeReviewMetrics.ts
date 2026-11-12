import { prisma } from '../lib/prisma';

export type StoreReviewMetric = {
  rating: number;
  reviewCount: number;
};

export async function getStoreReviewMetrics(
  storeIds: number[],
): Promise<Map<number, StoreReviewMetric>> {
  const ids = [...new Set(storeIds)];
  if (ids.length === 0) return new Map();

  const groups = await prisma.review.groupBy({
    by: ['storeId'],
    where: {
      storeId: { in: ids },
      type: 'store',
      isPublic: true,
      isDeleted: false,
      rating: { gte: 1, lte: 5 },
    },
    _avg: { rating: true },
    _count: { _all: true },
  });

  return new Map(
    groups.flatMap((group) =>
      group.storeId === null
        ? []
        : [[
            group.storeId,
            {
              rating: group._avg.rating ?? 0,
              reviewCount: group._count._all,
            },
          ] as const],
    ),
  );
}
