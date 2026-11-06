import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  MobileStoreSyncRow,
  parseMobileStoreSyncRequest,
} from '../lib/mobileStoreSyncValidation';

const syncStoreSelect = {
  id: true,
  slug: true,
  sourceMobileId: true,
  name: true,
  categoryId: true,
  category: { select: { id: true, name: true } },
} satisfies Prisma.StoreSelect;

type SyncStoreRecord = Prisma.StoreGetPayload<{ select: typeof syncStoreSelect }>;
type SyncCategory = { id: number; name: string };
type SyncStatus = 'create' | 'already_present' | 'conflict' | 'invalid';

type SyncResult = {
  index: number;
  sourceMobileId: string | null;
  name: string | null;
  status: SyncStatus;
  reason?: string;
  categoryId?: number;
  created?: boolean;
};

const possibleDuplicateNameGroups = [
  new Set(['freshgreen', 'fresgreenorganic']),
];

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function findCategory(row: MobileStoreSyncRow, categories: SyncCategory[]) {
  if (!row.category) return undefined;
  const normalizedCategory = normalize(row.category);
  return categories.find((category) => normalize(category.name) === normalizedCategory);
}

function rowResult(
  row: MobileStoreSyncRow,
  status: SyncStatus,
  reason?: string,
  categoryId?: number,
  created?: boolean,
): SyncResult {
  return {
    index: row.index,
    sourceMobileId: row.sourceMobileId,
    name: row.name,
    status,
    ...(reason ? { reason } : {}),
    ...(categoryId !== undefined ? { categoryId } : {}),
    ...(created !== undefined ? { created } : {}),
  };
}

function compareExistingStore(
  row: MobileStoreSyncRow,
  store: SyncStoreRecord,
  category: SyncCategory | undefined,
  matchType: 'source' | 'slug',
): SyncResult {
  const differences: string[] = [];
  if (!row.name || normalize(store.name) !== normalize(row.name)) {
    differences.push(`nama sumber "${row.name ?? ''}" berbeda dari "${store.name}"`);
  }
  if (!category) {
    differences.push(`kategori "${row.category ?? ''}" belum memiliki pasangan Backend`);
  } else if (store.categoryId !== category.id) {
    differences.push(`kategori sumber "${row.category ?? ''}" berbeda dari "${store.category.name}"`);
  }

  if (differences.length > 0) {
    return rowResult(
      row,
      'conflict',
      `Benturan ${matchType === 'source' ? 'identitas sumber' : 'slug'}: ${differences.join('; ')}. Data lama tidak diubah.`,
      category?.id,
    );
  }

  return rowResult(
    row,
    'already_present',
    `Toko sudah terwakili melalui ${matchType === 'source' ? 'sourceMobileId' : 'slug'}; data lama tidak diubah.`,
    category?.id,
  );
}

function findKnownPossibleDuplicate(
  row: MobileStoreSyncRow,
  stores: SyncStoreRecord[],
): SyncStoreRecord | undefined {
  if (!row.name) return undefined;
  const sourceName = normalize(row.name);
  const aliasGroup = possibleDuplicateNameGroups.find((group) => group.has(sourceName));
  if (!aliasGroup) return undefined;

  return stores.find((store) => aliasGroup.has(normalize(store.name)) && normalize(store.name) !== sourceName);
}

function evaluateRow(
  row: MobileStoreSyncRow,
  stores: SyncStoreRecord[],
  categories: SyncCategory[],
): SyncResult {
  if (row.errors.length > 0 || !row.sourceMobileId || !row.name || !row.category) {
    return rowResult(row, 'invalid', row.errors.join(' '));
  }

  const category = findCategory(row, categories);
  const sourceMatch = stores.find((store) => store.sourceMobileId === row.sourceMobileId);
  if (sourceMatch) return compareExistingStore(row, sourceMatch, category, 'source');

  const slugMatch = stores.find((store) => store.slug === row.sourceMobileId);
  if (slugMatch) return compareExistingStore(row, slugMatch, category, 'slug');

  const possibleDuplicate = findKnownPossibleDuplicate(row, stores);
  if (possibleDuplicate) {
    return rowResult(
      row,
      'conflict',
      `Kemungkinan duplikat dengan toko "${possibleDuplicate.name}" (slug ${possibleDuplicate.slug}); perlu pemeriksaan manual.`,
      category?.id,
    );
  }

  const nameMatch = stores.find((store) => normalize(store.name) === normalize(row.name!));
  if (nameMatch) {
    return rowResult(
      row,
      'conflict',
      `Nama toko sudah digunakan oleh "${nameMatch.name}" (slug ${nameMatch.slug}); perlu pemeriksaan manual.`,
      category?.id,
    );
  }

  if (!category) {
    return rowResult(
      row,
      'conflict',
      `Kategori "${row.category}" belum memiliki pasangan kategori Backend.`,
    );
  }

  return rowResult(row, 'create', undefined, category.id);
}

async function loadSyncContext() {
  const [stores, categories] = await Promise.all([
    prisma.store.findMany({ select: syncStoreSelect }),
    prisma.category.findMany({ select: { id: true, name: true } }),
  ]);
  return { stores, categories };
}

function summarize(results: SyncResult[]) {
  return results.reduce(
    (summary, result) => {
      summary[result.status] += 1;
      return summary;
    },
    { create: 0, already_present: 0, conflict: 0, invalid: 0 },
  );
}

function readRequest(body: unknown, res: Response): MobileStoreSyncRow[] | null {
  const parsed = parseMobileStoreSyncRequest(body);
  if (parsed.errors.length > 0) {
    res.status(400).json({ error: parsed.errors[0], errors: parsed.errors });
    return null;
  }
  return parsed.rows;
}

// POST /api/stores/mobile-sync/dry-run
export async function dryRunMobileStoreSync(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const rows = readRequest(req.body, res);
    if (!rows) return;

    const { stores, categories } = await loadSyncContext();
    const seenSourceIds = new Set<string>();
    const results: SyncResult[] = [];

    for (const row of rows) {
      if (row.sourceMobileId && seenSourceIds.has(row.sourceMobileId)) {
        results.push(rowResult(row, 'conflict', 'sourceMobileId dikirim lebih dari sekali dalam satu permintaan.'));
        continue;
      }
      if (row.sourceMobileId) seenSourceIds.add(row.sourceMobileId);

      const result = evaluateRow(row, stores, categories);
      results.push(result);
      if (result.status === 'create' && row.sourceMobileId && row.name && result.categoryId !== undefined) {
        stores.push({
          id: -row.index - 1,
          slug: row.sourceMobileId,
          sourceMobileId: row.sourceMobileId,
          name: row.name,
          categoryId: result.categoryId,
          category: categories.find((category) => category.id === result.categoryId)!,
        });
      }
    }

    return res.json({ results, summary: summarize(results) });
  } catch (error) {
    next(error);
  }
}

// POST /api/stores/mobile-sync/import
export async function importMobileStores(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const rows = readRequest(req.body, res);
    if (!rows) return;

    let { stores, categories } = await loadSyncContext();
    const seenSourceIds = new Set<string>();
    const results: SyncResult[] = [];

    for (const row of rows) {
      if (row.sourceMobileId && seenSourceIds.has(row.sourceMobileId)) {
        results.push(rowResult(row, 'conflict', 'sourceMobileId dikirim lebih dari sekali dalam satu permintaan.'));
        continue;
      }
      if (row.sourceMobileId) seenSourceIds.add(row.sourceMobileId);

      const result = evaluateRow(row, stores, categories);
      if (result.status !== 'create' || !row.sourceMobileId || !row.name || result.categoryId === undefined) {
        results.push(result);
        continue;
      }

      try {
        const store = await prisma.store.create({
          data: {
            slug: row.sourceMobileId,
            sourceMobileId: row.sourceMobileId,
            name: row.name,
            categoryId: result.categoryId,
            status: 'menunggu_verifikasi',
            openTime: null,
            closeTime: null,
          },
          select: syncStoreSelect,
        });
        stores.push(store);
        results.push(rowResult(row, 'create', 'Toko baru berhasil ditambahkan.', result.categoryId, true));
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          ({ stores, categories } = await loadSyncContext());
          const current = evaluateRow(row, stores, categories);
          results.push(current.status === 'already_present'
            ? current
            : rowResult(row, 'conflict', `Terjadi benturan data unik. ${current.reason ?? 'Data perlu diperiksa.'}`, result.categoryId));
          continue;
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2003'
        ) {
          results.push(rowResult(
            row,
            'conflict',
            'Kategori tidak tersedia lagi saat proses import; data toko tidak ditambahkan.',
            result.categoryId,
          ));
          continue;
        }
        throw error;
      }
    }

    return res.json({ results, summary: summarize(results) });
  } catch (error) {
    next(error);
  }
}
