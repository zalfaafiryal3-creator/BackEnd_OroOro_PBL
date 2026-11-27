import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { cleanString, isRecord, parsePositiveId } from '../lib/validate';

const VALID_STATUSES = new Set(['Lapak Buka', 'Tutup Sementara', 'Menunggu Verifikasi']);

function normalizeSellerStatus(raw: unknown): string {
  const s = cleanString(raw);
  if (s === 'Aktif') return 'Lapak Buka';
  if (s === 'Nonaktif') return 'Tutup Sementara';
  if (VALID_STATUSES.has(s)) return s;
  return 'Lapak Buka';
}

// GET /api/sellers (admin & seller)
export async function listSellers(_req: Request, res: Response, next: NextFunction) {
  try {
    const sellers = await prisma.seller.findMany({
      orderBy: { id: 'desc' },
    });
    return res.json(sellers);
  } catch (error) {
    next(error);
  }
}

// POST /api/sellers (admin & seller)
export async function createSeller(req: Request, res: Response, next: NextFunction) {
  try {
    const errors: string[] = [];
    if (!isRecord(req.body)) errors.push('Data penjual harus berupa objek.');
    const body = isRecord(req.body) ? req.body : {};

    const name = cleanString(body.name);
    const shop = cleanString(body.shop);
    const block = cleanString(body.block);
    const status = normalizeSellerStatus(body.status);
    const phone = cleanString(body.phone);
    const email = cleanString(body.email);
    const type = cleanString(body.type) || 'Zona Kuliner';
    const photoUrl = typeof body.photoUrl === 'string' && body.photoUrl.trim()
      ? body.photoUrl.trim()
      : null;

    if (name.length < 2 || name.length > 80) {
      errors.push('Nama penjual harus 2 sampai 80 karakter.');
    }
    if (shop.length < 2 || shop.length > 100) {
      errors.push('Nama lapak/toko harus 2 sampai 100 karakter.');
    }
    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0], errors });
    }

    const seller = await prisma.seller.create({
      data: { name, shop, block, status, phone, email, type, photoUrl },
    });
    return res.status(201).json(seller);
  } catch (error) {
    next(error);
  }
}

// PUT /api/sellers/:id (admin & seller)
export async function updateSeller(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parsePositiveId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'ID penjual tidak valid.' });

    const errors: string[] = [];
    if (!isRecord(req.body)) errors.push('Data penjual harus berupa objek.');
    const body = isRecord(req.body) ? req.body : {};

    const data: {
      name?: string;
      shop?: string;
      block?: string;
      status?: string;
      phone?: string;
      email?: string;
      type?: string;
      photoUrl?: string | null;
    } = {};

    if (body.name !== undefined) {
      const name = cleanString(body.name);
      if (name.length < 2 || name.length > 80) errors.push('Nama penjual harus 2 sampai 80 karakter.');
      else data.name = name;
    }
    if (body.shop !== undefined) {
      const shop = cleanString(body.shop);
      if (shop.length < 2 || shop.length > 100) errors.push('Nama lapak/toko harus 2 sampai 100 karakter.');
      else data.shop = shop;
    }
    if (body.block !== undefined) data.block = cleanString(body.block);
    if (body.status !== undefined) data.status = normalizeSellerStatus(body.status);
    if (body.phone !== undefined) data.phone = cleanString(body.phone);
    if (body.email !== undefined) data.email = cleanString(body.email);
    if (body.type !== undefined) data.type = cleanString(body.type) || 'Zona Kuliner';
    if (body.photoUrl !== undefined) {
      data.photoUrl = typeof body.photoUrl === 'string' && body.photoUrl.trim() ? body.photoUrl.trim() : null;
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0], errors });
    }

    const seller = await prisma.seller.update({
      where: { id },
      data,
    });
    return res.json(seller);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Penjual tidak ditemukan.' });
    }
    next(error);
  }
}

// DELETE /api/sellers/:id (admin & seller)
export async function deleteSeller(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parsePositiveId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'ID penjual tidak valid.' });

    await prisma.seller.delete({ where: { id } });
    return res.json({ message: 'Penjual dihapus.' });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Penjual tidak ditemukan.' });
    }
    next(error);
  }
}
