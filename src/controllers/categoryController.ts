import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { cleanString, isRecord, parsePositiveId } from '../lib/validate';

const toDto = (c: { id: number; name: string; _count: { stores: number } }) => ({
  id: c.id,
  name: c.name,
  storeCount: c._count.stores,
});

// GET /api/categories (terbuka untuk umum)
export async function listCategories(_req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await prisma.category.findMany({
      orderBy: { id: 'asc' },
      include: { _count: { select: { stores: true } } },
    });
    return res.json(rows.map(toDto));
  } catch (error) {
    next(error);
  }
}

// POST /api/categories (admin)
export async function createCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const errors: string[] = [];
    if (!isRecord(req.body)) errors.push('Data kategori harus berupa objek.');
    const body = isRecord(req.body) ? req.body : {};
    const name = cleanString(body.name);
    if (typeof body.name !== 'string' || name.length < 2 || name.length > 40) {
      errors.push('Nama kategori harus 2 sampai 40 karakter.');
    }
    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0], errors });
    }

    const row = await prisma.category.create({
      data: { name },
      include: { _count: { select: { stores: true } } },
    });
    return res.status(201).json(toDto(row));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'Nama kategori sudah ada.' });
    }
    next(error);
  }
}

// PUT /api/categories/:id (admin)
export async function updateCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parsePositiveId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'ID tidak valid.' });

    const errors: string[] = [];
    if (!isRecord(req.body)) errors.push('Data kategori harus berupa objek.');
    const body = isRecord(req.body) ? req.body : {};
    const name = cleanString(body.name);
    if (typeof body.name !== 'string' || name.length < 2 || name.length > 40) {
      errors.push('Nama kategori harus 2 sampai 40 karakter.');
    }
    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0], errors });
    }

    const row = await prisma.category.update({
      where: { id },
      data: { name },
      include: { _count: { select: { stores: true } } },
    });
    return res.json(toDto(row));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') return res.status(404).json({ error: 'Kategori tidak ditemukan.' });
      if (error.code === 'P2002') return res.status(409).json({ error: 'Nama kategori sudah ada.' });
    }
    next(error);
  }
}

// DELETE /api/categories/:id (admin)
export async function deleteCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parsePositiveId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'ID tidak valid.' });

    const used = await prisma.store.count({ where: { categoryId: id } });
    if (used > 0) {
      return res.status(409).json({ error: `Kategori masih dipakai ${used} toko.` });
    }
    await prisma.category.delete({ where: { id } });
    return res.json({ message: 'Kategori dihapus.' });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Kategori tidak ditemukan.' });
    }
    next(error);
  }
}