import { isRecord } from './validate';

export type MobileStoreSyncRow = {
  index: number;
  sourceMobileId: string | null;
  name: string | null;
  category: string | null;
  errors: string[];
};

const SOURCE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SYNC_ROWS = 200;

function readField(
  value: unknown,
  field: string,
  maxLength: number,
  errors: string[],
  pattern?: RegExp,
): string | null {
  if (typeof value !== 'string') {
    errors.push(`${field} wajib berupa teks.`);
    return null;
  }

  const text = value.trim();
  if (!text) {
    errors.push(`${field} wajib diisi.`);
    return null;
  }
  if (text.length > maxLength) {
    errors.push(`${field} maksimal ${maxLength} karakter.`);
    return null;
  }
  if (pattern && !pattern.test(text)) {
    errors.push(`${field} harus berupa slug huruf kecil, angka, dan tanda hubung.`);
    return null;
  }
  return text;
}

export function parseMobileStoreSyncRequest(body: unknown): {
  rows: MobileStoreSyncRow[];
  errors: string[];
} {
  if (!isRecord(body) || !Array.isArray(body.stores)) {
    return { rows: [], errors: ['Field stores harus berupa daftar toko.'] };
  }
  if (body.stores.length > MAX_SYNC_ROWS) {
    return { rows: [], errors: [`Maksimal ${MAX_SYNC_ROWS} toko per permintaan.`] };
  }

  const rows = body.stores.map((raw: unknown, index): MobileStoreSyncRow => {
    const errors: string[] = [];
    if (!isRecord(raw)) {
      return {
        index,
        sourceMobileId: null,
        name: null,
        category: null,
        errors: ['Data toko harus berupa objek.'],
      };
    }

    const allowedFields = new Set([
      'sourceMobileId',
      'id',
      'name',
      'category',
      'displayCategory',
      'badge',
      'rating',
      'products',
      'image',
    ]);
    for (const field of Object.keys(raw)) {
      if (!allowedFields.has(field)) {
        errors.push(`Field ${field} tidak didukung untuk sinkronisasi.`);
      }
    }

    const has = (field: string) => Object.prototype.hasOwnProperty.call(raw, field);
    const mobileId = has('id')
      ? readField(raw.id, 'ID Mobile', 100, errors, SOURCE_ID_PATTERN)
      : null;
    let sourceMobileId = mobileId;
    if (has('sourceMobileId')) {
      sourceMobileId = readField(
        raw.sourceMobileId,
        'sourceMobileId',
        100,
        errors,
        SOURCE_ID_PATTERN,
      );
    } else if (!mobileId) {
      readField(undefined, 'sourceMobileId', 100, errors, SOURCE_ID_PATTERN);
    }
    if (mobileId && sourceMobileId && mobileId !== sourceMobileId) {
      errors.push('id dan sourceMobileId harus memiliki nilai yang sama.');
    }

    for (const field of ['displayCategory', 'badge', 'rating', 'products', 'image']) {
      if (has(field) && typeof raw[field] !== 'string') {
        errors.push(`Field ${field} harus berupa teks.`);
      }
    }

    return {
      index,
      sourceMobileId,
      name: readField(raw.name, 'Nama toko', 80, errors),
      category: readField(raw.category, 'Kategori', 80, errors),
      errors,
    };
  });

  return { rows, errors: [] };
}
