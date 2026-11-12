
import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { parsePositiveId } from '../lib/validate';
import { parseStoreInput, slugify, STORE_STATUSES, StoreStatus } from '../lib/storeValidation';
import { resolveStoreImageUrl } from '../services/storeImageUrl';
import {
  getStoreReviewMetrics,
  StoreReviewMetric,
} from '../services/storeReviewMetrics';

// Bentuk data toko seperti yang keluar dari database
type StoreRow = {
  id: number;
  slug: string;
  name: string;
  ownerName: string;
  zone: string;
  status: string;
  openTime: string | null;
  closeTime: string | null;
  establishedYear: number | null;
  phone: string;
  email: string;
  description: string;
  bannerUrl: string | null;
  logoUrl: string | null;
  sellerId: number | null;
  category: { id: number; name: string };
  products?: {
    id: number;
    name: string;
    price: number;
    description: string;
    photoUrl: string | null;
  }[];
  _count?: { products?: number; reviews?: number };
};

// Bentuk data toko yang dikirim ke admin dan mobile
function toStoreDto(s: StoreRow, reviewMetric?: StoreReviewMetric) {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    owner: s.ownerName,
    category: s.category.name,
    categoryId: s.category.id,
    zone: s.zone,
    status: s.status,
    openTime: s.openTime,
    closeTime: s.closeTime,
    operatingHours: s.openTime !== null && s.closeTime !== null
      ? `${s.openTime} - ${s.closeTime}`
      : null,
    establishedYear: s.establishedYear,
    phone: s.phone,
    email: s.email,
    description: s.description,
    bannerUrl: resolveStoreImageUrl(s.bannerUrl),
    logoUrl: resolveStoreImageUrl(s.logoUrl),
    sellerId: s.sellerId,
    rating: reviewMetric?.rating ?? 0,
    reviewCount: reviewMetric?.reviewCount ?? s._count?.reviews ?? 0,
    productCount: s.products
      ? s.products.length
      : s._count?.products ?? 0,
    ...(s.products ? { products: s.products } : {}),
  };
}

async function toStoreDtos(stores: StoreRow[]) {
  const metrics = await getStoreReviewMetrics(stores.map((store) => store.id));
  return stores.map((store) => toStoreDto(store, metrics.get(store.id)));
}

async function toStoreDtoWithMetrics(store: StoreRow) {
  const metrics = await getStoreReviewMetrics([store.id]);
  return toStoreDto(store, metrics.get(store.id));
}

const listInclude = {
  category: true,
  _count: {
    select: {
      products: true,
      reviews: {
        where: {
          type: 'store',
          isPublic: true,
          isDeleted: false,
          rating: { gte: 1, lte: 5 },
        },
      },
    },
  },
} satisfies Prisma.StoreInclude;

const detailInclude = {
  category: true,
  products: { orderBy: { id: 'asc' } },
  _count: {
    select: {
      reviews: {
        where: {
          type: 'store',
          isPublic: true,
          isDeleted: false,
          rating: { gte: 1, lte: 5 },
        },
      },
    },
  },
} satisfies Prisma.StoreInclude;

type StoreFilters = {
  q?: string;
  category?: string;
  status?: StoreStatus;
};

function parseStoreFilters(
  query: Request['query'],
  includeStatus: boolean,
): { filters: StoreFilters; errors: string[] } {
  const errors: string[] = [];
  const filters: StoreFilters = {};

  const readText = (key: string, label: string, maxLength: number): string | undefined => {
    const raw = query[key];
    if (raw === undefined) return undefined;
    if (typeof raw !== 'string') {
      errors.push(`${label} harus berupa teks tunggal.`);
      return undefined;
    }

    const value = raw.trim();
    if (value.length > maxLength) {
      errors.push(`${label} maksimal ${maxLength} karakter.`);
      return undefined;
    }
    return value;
  };

  const q = readText('q', 'Pencarian', 100);
  if (q) filters.q = q;

  const category = readText('category', 'Kategori', 80);
  if (category) {
    if (/^\d+$/.test(category) && parsePositiveId(category) === null) {
      errors.push('ID kategori tidak valid.');
    } else {
      filters.category = category;
    }
  }

  if (includeStatus) {
    const status = readText('status', 'Status', 30);
    if (status) {
      if (!(STORE_STATUSES as readonly string[]).includes(status)) {
        errors.push('Status harus buka, tutup, atau menunggu_verifikasi.');
      } else {
        filters.status = status as StoreStatus;
      }
    }
  }

  return { filters, errors };
}

function buildWhere(filters: StoreFilters, base: Prisma.StoreWhereInput): Prisma.StoreWhereInput {
  const where: Prisma.StoreWhereInput = { ...base };
  const and: Prisma.StoreWhereInput[] = [];

  if (filters.q) {
    and.push({
      OR: [
        { name: { contains: filters.q } },
        { ownerName: { contains: filters.q } },
        { zone: { contains: filters.q } },
      ],
    });
  }

  if (filters.category) {
    const categoryId = /^\d+$/.test(filters.category)
      ? parsePositiveId(filters.category)
      : null;
    and.push(categoryId !== null
      ? { categoryId }
      : { category: { name: filters.category } });
  }

  if (and.length > 0) {
    where.AND = and;
  }

  return where;
}

// Membuat slug yang belum dipakai
async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let n = 2;

  while (await prisma.store.findUnique({ where: { slug } })) {
    slug = `${base}-${n++}`;
  }

  return slug;
}

// GET /api/stores
// Umum: hanya toko yang sudah terverifikasi
export async function listStores(req: Request, res: Response, next: NextFunction) {
  try {
    const { filters, errors } = parseStoreFilters(req.query, false);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0], errors });
    }

    const where = buildWhere(filters, {
      status: { in: ['buka', 'tutup'] },
    });

    const rows = await prisma.store.findMany({
      where,
      include: listInclude,
      orderBy: { id: 'asc' },
      take: 200,
    });

    return res.json(await toStoreDtos(rows));
  } catch (error) {
    next(error);
  }
}

// GET /api/stores/manage
// Admin: semua toko
// Seller: hanya tokonya sendiri
export async function listManagedStores(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user!;

    const base: Prisma.StoreWhereInput =
      user.role === 'admin' ? {} : { sellerId: user.id };

    const { filters, errors } = parseStoreFilters(req.query, true);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0], errors });
    }
    if (filters.status) base.status = filters.status;

    const where = buildWhere(filters, base);

    const rows = await prisma.store.findMany({
      where,
      include: listInclude,
      orderBy: { id: 'desc' },
      take: 200,
    });

    return res.json(await toStoreDtos(rows));
  } catch (error) {
    next(error);
  }
}

// GET /api/stores/manage/:id
// Admin: semua toko; Seller: hanya tokonya sendiri
export async function getManagedStore(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parsePositiveId(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'ID toko tidak valid.' });
    }

    const store = await prisma.store.findUnique({
      where: { id },
      include: detailInclude,
    });
    if (!store) {
      return res.status(404).json({ error: 'Toko tidak ditemukan.' });
    }

    const user = req.user!;
    if (user.role !== 'admin' && store.sellerId !== user.id) {
      return res.status(403).json({
        error: 'Kamu hanya bisa melihat detail tokomu sendiri.',
      });
    }

    return res.json(await toStoreDtoWithMetrics(store));
  } catch (error) {
    next(error);
  }
}

// GET /api/stores/:id
// ID angka atau slug
export async function getStore(req: Request, res: Response, next: NextFunction) {
  try {
    const key = req.params.id;

    let where: Prisma.StoreWhereInput;
    if (/^\d+$/.test(key)) {
      const id = parsePositiveId(key);
      if (id === null) return res.status(400).json({ error: 'ID toko tidak valid.' });
      where = { id };
    } else {
      if (key.length > 200 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) {
        return res.status(400).json({ error: 'ID atau slug toko tidak valid.' });
      }
      where = { slug: key };
    }

    const store = await prisma.store.findFirst({
      where: {
        ...where,
        status: { in: ['buka', 'tutup'] },
      },
      include: detailInclude,
    });

    if (!store) {
      return res.status(404).json({
        error: 'Toko tidak ditemukan.',
      });
    }

    return res.json(await toStoreDtoWithMetrics(store));
  } catch (error) {
    next(error);
  }
}

// POST /api/stores
// Admin atau Seller
export async function createStore(req: Request, res: Response, next: NextFunction) {
  try {
    const { data, errors } = parseStoreInput(req.body, 'create');

    if (errors.length > 0) {
      return res.status(400).json({
        error: errors[0],
        errors,
      });
    }

    const user = req.user!;
    const isAdmin = user.role === 'admin';

    const category = await prisma.category.findUnique({
      where: { id: data.categoryId! },
    });

    if (!category) {
      return res.status(400).json({
        error: 'Kategori tidak ditemukan.',
      });
    }

    // Seller otomatis menjadi pemilik toko
    // Toko Seller harus menunggu persetujuan Admin
    const status = isAdmin
      ? data.status ?? 'buka'
      : 'menunggu_verifikasi';

    const sellerId = isAdmin
      ? data.sellerId ?? null
      : user.id;

    const slug = await uniqueSlug(slugify(data.name!));

    const store = await prisma.store.create({
      data: {
        slug,
        name: data.name!,
        ownerName: data.ownerName ?? '',
        categoryId: data.categoryId!,
        zone: data.zone ?? '',
        status,
        openTime: data.openTime === undefined ? '06:00' : data.openTime,
        closeTime: data.closeTime === undefined ? '17:00' : data.closeTime,
        establishedYear: data.establishedYear ?? null,
        phone: data.phone ?? '',
        email: data.email ?? '',
        description: data.description ?? '',
        bannerUrl: data.bannerUrl ?? null,
        logoUrl: data.logoUrl ?? null,
        sellerId,
        products: {
          create: data.products ?? [],
        },
      },
      include: detailInclude,
    });

    return res.status(201).json(await toStoreDtoWithMetrics(store));
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2003'
    ) {
      return res.status(400).json({
        error: 'Data terkait (penjual atau kategori) tidak ditemukan.',
      });
    }

    next(error);
  }
}

// PUT /api/stores/:id
// Admin: semua toko
// Seller: hanya tokonya sendiri dan tidak boleh mengubah status
export async function updateStore(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parsePositiveId(req.params.id);

    if (!id) {
      return res.status(400).json({
        error: 'ID tidak valid.',
      });
    }

    const existing = await prisma.store.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Toko tidak ditemukan.',
      });
    }

    const user = req.user!;
    const isAdmin = user.role === 'admin';

    // Seller hanya boleh mengubah toko miliknya
    if (!isAdmin && existing.sellerId !== user.id) {
      return res.status(403).json({
        error: 'Kamu hanya bisa mengubah tokomu sendiri.',
      });
    }

    // Seller tidak boleh mengirim field status
    // Admin tetap boleh mengubah status
    if (
      !isAdmin &&
      Object.prototype.hasOwnProperty.call(req.body, 'status')
    ) {
      return res.status(403).json({
        error:
          'Seller tidak memiliki izin untuk mengubah status toko. Hubungi admin.',
      });
    }

    const { data, errors } = parseStoreInput(req.body, 'update');

    if (errors.length > 0) {
      return res.status(400).json({
        error: errors[0],
        errors,
      });
    }

    if (!isAdmin) {
      // Seller tidak boleh memindahkan kepemilikan toko
      delete data.sellerId;
      delete data.status;
    }

    // Memastikan kategori tersedia
    if (data.categoryId !== undefined) {
      const category = await prisma.category.findUnique({
        where: { id: data.categoryId },
      });

      if (!category) {
        return res.status(400).json({
          error: 'Kategori tidak ditemukan.',
        });
      }
    }

    const { products, ...fields } = data;

    const store = await prisma.store.update({
      where: { id },
      data: {
        ...fields,

        // Jika produk dikirim, daftar produk lama diganti
        ...(products !== undefined
          ? {
              products: {
                deleteMany: {},
                create: products,
              },
            }
          : {}),
      },
      include: detailInclude,
    });

    return res.json(await toStoreDtoWithMetrics(store));
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2003'
    ) {
      return res.status(400).json({
        error: 'Data terkait (penjual atau kategori) tidak ditemukan.',
      });
    }

    next(error);
  }
}

// DELETE /api/stores/:id
// Admin: semua toko
// Seller: hanya tokonya sendiri
export async function deleteStore(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parsePositiveId(req.params.id);

    if (!id) {
      return res.status(400).json({
        error: 'ID tidak valid.',
      });
    }

    const existing = await prisma.store.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Toko tidak ditemukan.',
      });
    }

    const user = req.user!;

    if (user.role !== 'admin' && existing.sellerId !== user.id) {
      return res.status(403).json({
        error: 'Kamu hanya bisa menghapus tokomu sendiri.',
      });
    }

    await prisma.store.delete({
      where: { id },
    });

    return res.json({
      message: 'Toko dihapus.',
    });
  } catch (error) {
    next(error);
  }
}
