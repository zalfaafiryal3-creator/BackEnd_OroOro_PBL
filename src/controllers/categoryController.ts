import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { cleanString } from '../lib/validate';

const serverError = (res: Response, error: unknown) => {
  console.error(error);
  return res.status(500).json({ error: 'Terjadi kesalahan di server.' });
};

const toDto = (c: { id: number; name: string; _count: { stores: number } }) => ({
  id: c.id,
  name: c.name,
  storeCount: c._count.stores,
});

// GET /api/categories (terbuka untuk umum)
export async function listCategories(_req: Request, res: Response) {
  try {
    const rows = await prisma.category.findMany({
      orderBy: { id: 'asc' },
      include: { _count: { select: { stores: true } } },
    });
    return res.json(rows.map(toDto));
  } catch (error) {
    return serverError(res, error);
  }
}

// POST /api/categories (admin)
export async function createCategory(req: Request, res: Response) {
  try {
    const name = cleanString(req.body?.name);
    if (name.length < 2 || name.length > 40) {
      return res.status(400).json({ error: 'Nama kategori harus 2 sampai 40 karakter.' });
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
    return serverError(res, error);
  }
}

// PUT /api/categories/:id (admin)
export async function updateCategory(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const name = cleanString(req.body?.name);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID tidak valid.' });
    if (name.length < 2 || name.length > 40) {
      return res.status(400).json({ error: 'Nama kategori harus 2 sampai 40 karakter.' });
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
    return serverError(res, error);
  }
}

// DELETE /api/categories/:id (admin)
export async function deleteCategory(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID tidak valid.' });

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
    return serverError(res, error);
  }
}