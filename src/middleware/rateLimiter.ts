import rateLimit from 'express-rate-limit';

// Login: maksimal 10 percobaan GAGAL per 15 menit (login berhasil tidak dihitung)
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' },
});

// Daftar: maksimal 10 pendaftaran per jam dari satu alamat
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak pendaftaran. Coba lagi nanti.' },
});

// Kirim ulasan: maksimal 30 per menit
export const reviewLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak permintaan. Coba lagi sebentar.' },
});
