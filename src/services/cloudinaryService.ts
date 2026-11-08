import { v2 as cloudinary } from 'cloudinary';
import { randomUUID } from 'crypto';

/** Ensure that all required Cloudinary environment variables are set.
 * Throws a clear error if any are missing. Also configures the Cloudinary SDK.
 */
function assertCloudinaryConfig(): void {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error(
      'Cloudinary configuration missing. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.'
    );
  }
  // Configure the SDK (idempotent – re‑calling with same values is safe).
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
  });
}

/** Validate allowed MIME types for uploads. */
function validateParams(mime: string): void {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedMimes.includes(mime)) {
    throw new Error(`MIME type "${mime}" not allowed.`);
  }
}

/**
 * Generate a signed Direct Upload payload for Cloudinary.
 * The backend decides the folder and public_id based on storeId and image type.
 */
export function generateSignature(params: {
  storeId: number;
  type: 'banner' | 'logo';
  mime: string;
}): {
  cloud_name: string;
  api_key: string;
  timestamp: number;
  signature: string;
  public_id: string;
  asset_folder: string;
  public_id_prefix: string;
  resource_type: string;
} {
  assertCloudinaryConfig();

  const { storeId, type, mime } = params;
  if (!Number.isInteger(storeId) || storeId <= 0) {
    throw new Error('storeId must be a positive integer.');
  }

  // Dynamic folder that also serves as public_id prefix.
  const assetFolder = type === 'banner' ? `stores/${storeId}` : `logos/${storeId}`;
  validateParams(mime);

  // public_id is a bare UUID; the final Cloudinary public_id will be
  // `${assetFolder}/${publicId}` (prefix handled by Cloudinary via `public_id_prefix`).
  const publicId = randomUUID();
  const timestamp = Math.round(Date.now() / 1000);

  // Sign the parameters that will be sent to Cloudinary.
  const signature = cloudinary.utils.api_sign_request(
    {
      asset_folder: assetFolder,
      public_id_prefix: assetFolder,
      public_id: publicId,
      timestamp,
    },
    process.env.CLOUDINARY_API_SECRET ?? ''
  );

  return {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME ?? '',
    api_key: process.env.CLOUDINARY_API_KEY ?? '',
    timestamp,
    signature,
    public_id: publicId,
    asset_folder: assetFolder,
    public_id_prefix: assetFolder,
    resource_type: 'image',
  };
}


/** Build the secure HTTPS URL for a given public_id. */
export function buildSecureUrl(
  publicId: string,
  options?: { width?: number; height?: number; format?: string }
): string {
  return cloudinary.url(publicId, { secure: true, ...options });
}

/** Verify that an asset exists, is an image, and belongs to the expected store/type. */
export async function verifyAsset(
  publicId: string,
  expected: { storeId: number; type: 'banner' | 'logo' }
): Promise<boolean> {
  assertCloudinaryConfig();

  const folder = expected.type === 'banner' ? 'stores' : 'logos';
  // UUID v4 regex (RFC 4122) – strict
  const uuidPattern = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';
  const regex = new RegExp(`^${folder}\/${expected.storeId}\/${uuidPattern}$`);

  // 1. Validate format of publicId
  if (!regex.test(publicId)) {
    return false;
  }

  try {
    const result = await cloudinary.api.resource(publicId, { resource_type: 'image' });
    if (!result) return false;

    // Cloudinary may return `folder` (previous API) or `asset_folder` (newer). Use whichever exists.
    const assetFolder = (result as any).asset_folder ?? (result as any).folder;

    const allowedFormats = ['jpg', 'jpeg', 'png', 'webp'];

    const isValid =
      result.public_id === publicId &&
      result.resource_type === 'image' &&
      assetFolder === `${folder}/${expected.storeId}` &&
      allowedFormats.includes((result as any).format);

    return isValid;
  } catch (e) {
    // Any error (e.g., not found, permission) means verification fails.
    return false;
  }
}

/** Delete an asset by public_id. Throws if the deletion fails. */
export async function deleteAsset(publicId: string): Promise<void> {
  assertCloudinaryConfig();
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch (e) {
    // Propagate error for caller handling/logging.
    throw e;
  }
}
