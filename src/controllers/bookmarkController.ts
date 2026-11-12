import { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { parsePositiveId } from '../lib/validate';
import {
  getProductDtos,
  recommendationProductInclude,
} from '../services/recommendationData';

const publicStoreStatuses = ['buka', 'tutup'];

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

function readProductId(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  return parsePositiveId(value);
}

export async function addBookmark(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const productId = readProductId(req.body?.productId);
    if (productId === null) {
      return errorResponse(res, 400, 'ID produk tidak valid.');
    }

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        store: { status: { in: publicStoreStatuses } },
      },
      include: recommendationProductInclude,
    });
    if (!product) {
      return errorResponse(res, 404, 'Produk tidak tersedia.');
    }

    const bookmark = await prisma.bookmark.upsert({
      where: {
        userId_productId: {
          userId: req.user!.id,
          productId,
        },
      },
      create: { userId: req.user!.id, productId },
      update: {},
    });
    const [productDto] = await getProductDtos([product]);
    return res.json({
      success: true,
      message: 'Produk tersedia di bookmark.',
      data: { id: bookmark.id, product: productDto },
    });
  } catch (error) {
    next(error);
  }
}

export async function removeBookmark(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const productId = readProductId(req.params.productId);
    if (productId === null) {
      return errorResponse(res, 400, 'ID produk tidak valid.');
    }

    const result = await prisma.bookmark.deleteMany({
      where: { userId: req.user!.id, productId },
    });
    return res.json({
      success: true,
      message: result.count > 0
        ? 'Bookmark berhasil dihapus.'
        : 'Produk tidak ada di bookmark.',
      data: { productId, removed: result.count > 0 },
    });
  } catch (error) {
    next(error);
  }
}

export async function listBookmarks(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const bookmarks = await prisma.bookmark.findMany({
      where: { userId: req.user!.id },
      include: {
        product: { include: recommendationProductInclude },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const productDtos = await getProductDtos(
      bookmarks.map((bookmark) => bookmark.product),
    );

    return res.json({
      success: true,
      message: bookmarks.length > 0
        ? 'Bookmark berhasil dimuat.'
        : 'Belum ada produk yang dibookmark.',
      data: bookmarks.map((bookmark, index) => ({
        id: bookmark.id,
        createdAt: bookmark.createdAt,
        product: productDtos[index],
      })),
    });
  } catch (error) {
    next(error);
  }
}

export async function getBookmarkStatus(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const productId = readProductId(req.params.productId);
    if (productId === null) {
      return errorResponse(res, 400, 'ID produk tidak valid.');
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: recommendationProductInclude,
    });
    if (!product) {
      return errorResponse(res, 404, 'Produk tidak ditemukan.');
    }

    const bookmark = await prisma.bookmark.findUnique({
      where: {
        userId_productId: {
          userId: req.user!.id,
          productId,
        },
      },
      select: { id: true },
    });
    const [productDto] = await getProductDtos([product]);
    const isAvailable = publicStoreStatuses.includes(product.store.status);

    return res.json({
      success: true,
      message: 'Status bookmark berhasil dimuat.',
      data: {
        productId,
        isBookmarked: bookmark !== null,
        isAvailable,
        product: productDto,
      },
    });
  } catch (error) {
    next(error);
  }
}
