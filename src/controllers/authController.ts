import { NextFunction, Request, Response } from 'express';
import { hash, compare, hashSync } from 'bcryptjs';
import { sign } from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { cleanString, isRecord, isValidEmail, isValidName } from '../lib/validate';
import { validatePassword } from '../lib/validatePassword';

const COOKIE_NAME = 'token';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Hash palsu: dipakai saat email tidak ditemukan, supaya waktu respons login
// tidak membedakan "email tidak ada" dan "password salah".
const DUMMY_HASH = hashSync('password-palsu', 10);

type UserRow = { id: number; name: string; email: string; role: string };

function createToken(user: { id: number; role: string }): string {
  return sign({ id: user.id, role: user.role }, process.env.JWT_SECRET as string, {
    expiresIn: '7d',
    algorithm: 'HS256',
  });
}

const cookieOptions = {
  httpOnly: true, // tidak bisa dibaca JavaScript di browser
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production', // production wajib HTTPS
};

// Hanya data yang aman dikirim ke frontend (TANPA password)
const publicUser = (u: UserRow) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

// POST /api/auth/register
export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const errors: string[] = [];
    if (!isRecord(req.body)) {
      errors.push('Data pendaftaran harus berupa objek.');
    }

    const body = isRecord(req.body) ? req.body : {};
    const name = cleanString(body.name);
    const email = cleanString(body.email).toLowerCase();
    const password = body.password;
    const passwordValue = typeof password === 'string' ? password : '';
    const confirmPassword = body.confirmPassword;

    if (typeof body.name !== 'string' || !isValidName(name)) {
      errors.push('Nama harus 2 sampai 60 karakter.');
    }
    if (typeof body.email !== 'string' || !isValidEmail(email)) {
      errors.push('Format email tidak valid.');
    }
    errors.push(...validatePassword(password));
    if (typeof confirmPassword !== 'string' || confirmPassword.length === 0) {
      errors.push('Konfirmasi password wajib diisi.');
    } else if (confirmPassword !== password) {
      errors.push('Konfirmasi password tidak sama.');
    }
    if (
      body.role !== undefined &&
      body.role !== 'admin' &&
      body.role !== 'seller'
    ) {
      errors.push('Role tidak valid.');
    }
    if (errors.length > 0) return res.status(400).json({ error: errors[0], errors });

    const passwordHash = await hash(passwordValue, 10);
    const role = body.role === 'admin' ? 'admin' : 'seller';
    const user = await prisma.user.create({ data: { name, email, passwordHash, role } });

    const token = createToken(user);
    res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: SEVEN_DAYS_MS });
    return res.status(201).json({ user: publicUser(user), token });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'Email sudah terdaftar.' });
    }
    next(error);
  }
}

// POST /api/auth/login
export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const errors: string[] = [];
    if (!isRecord(req.body)) errors.push('Data login harus berupa objek.');

    const body = isRecord(req.body) ? req.body : {};
    const email = cleanString(body.email).toLowerCase();
    const password = body.password;
    const passwordValue = typeof password === 'string' ? password : '';

    if (typeof body.email !== 'string' || !email) {
      errors.push('Email wajib diisi.');
    } else if (!isValidEmail(email)) {
      errors.push('Format email tidak valid.');
    }
    if (!passwordValue) {
      errors.push('Password wajib diisi.');
    } else if (Buffer.byteLength(passwordValue, 'utf8') > 72) {
      errors.push('Password maksimal 72 byte.');
    }
    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0], errors });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    const cocok = await compare(passwordValue, user ? user.passwordHash : DUMMY_HASH);

    if (!user || !cocok) {
      return res.status(401).json({ error: 'Email atau password salah.' });
    }

    const token = createToken(user);
    res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: SEVEN_DAYS_MS });
    return res.json({ user: publicUser(user), token });
  } catch (error) {
    next(error);
  }
}

// POST /api/auth/logout
export function logout(_req: Request, res: Response) {
  res.clearCookie(COOKIE_NAME, cookieOptions);
  return res.json({ message: 'Berhasil logout.' });
}

// GET /api/auth/me  (lewat authMiddleware, jadi req.user sudah terisi)
export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!user) return res.status(401).json({ error: 'Akun tidak ditemukan.' });
    return res.json({ user });
  } catch (error) {
    next(error);
  }
}
