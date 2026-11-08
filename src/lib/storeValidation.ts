import { isRecord, isValidEmail, parsePositiveId } from './validate';

export const STORE_STATUSES = ['buka', 'tutup', 'menunggu_verifikasi'] as const;
export type StoreStatus = (typeof STORE_STATUSES)[number];

export type ProductInput = {
  name: string;
  price: number;
  description: string;
  photoUrl: string | null;
};

export type StoreInput = {
  name: string;
  ownerName: string;
  categoryId: number;
  zone: string;
  status: StoreStatus;
  openTime: string | null;
  closeTime: string | null;
  establishedYear: number | null;
  phone: string;
  email: string;
  description: string;
  bannerUrl: string | null;
  logoUrl: string | null;
  sellerId: number | null;
  products: ProductInput[];
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const PHONE_PATTERN = /^[0-9+\-() ]{6,30}$/;
const MAX_DATABASE_INTEGER = 2_147_483_647;

// Cloudinary reference validation
// Expected format: cloudinary:stores/{storeId}/{uuid} or cloudinary:logos/{storeId}/{uuid}
// storeId must be a positive integer, uuid follows RFC‑4122 format
const CLOUDINARY_REGEX = /^cloudinary:(stores|logos)\/(\d+)\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$/;
function isValidCloudinaryReference(text: string): boolean {
  const match = CLOUDINARY_REGEX.exec(text);
  if (!match) return false;
  const storeId = Number(match[2]);
  return Number.isInteger(storeId) && storeId > 0;
}

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0026/g, ' dan ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'toko';
}

export function parsePrice(value: unknown): number | null {
  let amount: number;

  if (typeof value === 'number') {
    amount = value;
  } else if (typeof value === 'string') {
    const text = value.trim().replace(/^Rp\s*/i, '');
    if (/^\d+$/.test(text)) {
      amount = Number(text);
    } else if (/^\d{1,3}(?:\.\d{3})+$/.test(text)) {
      amount = Number(text.replace(/\./g, ''));
    } else {
      return null;
    }
  } else {
    return null;
  }

  return Number.isSafeInteger(amount) && amount >= 0 && amount <= MAX_DATABASE_INTEGER
    ? amount
    : null;
}

function parseUrl(value: unknown, label: string, errors: string[]): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    errors.push(`${label} harus berupa teks atau null.`);
    return null;
  }

  const text = value.trim();
  if (!text) return null;
  if (text.length > 500) {
    errors.push(`${label} maksimal 500 karakter.`);
    return null;
  }
  if (/[\u0000-\u001f\u007f\\]/.test(text)) {
    errors.push(`${label} tidak valid.`);
    return null;
  }

  // Cloudinary reference support
  if (isValidCloudinaryReference(text)) {
    return text;
  }

  if (text.startsWith('/')) {
    if (text.startsWith('//')) {
      errors.push(`${label} tidak boleh berupa alamat relatif lintas domain.`);
      return null;
    }
    return text;
  }

  try {
    const url = new URL(text);
    if (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.hostname &&
      !url.username &&
      !url.password
    ) {
      return text;
    }
  } catch {
    // URL yang tidak dapat dibaca akan ditolak.
  }

  errors.push(`${label} harus berupa URL HTTP/HTTPS, alamat lokal, atau referensi Cloudinary yang valid.`);
  return null;
}

function readText(
  value: unknown,
  label: string,
  maxLength: number,
  errors: string[],
  required = false,
): string | null {
  if (value === undefined && required) {
    errors.push(`${label} wajib diisi.`);
    return null;
  }
  if (typeof value !== 'string') {
    errors.push(`${label} harus berupa teks.`);
    return null;
  }

  const text = value.trim();
  if (required && !text) {
    errors.push(`${label} wajib diisi.`);
    return null;
  }
  if (text.length > maxLength) {
    errors.push(`${label} maksimal ${maxLength} karakter.`);
    return null;
  }
  return text;
}

function parseNullableId(value: unknown): number | null | undefined {
  if (value === null || (typeof value === 'string' && value.trim() === '')) {
    return null;
  }
  return parsePositiveId(value) ?? undefined;
}

export function parseStoreInput(body: unknown, mode: 'create' | 'update') {
  const errors: string[] = [];
  if (!isRecord(body)) {
    const data: Partial<StoreInput> = {};
    return { data, errors: ['Data toko harus berupa objek.'] };
  }

  const input = body;
  const data: Partial<StoreInput> = {};
  const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key);

  const editableFields = [
    'name', 'categoryId', 'ownerName', 'zone', 'status', 'openTime', 'closeTime',
    'establishedYear', 'phone', 'email', 'description', 'bannerUrl', 'logoUrl',
    'sellerId', 'products',
  ];
  if (mode === 'update' && !editableFields.some(has)) {
    errors.push('Minimal satu field toko harus dikirim.');
  }

  if (has('name') || mode === 'create') {
    const name = readText(input.name, 'Nama toko', 80, errors, mode === 'create');
    if (name !== null) {
      if (name.length < 2) errors.push('Nama toko harus 2 sampai 80 karakter.');
      else data.name = name;
    }
  }

  if (has('categoryId') || mode === 'create') {
    const id = parsePositiveId(input.categoryId);
    if (id === null) errors.push('Kategori harus berupa ID angka positif.');
    else data.categoryId = id;
  }

  if (has('ownerName')) {
    const value = readText(input.ownerName, 'Nama pemilik', 80, errors);
    if (value !== null) data.ownerName = value;
  }

  if (has('zone')) {
    const value = readText(input.zone, 'Zona', 60, errors);
    if (value !== null) data.zone = value;
  }

  if (has('status')) {
    const value = readText(input.status, 'Status', 30, errors);
    if (value !== null) {
      if (!(STORE_STATUSES as readonly string[]).includes(value)) {
        errors.push('Status harus buka, tutup, atau menunggu_verifikasi.');
      } else {
        data.status = value as StoreStatus;
      }
    }
  }

  const hasOpenTime = has('openTime');
  const hasCloseTime = has('closeTime');
  if (hasOpenTime !== hasCloseTime) {
    errors.push('Jam buka dan jam tutup harus dikirim bersama.');
  } else if (hasOpenTime && hasCloseTime) {
    const readTime = (key: 'openTime' | 'closeTime'): string | null | undefined => {
      if (input[key] === null) return null;
      const value = readText(
        input[key],
        key === 'openTime' ? 'Jam buka' : 'Jam tutup',
        5,
        errors,
      );
      if (value === null) return undefined;
      if (!TIME_PATTERN.test(value)) {
        errors.push('Jam harus berformat HH:MM, contoh 06:00.');
        return undefined;
      }
      return value;
    };

    const openTime = readTime('openTime');
    const closeTime = readTime('closeTime');
    if (openTime !== undefined && closeTime !== undefined) {
      if ((openTime === null) !== (closeTime === null)) {
        errors.push('Jam buka dan jam tutup harus sama-sama null atau sama-sama berformat HH:MM.');
      } else {
        data.openTime = openTime;
        data.closeTime = closeTime;
      }
    }
  }

  if (has('establishedYear')) {
    const year = parseNullableId(input.establishedYear);
    const maxYear = new Date().getFullYear();
    if (year === undefined || (year !== null && (year < 1800 || year > maxYear))) {
      errors.push('Tahun berdiri tidak valid.');
    } else {
      data.establishedYear = year;
    }
  }

  if (has('phone')) {
    const value = readText(input.phone, 'Nomor telepon', 30, errors);
    if (value !== null) {
      if (value && !PHONE_PATTERN.test(value)) errors.push('Nomor telepon tidak valid.');
      else data.phone = value;
    }
  }

  if (has('email')) {
    const value = readText(input.email, 'Email toko', 254, errors);
    if (value !== null) {
      const email = value.toLowerCase();
      if (email && !isValidEmail(email)) errors.push('Format email toko tidak valid.');
      else data.email = email;
    }
  }

  if (has('description')) {
    const value = readText(input.description, 'Deskripsi', 1000, errors);
    if (value !== null) data.description = value;
  }

  if (has('bannerUrl')) data.bannerUrl = parseUrl(input.bannerUrl, 'Banner', errors);
  if (has('logoUrl')) data.logoUrl = parseUrl(input.logoUrl, 'Logo', errors);

  if (has('sellerId')) {
    const sellerId = parseNullableId(input.sellerId);
    if (sellerId === undefined) errors.push('Penjual harus berupa ID angka positif atau null.');
    else data.sellerId = sellerId;
  }

  if (has('products')) {
    if (!Array.isArray(input.products) || input.products.length > 50) {
      errors.push('Daftar produk tidak valid (maksimal 50).');
    } else {
      const products: ProductInput[] = [];
      input.products.forEach((raw: unknown, index: number) => {
        if (!isRecord(raw)) {
          errors.push(`Produk ke-${index + 1} harus berupa objek.`);
          return;
        }

        const errorCount = errors.length;
        const name = readText(raw.name, `Nama produk ke-${index + 1}`, 80, errors, true);
        const price = parsePrice(raw.price);
        if (price === null) errors.push(`Produk ke-${index + 1}: harga harus bilangan bulat Rupiah yang valid.`);

        let description = '';
        if (Object.prototype.hasOwnProperty.call(raw, 'description')) {
          const value = readText(raw.description, `Deskripsi produk ke-${index + 1}`, 300, errors);
          if (value !== null) description = value;
        }

        const photoUrl = Object.prototype.hasOwnProperty.call(raw, 'photoUrl')
          ? parseUrl(raw.photoUrl, `Foto produk ke-${index + 1}`, errors)
          : null;

        if (errors.length === errorCount && name !== null && price !== null) {
          products.push({ name, price, description, photoUrl });
        }
      });
      data.products = products;
    }
  }

  return { data, errors };
}
