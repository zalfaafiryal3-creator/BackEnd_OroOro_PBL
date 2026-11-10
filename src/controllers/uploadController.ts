import { Request, Response } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';

const storage = multer.memoryStorage();

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Format file tidak didukung. Harap unggah file JPG, PNG, atau WebP.'));
  }
};

export const uploadSingleImage = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // Maksimal 5MB
  },
  fileFilter,
}).single('file');

export const uploadImageHandler = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Tidak ada file gambar yang dipilih.' });
    }

    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;

    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
      return res.status(503).json({
        error: 'Kredensial Cloudinary belum lengkap di file .env backend.',
      });
    }

    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
      secure: true,
    });

    const folder =
      typeof req.body?.folder === 'string' && req.body.folder.trim()
        ? `pasar-oro-oro-dowo/${req.body.folder.trim()}`
        : 'pasar-oro-oro-dowo';

    const result = await new Promise<{ url: string; public_id: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
        },
        (error, uploadResult) => {
          if (error || !uploadResult) {
            return reject(error ?? new Error('Gagal mengunggah berkas ke Cloudinary.'));
          }
          resolve({
            url: uploadResult.secure_url,
            public_id: uploadResult.public_id,
          });
        },
      );
      stream.end(req.file!.buffer);
    });

    return res.status(200).json({
      url: result.url,
      publicId: result.public_id,
      message: 'Foto berhasil diunggah ke Cloudinary.',
    });
  } catch (error: any) {
    const message =
      typeof error?.message === 'string'
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Terjadi kesalahan saat mengunggah foto ke Cloudinary.';

    return res.status(500).json({ error: message });
  }
};
