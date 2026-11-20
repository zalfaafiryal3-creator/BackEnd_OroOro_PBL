import 'dotenv/config';

export const config = {
  app: {
    env: process.env.NODE_ENV || 'development',
    isProduction: process.env.NODE_ENV === 'production',
    port: Number(process.env.PORT) || 4000,
    host: '0.0.0.0',
  },
  cors: {
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  },
  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiresIn: '7d',
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },
  database: {
    url: process.env.DATABASE_URL || '',
  },
} as const;

export default config;
