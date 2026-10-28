// Menambahkan req.user ke tipe Request milik Express
declare global {
  namespace Express {
    interface Request {
      user?: { id: number; role: string };
    }
  }
}

export {};
