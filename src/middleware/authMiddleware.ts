import { NextFunction, Request, Response } from 'express';
import { verify } from 'jsonwebtoken';

// Membaca token (dari cookie "token" atau header Authorization: Bearer ...),
// memeriksa keasliannya, lalu menaruh identitas pengguna di req.user.
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  const token: string | undefined = req.cookies?.token ?? bearer;

  if (!token) {
    return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });
  }

  try {
    const payload = verify(token, process.env.JWT_SECRET as string) as { id: number; role: string };
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ error: 'Sesi tidak valid atau sudah habis. Silakan login ulang.' });
  }
}
