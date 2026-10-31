
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { parseStoreInput, slugify } from '../lib/storeValidation';

const serverError = (res: Response, error: unknown) => {
  console.error(error);
  return res.status(500).json({ error: 'Terjadi kesalahan di server.' });
};

// Bentuk data toko seperti yang keluar dari database
type StoreRow = {
  id: number;
  slug: string;
  name: string;
  ownerName: string;
  zone: string;
  status: string;
  openTime: string;
  closeTime: string;
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
  _count?: { products: number };
};

// Bentuk data toko yang dikirim ke admin dan mobile
function toStoreDto(s: StoreRow) {
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
    operatingHours: `${s.openTime} - ${s.closeTime}`,
    establishedYear: s.establishedYear,
    phone: s.phone,
    email: s.email,
    description: s.description,
    bannerUrl: s.bannerUrl,
    logoUrl: s.logoUrl,
    sellerId: s.sellerId,
    rating: 0,
    reviewCount: 0,
    productCount: s.products
      ? s.products.length
      : s._count?.products ?? 0,
    ...(s.products ? { products: s.products } : {}),
  };
}

const listInclude = {
  category: true,
  _count: { select: { products: true } },
} satisfies Prisma.StoreInclude;

const detailInclude = {
  category: true,
  products: { orderBy: { id: 'asc' } },
} satisfies Prisma.StoreInclude;

const asText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const parseId = (value: string): number | null => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// Menyusun saringan dari ?q=...&category=...
function buildWhere(
  query: Request['query'],
  base: Prisma.StoreWhereInput,
): Prisma.StoreWhereInput {
  const where: Prisma.StoreWhereInput = { ...base };
  const and: Prisma.StoreWhereInput[] = [];

  const q = asText(query.q);

  if (q) {
    and.push({
      OR: [
        { name: { contains: q } },
        { ownerName: { contains: q } },
        { zone: { contains: q } },
      ],
    });
  }

  const category = asText(query.category);

  if (category) {
    and.push(
      /^\d+$/.test(category)
        ? { categoryId: Number(category) }
        : { category: { name: category } },
    );
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
export async function listStores(req: Request, res: Response) {
  try {
    const where = buildWhere(req.query, {
      status: { in: ['buka', 'tutup'] },
    });

    const rows = await prisma.store.findMany({
      where,
      include: listInclude,
      orderBy: { id: 'asc' },
      take: 200,
    });

    return res.json(rows.map(toStoreDto));
  } catch (error) {
    return serverError(res, error);
  }
}

// GET /api/stores/manage
// Admin: semua toko
// Seller: hanya tokonya sendiri
export async function listManagedStores(req: Request, res: Response) {
  try {
    const user = req.user!;

    const base: Prisma.StoreWhereInput =
      user.role === 'admin' ? {} : { sellerId: user.id };

    const status = asText(req.query.status);

    if (status) {
      base.status = status;
    }

    const where = buildWhere(req.query, base);

    const rows = await prisma.store.findMany({
      where,
      include: listInclude,
      orderBy: { id: 'desc' },
      take: 200,
    });

    return res.json(rows.map(toStoreDto));
  } catch (error) {
    return serverError(res, error);
  }
}

// GET /api/stores/:id
// ID angka atau slug
export async function getStore(req: Request, res: Response) {
  try {
    const key = req.params.id;

    const where = /^\d+$/.test(key)
      ? { id: Number(key) }
      : { slug: key };

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

    return res.json(toStoreDto(store));
  } catch (error) {
    return serverError(res, error);
  }
}

// POST /api/stores
// Admin atau Seller
export async function createStore(req: Request, res: Response) {
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
        openTime: data.openTime ?? '06:00',
        closeTime: data.closeTime ?? '17:00',
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

    return res.status(201).json(toStoreDto(store));
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2003'
    ) {
      return res.status(400).json({
        error: 'Data terkait (penjual atau kategori) tidak ditemukan.',
      });
    }

    return serverError(res, error);
  }
}

// PUT /api/stores/:id
// Admin: semua toko
// Seller: hanya tokonya sendiri dan tidak boleh mengubah status
export async function updateStore(req: Request, res: Response) {
  try {
    const id = parseId(req.params.id);

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

    return res.json(toStoreDto(store));
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2003'
    ) {
      return res.status(400).json({
        error: 'Data terkait (penjual atau kategori) tidak ditemukan.',
      });
    }

    return serverError(res, error);
  }
}

// DELETE /api/stores/:id
// Admin: semua toko
// Seller: hanya tokonya sendiri
export async function deleteStore(req: Request, res: Response) {
  try {
    const id = parseId(req.params.id);

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
    return serverError(res, error);
  }
}
