import { NextFunction, Request, Response } from 'express';

// Pakai SETELAH authMiddleware. Contoh: requireRole('admin')
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Kamu tidak punya izin untuk aksi ini.' });
    }
    next();
  };
}
