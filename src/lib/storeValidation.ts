import { cleanString, isValidEmail } from './validate';

// Daftar status toko yang diizinkan
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
  openTime: string;
  closeTime: string;
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

// Ubah teks menjadi alamat URL yang rapi, contoh: "Bakso Goreng" -> "bakso-goreng"
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' dan ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'toko';
}

// Ubah "7000", "Rp 7.000", atau 7000 menjadi angka 7000. Gagal -> null
export function parsePrice(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value === 'string') {
    const digits = value.replace(/[^\d]/g, '');
    if (!digits) return null;
    const n = Number(digits);
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}

// Gambar harus berupa alamat (URL), bukan data base64
function parseUrl(value: unknown, label: string, errors: string[]): string | null {
  if (value === null || value === undefined) return null;
  const text = cleanString(value);
  if (!text) return null;
  if (text.length > 500) {
    errors.push(`${label} terlalu panjang.`);
    return null;
  }
  if (!(text.startsWith('/') || /^https?:\/\//i.test(text))) {
    errors.push(`${label} harus berupa alamat (URL), bukan data gambar langsung.`);
    return null;
  }
  return text;
}

function parseIntOrNull(value: unknown): number | null | undefined {
  if (value === null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : undefined; // undefined = tidak valid
}

// Memeriksa kiriman dari admin/penjual.
// mode "create": nama dan kategori wajib. mode "update": hanya field yang dikirim yang diperiksa.
export function parseStoreInput(body: unknown, mode: 'create' | 'update') {
  const errors: string[] = [];
  const input = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const data: Partial<StoreInput> = {};
  const has = (key: string) => input[key] !== undefined;

  if (has('name') || mode === 'create') {
    const name = cleanString(input.name);
    if (name.length < 2 || name.length > 80) errors.push('Nama toko harus 2 sampai 80 karakter.');
    else data.name = name;
  }

  if (has('categoryId') || mode === 'create') {
    const id = Number(input.categoryId);
    if (!Number.isInteger(id) || id < 1) errors.push('Kategori wajib dipilih.');
    else data.categoryId = id;
  }

  if (has('ownerName')) {
    const v = cleanString(input.ownerName);
    if (v.length > 80) errors.push('Nama pemilik maksimal 80 karakter.');
    else data.ownerName = v;
  }

  if (has('zone')) {
    const v = cleanString(input.zone);
    if (v.length > 60) errors.push('Zona maksimal 60 karakter.');
    else data.zone = v;
  }

  if (has('status')) {
    const v = cleanString(input.status);
    if (!(STORE_STATUSES as readonly string[]).includes(v)) {
      errors.push('Status harus buka, tutup, atau menunggu_verifikasi.');
    } else data.status = v as StoreStatus;
  }

  for (const key of ['openTime', 'closeTime'] as const) {
    if (has(key)) {
      const v = cleanString(input[key]);
      if (!TIME_PATTERN.test(v)) errors.push('Jam harus berformat HH:MM, contoh 06:00.');
      else data[key] = v;
    }
  }

  if (has('establishedYear')) {
    const y = parseIntOrNull(input.establishedYear);
    const maxYear = new Date().getFullYear();
    if (y === undefined || (y !== null && (y < 1800 || y > maxYear))) {
      errors.push('Tahun berdiri tidak valid.');
    } else data.establishedYear = y;
  }

  if (has('phone')) {
    const v = cleanString(input.phone);
    if (v && !PHONE_PATTERN.test(v)) errors.push('Nomor telepon tidak valid.');
    else data.phone = v;
  }

  if (has('email')) {
    const v = cleanString(input.email).toLowerCase();
    if (v && !isValidEmail(v)) errors.push('Format email toko tidak valid.');
    else data.email = v;
  }

  if (has('description')) {
    const v = cleanString(input.description);
    if (v.length > 1000) errors.push('Deskripsi maksimal 1000 karakter.');
    else data.description = v;
  }

  if (has('bannerUrl')) data.bannerUrl = parseUrl(input.bannerUrl, 'Banner', errors);
  if (has('logoUrl')) data.logoUrl = parseUrl(input.logoUrl, 'Logo', errors);

  if (has('sellerId')) {
    const s = parseIntOrNull(input.sellerId);
    if (s === undefined || (s !== null && s < 1)) errors.push('Penjual tidak valid.');
    else data.sellerId = s;
  }

  if (has('products')) {
    if (!Array.isArray(input.products) || input.products.length > 50) {
      errors.push('Daftar produk tidak valid (maksimal 50).');
    } else {
      const products: ProductInput[] = [];
      input.products.forEach((raw: unknown, i: number) => {
        const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
        const name = cleanString(p.name);
        const price = parsePrice(p.price ?? 0);
        const description = cleanString(p.description);
        if (name.length < 1 || name.length > 80) {
          errors.push(`Produk ke-${i + 1}: nama harus 1 sampai 80 karakter.`);
        } else if (price === null) {
          errors.push(`Produk ke-${i + 1}: harga tidak valid.`);
        } else if (description.length > 300) {
          errors.push(`Produk ke-${i + 1}: deskripsi maksimal 300 karakter.`);
        } else {
          products.push({ name, price, description, photoUrl: parseUrl(p.photoUrl, `Foto produk ke-${i + 1}`, errors) });
        }
      });
      data.products = products;
    }
  }

  return { data, errors };
}