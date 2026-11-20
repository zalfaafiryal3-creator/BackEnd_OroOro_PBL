import { Promotion as PrismaPromotion, Store } from '@prisma/client';

export type Promotion = PrismaPromotion;

export type PromotionWithStore = PrismaPromotion & {
  storeRecord?: Store | null;
};
