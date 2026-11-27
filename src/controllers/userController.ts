import { NextFunction, Request, Response } from 'express';
import { hash } from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { cleanString, isRecord, isValidEmail, isValidName, parsePositiveId } from '../lib/validate';

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  phone: true,
  status: true,
  createdAt: true,
};

// GET /api/users (admin)
export async function listUsers(_req: Request, res: Response, next: NextFunction) {
  try {
    const users = await prisma.user.findMany({
      orderBy: { id: 'desc' },
      select: userSelect,
    });
    return res.json(users);
  } catch (error) {
    next(error);
  }
}

// POST /api/users (admin)
export async function createUser(req: Request, res: Response, next: NextFunction) {
  try {
    const errors: string[] = [];
    if (!isRecord(req.body)) errors.push('Data pengguna harus berupa objek.');
    const body = isRecord(req.body) ? req.body : {};

    const name = cleanString(body.name);
    const email = cleanString(body.email).toLowerCase();
    const phone = cleanString(body.phone);
    const role = body.role === 'admin' ? 'admin' : 'seller';
    const status = cleanString(body.status) || 'Aktif';
    const rawPassword = typeof body.password === 'string' && body.password.trim().length >= 8
      ? body.password.trim()
      : 'PasarOro123!';

    if (typeof body.name !== 'string' || !isValidName(name)) {
      errors.push('Nama harus 2 sampai 60 karakter.');
    }
    if (typeof body.email !== 'string' || !isValidEmail(email)) {
      errors.push('Format email tidak valid.');
    }
    if (phone.length > 30) {
      errors.push('Nomor telepon maksimal 30 karakter.');
    }
    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0], errors });
    }

    const passwordHash = await hash(rawPassword, 10);
    const user = await prisma.user.create({
      data: { name, email, phone, role, status, passwordHash },
      select: userSelect,
    });
    return res.status(201).json(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'Email sudah terdaftar.' });
    }
    next(error);
  }
}

// PUT /api/users/:id (admin)
export async function updateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parsePositiveId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'ID pengguna tidak valid.' });

    const errors: string[] = [];
    if (!isRecord(req.body)) errors.push('Data pengguna harus berupa objek.');
    const body = isRecord(req.body) ? req.body : {};

    const data: { name?: string; email?: string; phone?: string; status?: string; role?: string } = {};

    if (body.name !== undefined) {
      const name = cleanString(body.name);
      if (typeof body.name !== 'string' || !isValidName(name)) {
        errors.push('Nama harus 2 sampai 60 karakter.');
      } else {
        data.name = name;
      }
    }
    if (body.email !== undefined) {
      const email = cleanString(body.email).toLowerCase();
      if (typeof body.email !== 'string' || !isValidEmail(email)) {
        errors.push('Format email tidak valid.');
      } else {
        data.email = email;
      }
    }
    if (body.phone !== undefined) {
      data.phone = cleanString(body.phone);
    }
    if (body.status !== undefined) {
      const status = cleanString(body.status);
      if (status) data.status = status;
    }
    if (body.role === 'admin' || body.role === 'seller') {
      data.role = body.role;
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0], errors });
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: userSelect,
    });
    return res.json(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
      if (error.code === 'P2002') return res.status(409).json({ error: 'Email sudah digunakan akun lain.' });
    }
    next(error);
  }
}

// DELETE /api/users/:id (admin)
export async function deleteUser(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parsePositiveId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'ID pengguna tidak valid.' });
    if (id === req.user!.id) {
      return res.status(400).json({ error: 'Tidak dapat menghapus akun yang sedang digunakan.' });
    }

    await prisma.user.delete({ where: { id } });
    return res.json({ message: 'Pengguna dihapus.' });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
    }
    next(error);
  }
}
