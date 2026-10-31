import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/authRoutes';
import categoryRoutes from './routes/categoryRoutes';
import storeRoutes from './routes/storeRoutes';
import { marketReviewRoutes, storeReviewRoutes } from './routes/reviewRoutes';


export const app = express();

const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Tanpa origin = aplikasi mobile / Thunder Client / curl: diizinkan
      if (!origin) return callback(null, true);
      const localhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
      if (allowedOrigins.includes(origin) || (!isProduction && localhost)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true, // agar cookie login boleh dikirim dari frontend
  }),
);
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());

// Cek server hidup
app.get('/', (_req, res) => res.json({ status: 'ok', app: 'Pasar Oro-Oro Dowo API' }));

app.use('/api/auth', authRoutes);
app.use('/api/store-reviews', storeReviewRoutes);
app.use('/api/market-reviews', marketReviewRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/stores', storeRoutes);

// Endpoint tidak dikenal
app.use((_req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));
