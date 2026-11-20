import { Review as PrismaReview, ReviewPhoto as PrismaReviewPhoto, Store } from '@prisma/client';

export type Review = PrismaReview;
export type ReviewPhoto = PrismaReviewPhoto;
export type ReviewType = 'store' | 'market';

export type ReviewWithPhotos = PrismaReview & {
  photos: ReviewPhoto[];
  store?: Store | null;
};

export interface CreateReviewInput {
  type: ReviewType;
  name?: string;
  rating: number;
  text: string;
  storeId?: number | null;
  marketId?: number | null;
  overallRating?: number | null;
  photos?: string[];
}
