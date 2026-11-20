import { Bookmark as PrismaBookmark, Product, User } from '@prisma/client';

export type Bookmark = PrismaBookmark;

export type BookmarkDetail = PrismaBookmark & {
  product: Product;
  user?: User;
};
