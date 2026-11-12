import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getStoreReviewMetrics } from './storeReviewMetrics';

const publicStoreStatuses = ['buka', 'tutup'];

export const recommendationProductInclude = {
  store: { include: { category: true } },
} satisfies Prisma.ProductInclude;

export type RecommendationProduct = Prisma.ProductGetPayload<{
  include: typeof recommendationProductInclude;
}>;

export type RecommendationProductDto = ReturnType<
  typeof buildRecommendationProductDto
>;

export async function listCatalogProducts(): Promise<RecommendationProduct[]> {
  return prisma.product.findMany({
    where: { store: { status: { in: publicStoreStatuses } } },
    include: recommendationProductInclude,
    orderBy: { id: 'desc' },
  });
}

export function buildRecommendationProductDto(
  product: RecommendationProduct,
  storeMetric?: { rating: number; reviewCount: number },
) {
  return {
    id: product.id,
    name: product.name,
    photoUrl: product.photoUrl,
    storeId: product.storeId,
    storeName: product.store.name,
    description: product.description,
    categoryId: product.store.categoryId,
    category: product.store.category.name,
    price: product.price,
    rating: null,
    reviewCount: 0,
    storeRating: storeMetric?.rating ?? 0,
    storeReviewCount: storeMetric?.reviewCount ?? 0,
    isAvailable: publicStoreStatuses.includes(product.store.status),
    availabilityStatus: publicStoreStatuses.includes(product.store.status)
      ? 'catalog_listed'
      : 'unavailable',
    inventoryTracked: false,
    salesCount: null,
  };
}

export async function getProductDtos(products: RecommendationProduct[]) {
  const metrics = await getStoreReviewMetrics(
    products.map((product) => product.storeId),
  );
  return products.map((product) =>
    buildRecommendationProductDto(product, metrics.get(product.storeId)),
  );
}
