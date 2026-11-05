import { NextFunction, Request, Response } from 'express';
import { JwtPayload, verify } from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

type UserRole = 'admin' | 'seller';

function readClaims(decoded: string | JwtPayload): { id: number; role: UserRole } | null {
  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
    return null;
  }

  const { id, role } = decoded;
  if (
    typeof id !== 'number' ||
    !Number.isSafeInteger(id) ||
    id < 1 ||
    (role !== 'admin' && role !== 'seller')
  ) {
    return null;
  }

  return { id, role };
}

// Membaca token (dari cookie "token" atau header Authorization: Bearer ...),
// memeriksa keasliannya, lalu menaruh identitas pengguna di req.user.
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  const token: string | undefined = req.cookies?.token ?? bearer;

  if (!token) {
    res.status(401).json({ error: 'Silakan login terlebih dahulu.' });
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    next(new Error('JWT_SECRET belum dikonfigurasi.'));
    return;
  }

  let claims: { id: number; role: UserRole } | null;
  try {
    claims = readClaims(verify(token, secret, { algorithms: ['HS256'] }));
  } catch {
    res.status(401).json({ error: 'Sesi tidak valid atau sudah habis. Silakan login ulang.' });
    return;
  }

  if (!claims) {
    res.status(401).json({ error: 'Sesi tidak valid atau sudah habis. Silakan login ulang.' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: claims.id },
      select: { id: true, role: true },
    });

    if (!user || user.role !== claims.role) {
      res.status(401).json({ error: 'Sesi tidak valid atau sudah habis. Silakan login ulang.' });
      return;
    }

    req.user = { id: user.id, role: user.role };
    next();
  } catch (error) {
    next(error);
  }
}
