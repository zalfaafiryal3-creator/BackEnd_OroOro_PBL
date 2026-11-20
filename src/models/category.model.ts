import { Category as PrismaCategory, Store } from '@prisma/client';

export type Category = PrismaCategory;

export type CategoryWithStores = PrismaCategory & {
  stores: Store[];
};

export interface CreateCategoryInput {
  name: string;
}
