import { Store as PrismaStore, Category, Product, Review, Promotion } from '@prisma/client';

export type Store = PrismaStore;
export type StoreStatus = 'buka' | 'tutup' | 'menunggu_verifikasi';

export type StoreWithCategory = PrismaStore & {
  category: Category;
  _count?: { products: number };
};

export type StoreDetail = PrismaStore & {
  category: Category;
  products: Product[];
  reviews?: Review[];
  promotions?: Promotion[];
};

export interface StoreDto {
  id: number;
  slug: string;
  name: string;
  owner: string;
  category: string;
  categoryId: number;
  zone: string;
  status: string;
  openTime: string | null;
  closeTime: string | null;
  operatingHours: string | null;
  establishedYear: number | null;
  phone: string;
  email: string;
  description: string;
  bannerUrl: string | null;
  logoUrl: string | null;
  sellerId: number | null;
  rating: number;
  reviewCount: number;
  productCount: number;
  products?: Product[];
}
