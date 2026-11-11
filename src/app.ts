import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import authRoutes from './routes/authRoutes';
import categoryRoutes from './routes/categoryRoutes';
import storeRoutes from './routes/storeRoutes';
import { marketReviewRoutes, storeReviewRoutes } from './routes/reviewRoutes';
<<<<<<< Updated upstream
import cloudinaryRoutes from './routes/cloudinaryRoutes';
import uploadRoutes from './routes/uploadRoutes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
=======
import visitPlannerRoutes from './routes/visitPlannerRoutes';
>>>>>>> Stashed changes


export const app = express();

app.use(helmet());
app.use(requestLogger);

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
<<<<<<< Updated upstream
app.use('/api/cloudinary', cloudinaryRoutes);
app.use('/api/upload', uploadRoutes);
=======
app.use('/api/visit-planner', visitPlannerRoutes);
>>>>>>> Stashed changes

app.use(notFoundHandler);
app.use(errorHandler);
