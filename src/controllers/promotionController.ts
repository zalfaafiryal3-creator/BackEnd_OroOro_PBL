import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { cleanString, isRecord, parsePositiveId } from '../lib/validate';

const PROMO_STATUSES = [
  'Sedang Berlangsung',
  'Akan Datang',
  'Setiap Akhir Pekan',
  'Hari Pasaran Khusus',
  'Hampir Habis',
  'Ditangguhkan',
] as const;

const PERIOD_TYPES = ['range', 'days', 'specific'] as const;

type PromotionInput = {
  title: string;
  store: string;
  owner: string;
  category: string;
  description: string;
  bannerImage: string | null;
  status: string;
  periodType: string;
  periodDisplay: string;
  operatingHours: string;
  terms: string;
  code: string;
  quota: string;
  discountType: string;
};

function toPromotionDto(promotion: {
  id: number;
  title: string;
  store: string;
  owner: string;
  category: string;
  description: string;
  bannerImage: string | null;
  status: string;
  periodType: string;
  periodDisplay: string;
  operatingHours: string;
  terms: string;
  code: string;
  quota: string;
  discountType: string;
  createdAt: Date;
}, canManage?: boolean) {
  return {
    id: promotion.id,
    title: promotion.title,
    store: promotion.store,
    owner: promotion.owner,
    category: promotion.category,
    description: promotion.description,
    bannerImage: promotion.bannerImage,
    status: promotion.status,
    periodType: promotion.periodType,
    periodDisplay: promotion.periodDisplay,
    operatingHours: promotion.operatingHours,
    terms: promotion.terms,
    code: promotion.code,
    quota: promotion.quota,
    discountType: promotion.discountType,
    createdAt: promotion.createdAt,
    ...(canManage === undefined ? {} : { canManage }),
  };
}

function parsePromotionInput(input: unknown): { data?: PromotionInput; error?: string };
function parsePromotionInput(input: unknown, partial: true): { data?: Partial<PromotionInput>; error?: string };
function parsePromotionInput(
  input: unknown,
  partial = false,
): { data?: PromotionInput | Partial<PromotionInput>; error?: string } {
  if (!isRecord(input)) return { error: 'Data promo tidak valid.' };
  const body = input;

  let error: string | undefined;
  function readText(
    field: string,
    max: number,
    required = false,
    fallback = '',
  ): string | undefined {
    if (partial && !(field in body)) return undefined;
    const text = cleanString(body[field]);
    if (required && !text) error = `${field} wajib diisi.`;
    else if (text.length > max) error = `${field} maksimal ${max} karakter.`;
    return text || fallback;
  }

  const title = readText('title', 100, true);
  const store = readText('store', 100, true);
  const owner = readText('owner', 100, false, 'Pedagang Pasar');
  const category = readText('category', 100, true);
  const description = readText('description', 2000, true);
  const status = readText('status', 40, true);
  const periodType = readText('periodType', 20, true);
  const periodDisplay = readText('periodDisplay', 120, true);
  const operatingHours = readText('operatingHours', 120, true);
  const terms = readText('terms', 1000, false, '');
  const code = readText('code', 40, false, '');
  const quota = readText('quota', 40, false, '0 / 100');
  const discountType = readText('discountType', 60, false, '');
  let bannerImage: string | null | undefined;
  if (!partial || 'bannerImage' in input) {
    const rawBanner = body.bannerImage;
    if (rawBanner === null || rawBanner === '') bannerImage = null;
    else {
      bannerImage = cleanString(rawBanner);
      if (typeof rawBanner !== 'string') error = 'bannerImage harus berupa URL atau null.';
      else if (bannerImage.length > 2000) error = 'bannerImage maksimal 2000 karakter.';
    }
  }

  if (status && !PROMO_STATUSES.includes(status as typeof PROMO_STATUSES[number]) &&
      !(partial && status === 'Aktif')) {
    error = 'Status promo tidak valid.';
  }
  if (periodType && !PERIOD_TYPES.includes(periodType as typeof PERIOD_TYPES[number])) {
    error = 'Jenis periode promo tidak valid.';
  }
  if (error) return { error };

  if (!partial) {
    if (!title || !store || !category || !description || !status ||
        !periodType || !periodDisplay || !operatingHours) {
      return { error: 'Data promo belum lengkap.' };
    }
    return {
      data: {
        title,
        store,
        owner: owner ?? 'Pedagang Pasar',
        category,
        description,
        bannerImage: bannerImage ?? null,
        status,
        periodType,
        periodDisplay,
        operatingHours,
        terms: terms ?? '',
        code: code ?? '',
        quota: quota ?? '0 / 100',
        discountType: discountType ?? '',
      },
    };
  }

  const data: Partial<PromotionInput> = {};
  if (title !== undefined) data.title = title;
  if (store !== undefined) data.store = store;
  if (owner !== undefined) data.owner = owner;
  if (category !== undefined) data.category = category;
  if (description !== undefined) data.description = description;
  if (bannerImage !== undefined) data.bannerImage = bannerImage;
  if (status !== undefined) data.status = status;
  if (periodType !== undefined) data.periodType = periodType;
  if (periodDisplay !== undefined) data.periodDisplay = periodDisplay;
  if (operatingHours !== undefined) data.operatingHours = operatingHours;
  if (terms !== undefined) data.terms = terms;
  if (code !== undefined) data.code = code;
  if (quota !== undefined) data.quota = quota;
  if (discountType !== undefined) data.discountType = discountType;
  if (Object.keys(data).length === 0) return { error: 'Tidak ada perubahan promo.' };
  return { data };
}

async function findUniqueStoreId(name: string): Promise<number | null> {
  const stores = await prisma.store.findMany({
    where: { name },
    select: { id: true },
    take: 2,
  });
  return stores.length === 1 ? stores[0].id : null;
}

export async function listPromotions(_req: Request, res: Response, next: NextFunction) {
  try {
    const promotions = await prisma.promotion.findMany({
      where: { status: { not: 'Ditangguhkan' } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    res.json(promotions.map((promotion) => toPromotionDto(promotion)));
  } catch (error) {
    next(error);
  }
}

export async function listManagedPromotions(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user!;
    const ownedStoreIds = user.role === 'admin'
      ? new Set<number>()
      : new Set((await prisma.store.findMany({
          where: { sellerId: req.user!.id },
          select: { id: true },
        })).map((store) => store.id));
    const promotions = await prisma.promotion.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    res.json(promotions.map((promotion) => toPromotionDto(
      promotion,
      user.role === 'admin' ||
        (promotion.storeId !== null && ownedStoreIds.has(promotion.storeId)),
    )));
  } catch (error) {
    next(error);
  }
}

export async function createPromotion(req: Request, res: Response, next: NextFunction) {
  const parsed = parsePromotionInput(req.body);
  if (parsed.error || !parsed.data) {
    return res.status(400).json({ error: parsed.error ?? 'Data promo tidak valid.' });
  }

  try {
    const user = req.user!;
    let storeId: number | null = null;
    let promotionData = parsed.data;
    if (user.role === 'seller') {
      const store = await prisma.store.findFirst({
        where: { sellerId: user.id, name: parsed.data.store },
        select: { id: true, name: true, ownerName: true, category: { select: { name: true } } },
      });
      if (!store) {
        return res.status(403).json({
          error: 'Promo hanya dapat dibuat untuk toko milikmu yang terdaftar.',
        });
      }
      storeId = store.id;
      promotionData = {
        ...parsed.data,
        store: store.name,
        owner: store.ownerName || parsed.data.owner,
        category: store.category.name,
      };
    } else {
      storeId = await findUniqueStoreId(parsed.data.store);
    }

    const promotion = await prisma.promotion.create({
      data: { ...promotionData, storeId },
    });
    res.status(201).json(toPromotionDto(promotion));
  } catch (error) {
    next(error);
  }
}

export async function updatePromotion(req: Request, res: Response, next: NextFunction) {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID promo tidak valid.' });
  const parsed = parsePromotionInput(req.body, true);
  if (parsed.error || !parsed.data) {
    return res.status(400).json({ error: parsed.error ?? 'Data promo tidak valid.' });
  }

  try {
    const existing = await prisma.promotion.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Promo tidak ditemukan.' });

    const user = req.user!;
    if (user.role !== 'admin') {
      const ownedStore = existing.storeId === null
        ? null
        : await prisma.store.findFirst({
            where: { id: existing.storeId, sellerId: user.id },
            select: { id: true },
          });
      if (!ownedStore) {
        return res.status(403).json({
          error: 'Kamu hanya dapat mengubah promo dari tokomu sendiri.',
        });
      }
      if (
        parsed.data.store !== undefined &&
        parsed.data.store !== existing.store
      ) {
        return res.status(403).json({
          error: 'Promo tidak dapat dipindahkan ke toko lain.',
        });
      }
    }

    const requestedStatus = parsed.data.status;
    const data: Prisma.PromotionUpdateInput = { ...parsed.data };
    if (user.role === 'admin' && parsed.data.store !== undefined) {
      const storeId = await findUniqueStoreId(parsed.data.store);
      data.storeRecord = storeId ? { connect: { id: storeId } } : { disconnect: true };
    }
    if (requestedStatus === 'Ditangguhkan') {
      data.status = 'Ditangguhkan';
      data.previousStatus = existing.status === 'Ditangguhkan'
        ? existing.previousStatus
        : existing.status;
    } else if (requestedStatus === 'Aktif') {
      data.status = existing.previousStatus ?? 'Sedang Berlangsung';
      data.previousStatus = null;
    }

    const promotion = await prisma.promotion.update({ where: { id }, data });
    res.json(toPromotionDto(promotion));
  } catch (error) {
    next(error);
  }
}

export async function deletePromotion(req: Request, res: Response, next: NextFunction) {
  const id = parsePositiveId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID promo tidak valid.' });

  try {
    const user = req.user!;
    const where: Prisma.PromotionWhereInput = user.role === 'admin'
      ? { id }
      : { id, storeRecord: { sellerId: user.id } };
    const result = await prisma.promotion.deleteMany({ where });
    if (result.count === 0) {
      const existing = await prisma.promotion.findUnique({ where: { id }, select: { id: true } });
      return existing
        ? res.status(403).json({ error: 'Kamu hanya dapat menghapus promo dari tokomu sendiri.' })
        : res.status(404).json({ error: 'Promo tidak ditemukan.' });
    }
    res.json({ message: 'Promo berhasil dihapus.' });
  } catch (error) {
    next(error);
  }
}
