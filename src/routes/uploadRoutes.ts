import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { uploadSingleImage, uploadImageHandler } from '../controllers/uploadController';

const router = Router();

router.post(
  '/',
  (req: Request, res: Response, next: NextFunction) => {
    uploadSingleImage(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'Ukuran file terlalu besar. Maksimal 5MB.' });
        }
        return res.status(400).json({ error: `Kesalahan upload: ${err.message}` });
      }
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      return next();
    });
  },
  uploadImageHandler,
);

export default router;

