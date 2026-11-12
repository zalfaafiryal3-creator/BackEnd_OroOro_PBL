import { buildSecureUrl } from './cloudinaryService';

const CLOUDINARY_PREFIX = 'cloudinary:';

export function resolveStoreImageUrl(value: string | null): string | null {
  if (value === null) return null;
  if (value.startsWith(CLOUDINARY_PREFIX)) {
    return buildSecureUrl(value.slice(CLOUDINARY_PREFIX.length));
  }
  return value;
}
