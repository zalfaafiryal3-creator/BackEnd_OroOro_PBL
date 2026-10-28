import { Request, Response } from 'express';
import { hash, compare, hashSync } from 'bcryptjs';
import { sign } from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { cleanString, isValidEmail, isValidName } from '../lib/validate';
import { validatePassword } from '../lib/validatePassword';

const COOKIE_NAME = 'token';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Hash palsu: dipakai saat email tidak ditemukan, supaya waktu respons login
// tidak membedakan "email tidak ada" dan "password salah".
const DUMMY_HASH = hashSync('password-palsu', 10);

type UserRow = { id: number; name: string; email: string; role: string };

function createToken(user: { id: number; role: string }): string {
  return sign({ id: user.id, role: user.role }, process.env.JWT_SECRET as string, { expiresIn: '7d' });
}

const cookieOptions = {
  httpOnly: true, // tidak bisa dibaca JavaScript di browser
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production', // production wajib HTTPS
};

// Hanya data yang aman dikirim ke frontend (TANPA password)
const publicUser = (u: UserRow) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

// POST /api/auth/register
export async function register(req: Request, res: Response) {
  try {
    const name = cleanString(req.body?.name);
    const email = cleanString(req.body?.email).toLowerCase();
    const password = req.body?.password;
    const confirmPassword = req.body?.confirmPassword;

    const errors: string[] = [];
    if (!isValidName(name)) errors.push('Nama harus 2 sampai 60 karakter.');
    if (!isValidEmail(email)) errors.push('Format email tidak valid.');
    errors.push(...validatePassword(password));
    if (confirmPassword !== undefined && confirmPassword !== password) {
      errors.push('Konfirmasi password tidak sama.');
    }
    if (errors.length > 0) return res.status(400).json({ error: errors[0], errors });

    // Akun pertama jadi admin, berikutnya seller.
    // Peran TIDAK diambil dari kiriman pengguna supaya tidak bisa asal mengaku admin.
    const total = await prisma.user.count();
    const role = total === 0 ? 'admin' : 'seller';

    const passwordHash = await hash(password as string, 10);
    const user = await prisma.user.create({ data: { name, email, passwordHash, role } });

    const token = createToken(user);
    res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: SEVEN_DAYS_MS });
    return res.status(201).json({ user: publicUser(user), token });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'Email sudah terdaftar.' });
    }
    console.error(error);
    return res.status(500).json({ error: 'Terjadi kesalahan di server.' });
  }
}

// POST /api/auth/login
export async function login(req: Request, res: Response) {
  try {
    const email = cleanString(req.body?.email).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      return res.status(400).json({ error: 'Email dan password wajib diisi.' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    const cocok = await compare(password, user ? user.passwordHash : DUMMY_HASH);

    if (!user || !cocok) {
      return res.status(401).json({ error: 'Email atau password salah.' });
    }

    const token = createToken(user);
    res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: SEVEN_DAYS_MS });
    return res.json({ user: publicUser(user), token });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Terjadi kesalahan di server.' });
  }
}

// POST /api/auth/logout
export function logout(_req: Request, res: Response) {
  res.clearCookie(COOKIE_NAME, cookieOptions);
  return res.json({ message: 'Berhasil logout.' });
}

// GET /api/auth/me  (lewat authMiddleware, jadi req.user sudah terisi)
export async function me(req: Request, res: Response) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!user) return res.status(401).json({ error: 'Akun tidak ditemukan.' });
    return res.json({ user });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Terjadi kesalahan di server.' });
  }
}
