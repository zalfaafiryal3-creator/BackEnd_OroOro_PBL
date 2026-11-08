import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import {
  generateSignature,
  verifyAsset,
  deleteAsset,
  buildSecureUrl,
} from '../services/cloudinaryService';

/**
 * POST /api/cloudinary/signature
 * Expected body: { storeId: number, type: 'banner' | 'logo', mime: string }
 * Returns the signed payload required for Cloudinary Direct Upload.
 */

export async function getSignature(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { storeId, type, mime } = req.body as {
      storeId: unknown;
      type: unknown;
      mime: unknown;
    };

    // Basic validation
    if (!storeId || !type || !mime) {
      return res
        .status(400)
        .json({ error: 'storeId, type, and mime are required.' });
    }
    const storeIdNum = Number(storeId);
    if (!Number.isInteger(storeIdNum) || storeIdNum <= 0) {
      return res.status(400).json({ error: 'storeId must be a positive integer.' });
    }
    if (type !== 'banner' && type !== 'logo') {
      return res.status(400).json({ error: "type must be 'banner' or 'logo'." });
    }

    // Verify that the store exists
    const store = await prisma.store.findUnique({ where: { id: storeIdNum } });
    if (!store) {
      return res.status(404).json({ error: 'Store not found.' });
    }

    // Generate the signed payload using the service
    const payload = generateSignature({
      storeId: storeIdNum,
      type: type as 'banner' | 'logo',
      mime: String(mime),
    });

    res.json(payload);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/cloudinary/confirm
 * Expected body: { storeId: number, type: 'banner' | 'logo', public_id: string }
 * Verifies the uploaded asset, updates the store record, and returns the HTTPS URL.
 */
export async function confirmUpload(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { storeId, type, public_id } = req.body as {
      storeId: unknown;
      type: unknown;
      public_id: unknown;
    };

    if (!storeId || !type || !public_id) {
      return res
        .status(400)
        .json({ error: 'storeId, type, and public_id are required.' });
    }
    const storeIdNum = Number(storeId);
    if (!Number.isInteger(storeIdNum) || storeIdNum <= 0) {
      return res.status(400).json({ error: 'storeId must be a positive integer.' });
    }
    if (type !== 'banner' && type !== 'logo') {
      return res.status(400).json({ error: "type must be 'banner' or 'logo'." });
    }
    const publicId = String(public_id);

    // Ensure the store exists
    const store = await prisma.store.findUnique({ where: { id: storeIdNum } });
    if (!store) {
      return res.status(404).json({ error: 'Store not found.' });
    }

    // Verify the asset belongs to this store and is a valid image
    const isValid = await verifyAsset(publicId, {
      storeId: storeIdNum,
      type: type as 'banner' | 'logo',
    });
    if (!isValid) {
      return res.status(400).json({ error: 'Asset verification failed.' });
    }

    // Determine which column to update
    const field = type === 'banner' ? 'bannerUrl' : 'logoUrl';
    const newReference = `cloudinary:${publicId}`;

    // Keep old reference for possible clean‑up (typed safely)
    let oldReference: string | null = null;
    if (field === 'bannerUrl') {
      oldReference = store.bannerUrl;
    } else {
      oldReference = store.logoUrl;
    }

    // Update the store record
    await prisma.store.update({
      where: { id: storeIdNum },
      data: { [field]: newReference },
    });

    // Delete old Cloudinary asset if it was a Cloudinary reference
    if (oldReference && oldReference.startsWith('cloudinary:')) {
      const oldPublicId = oldReference.replace('cloudinary:', '');
      try {
        await deleteAsset(oldPublicId);
      } catch (e) {
        // Log but do not roll back the DB change
        console.error('Failed to delete previous Cloudinary asset:', e);
      }
    }

    // Return the secure URL for the newly uploaded asset
    const url = buildSecureUrl(publicId);
    res.json({ url });
  } catch (err) {
    next(err);
  }
}

