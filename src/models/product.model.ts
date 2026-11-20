import { Product as PrismaProduct, Store } from '@prisma/client';

export type Product = PrismaProduct;

export type ProductWithStore = PrismaProduct & {
  store: Store;
};

export interface ProductInput {
  name: string;
  price: number;
  description?: string;
  photoUrl?: string | null;
}
