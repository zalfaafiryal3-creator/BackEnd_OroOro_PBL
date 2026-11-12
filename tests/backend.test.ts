import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { after, before, describe, it } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { Request, Response, NextFunction } from 'express';
import { hash } from 'bcryptjs';
import { Prisma, type PrismaClient } from '@prisma/client';
import { sign } from 'jsonwebtoken';
import { errorHandler } from '../src/middleware/errorHandler';

const originalEnvironment = {
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  NODE_ENV: process.env.NODE_ENV,
};

let testDirectory: string | undefined;
let prisma: PrismaClient | undefined;
let server: Server | undefined;
let baseUrl = '';
let adminId = 0;
let sellerId = 0;
let otherSellerId = 0;
let categoryId = 0;
let adminToken = '';
let sellerToken = '';
let registeredSellerToken = '';

function restoreEnvironment(): void {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function jsonRequest(
  path: string,
  body: unknown,
  token?: string,
  method = 'POST',
): Promise<globalThis.Response> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: JSON.stringify(body),
  });
}

function apiRequest(path: string, token?: string): Promise<globalThis.Response> {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${baseUrl}${path}`, { headers });
}

async function assertErrorResponse(response: globalThis.Response, status: number): Promise<void> {
  assert.equal(response.status, status);
  const body = await response.json() as { error?: unknown; errors?: unknown };
  assert.equal(typeof body.error, 'string');
  if (body.errors !== undefined) assert.ok(Array.isArray(body.errors));
}

describe('Pengujian backend Pasar Oro-Oro Dowo', () => {
  before(async () => {
    testDirectory = await mkdtemp(join(process.cwd(), 'prisma', '.pbl-test-'));
    process.env.DATABASE_URL = `file:./${basename(testDirectory)}/test.db`;
    process.env.JWT_SECRET = 'test-secret-not-for-production';
    process.env.CORS_ORIGIN = 'http://frontend.test';
    process.env.NODE_ENV = 'test';

    execFileSync(
      process.execPath,
      [
        join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js'),
        'db',
        'push',
        '--schema',
        'prisma/schema.prisma',
        '--skip-generate',
      ],
      { cwd: process.cwd(), env: process.env, stdio: 'ignore' },
    );

    const [{ app }, prismaModule] = await Promise.all([
      import('../src/app'),
      import('../src/lib/prisma'),
    ]);
    const database = prismaModule.prisma;
    prisma = database;

    const adminPasswordHash = await hash('AdminTest123!', 10);
    const sellerPasswordHash = await hash('SellerTest123!', 10);
    const admin = await database.user.create({
      data: {
        name: 'Admin Uji',
        email: 'admin@example.test',
        passwordHash: adminPasswordHash,
        role: 'admin',
      },
    });
    const seller = await database.user.create({
      data: {
        name: 'Seller Uji',
        email: 'seller@example.test',
        passwordHash: sellerPasswordHash,
        role: 'seller',
      },
    });
    const otherSeller = await database.user.create({
      data: {
        name: 'Seller Lain',
        email: 'seller-lain@example.test',
        passwordHash: sellerPasswordHash,
        role: 'seller',
      },
    });
    const category = await database.category.create({ data: { name: 'Kategori Awal' } });

    adminId = admin.id;
    sellerId = seller.id;
    otherSellerId = otherSeller.id;
    categoryId = category.id;

    const testServer = app.listen(0, '127.0.0.1');
    server = testServer;
    await once(testServer, 'listening');
    const address = testServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('Alamat server tes tidak tersedia.');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    try {
      if (server?.listening) {
        const closed = new Promise<void>((resolve, reject) => {
          server?.close((error) => error ? reject(error) : resolve());
        });
        server.closeAllConnections();
        await closed;
      }
      await prisma?.$disconnect();
    } finally {
      restoreEnvironment();
      if (testDirectory) await rm(testDirectory, { recursive: true, force: true });
    }
  });

  it('mempertahankan header keamanan dan CORS allowlist', async () => {
    const response = await fetch(`${baseUrl}/`, {
      headers: { Origin: 'http://frontend.test' },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://frontend.test');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  });

  it('memvalidasi register dan selalu memberi role seller', async () => {
    await assertErrorResponse(
      await jsonRequest('/api/auth/register', {
        name: 'A',
        email: 'bukan-email',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      }),
      400,
    );

    await assertErrorResponse(
      await jsonRequest('/api/auth/register', {
        name: 'Seller Tanpa Konfirmasi',
        email: 'tanpa-konfirmasi@example.test',
        password: 'Password123!',
      }),
      400,
    );

    const response = await jsonRequest('/api/auth/register', {
      name: 'Pendaftar Uji',
      email: 'pendaftar@example.test',
      password: 'Password123!',
      confirmPassword: 'Password123!',
      role: 'admin',
    });
    assert.equal(response.status, 201);
    const body = await response.json() as { user: { role: string }; token: string };
    assert.equal(body.user.role, 'seller');
    registeredSellerToken = body.token;
  });

  it('memvalidasi login dan menjaga login admin/seller', async () => {
    await assertErrorResponse(
      await jsonRequest('/api/auth/login', { email: 'bukan-email', password: 'Password123!' }),
      400,
    );
    await assertErrorResponse(
      await jsonRequest('/api/auth/login', { email: 'admin@example.test', password: 'Salah123!' }),
      401,
    );

    const adminResponse = await jsonRequest('/api/auth/login', {
      email: 'admin@example.test',
      password: 'AdminTest123!',
    });
    assert.equal(adminResponse.status, 200);
    const adminBody = await adminResponse.json() as { user: { role: string }; token: string };
    assert.equal(adminBody.user.role, 'admin');
    adminToken = adminBody.token;

    const sellerResponse = await jsonRequest('/api/auth/login', {
      email: 'seller@example.test',
      password: 'SellerTest123!',
    });
    assert.equal(sellerResponse.status, 200);
    const sellerBody = await sellerResponse.json() as { user: { role: string }; token: string };
    assert.equal(sellerBody.user.role, 'seller');
    sellerToken = sellerBody.token;
  });

  it('menguji autentikasi, role, dan token lama HS256', async () => {
    await assertErrorResponse(await apiRequest('/api/auth/admin-check'), 401);
    assert.equal((await apiRequest('/api/auth/admin-check', adminToken)).status, 200);
    await assertErrorResponse(await apiRequest('/api/auth/admin-check', sellerToken), 403);
    await assertErrorResponse(
      await apiRequest('/api/auth/admin-check', registeredSellerToken),
      403,
    );

    const forgedRoleToken = sign(
      { id: sellerId, role: 'admin' },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' },
    );
    await assertErrorResponse(
      await apiRequest('/api/auth/admin-check', forgedRoleToken),
      401,
    );

    const legacyToken = sign(
      { id: adminId, role: 'admin' },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' },
    );
    assert.equal((await apiRequest('/api/auth/admin-check', legacyToken)).status, 200);
  });

  it('membatasi kategori untuk admin dan memetakan kesalahan database', async () => {
    await assertErrorResponse(
      await jsonRequest('/api/categories', { name: 'Kategori Seller' }, sellerToken),
      403,
    );
    await assertErrorResponse(
      await jsonRequest('/api/categories', { name: 'A' }, adminToken),
      400,
    );

    const response = await jsonRequest('/api/categories', { name: 'Kategori Uji' }, adminToken);
    assert.equal(response.status, 201);
    const category = await response.json() as { id: number };

    await assertErrorResponse(
      await jsonRequest('/api/categories', { name: 'Kategori Uji' }, adminToken),
      409,
    );
    await assertErrorResponse(
      await jsonRequest('/api/categories/1e2', { name: 'Nama Uji' }, adminToken, 'PUT'),
      400,
    );
    await assertErrorResponse(
      await jsonRequest('/api/categories/2147483647', { name: 'Nama Uji' }, adminToken, 'PUT'),
      404,
    );
    assert.ok(category.id > 0);
  });

  it('memvalidasi toko/produk dan membatasi seller pada toko miliknya', async () => {
    await assertErrorResponse(
      await jsonRequest('/api/stores', {
        name: 'Toko Harga Salah',
        categoryId,
        products: [{ name: 'Menu', price: '7.5' }],
      }, sellerToken),
      400,
    );
    await assertErrorResponse(
      await jsonRequest('/api/stores', {
        name: 'Toko Harga Hilang',
        categoryId,
        products: [{ name: 'Menu' }],
      }, sellerToken),
      400,
    );

    const ownStoreResponse = await jsonRequest('/api/stores', {
      name: 'Toko Seller Uji',
      categoryId,
      sellerId: otherSellerId,
      status: 'buka',
      products: [{ name: 'Menu Uji', price: 'Rp 7.000' }],
    }, sellerToken);
    assert.equal(ownStoreResponse.status, 201);
    const ownStore = await ownStoreResponse.json() as {
      id: number;
      sellerId: number;
      status: string;
      openTime: string | null;
      closeTime: string | null;
      products: Array<{ price: number }>;
    };
    assert.equal(ownStore.sellerId, sellerId);
    assert.equal(ownStore.status, 'menunggu_verifikasi');
    assert.equal(ownStore.products[0].price, 7000);
    assert.equal(ownStore.openTime, '06:00');
    assert.equal(ownStore.closeTime, '17:00');
    const sellerManagedStores = await apiRequest('/api/stores/manage', sellerToken);
    assert.equal(sellerManagedStores.status, 200);
    const sellerStoreList = await sellerManagedStores.json() as Array<{ sellerId: number | null }>;
    assert.ok(sellerStoreList.length > 0);
    assert.ok(sellerStoreList.every((store) => store.sellerId === sellerId));

    await assertErrorResponse(
      await jsonRequest(`/api/stores/${ownStore.id}`, { status: 'tutup' }, sellerToken, 'PUT'),
      403,
    );
    const ownManagementDetail = await apiRequest(`/api/stores/manage/${ownStore.id}`, sellerToken);
    assert.equal(ownManagementDetail.status, 200);
    const ownDetail = await ownManagementDetail.json() as {
      openTime: string | null;
      closeTime: string | null;
      operatingHours: string | null;
    };
    assert.equal(ownDetail.operatingHours, '06:00 - 17:00');

    await assertErrorResponse(
      await apiRequest(`/api/stores/manage/${ownStore.id}`),
      401,
    );
    await assertErrorResponse(
      await apiRequest('/api/stores/manage?status=aktif', sellerToken),
      400,
    );
    await assertErrorResponse(
      await apiRequest('/api/stores?q=nama&q=lain'),
      400,
    );

    const otherStoreResponse = await jsonRequest('/api/stores', {
      name: 'Toko Seller Lain',
      categoryId,
      sellerId: otherSellerId,
      status: 'buka',
    }, adminToken);
    assert.equal(otherStoreResponse.status, 201);
    const otherStore = await otherStoreResponse.json() as { id: number };

    await assertErrorResponse(
      await apiRequest(`/api/stores/manage/${otherStore.id}`, sellerToken),
      403,
    );
    assert.equal((await apiRequest(`/api/stores/manage/${otherStore.id}`, adminToken)).status, 200);
    await assertErrorResponse(
      await jsonRequest(`/api/stores/${otherStore.id}`, { name: 'Diubah Seller' }, sellerToken, 'PUT'),
      403,
    );
    await assertErrorResponse(
      await jsonRequest(`/api/stores/${otherStore.id}`, {}, sellerToken, 'DELETE'),
      403,
    );

    const changedWithoutHoursResponse = await jsonRequest(
      `/api/stores/${ownStore.id}`,
      { description: 'Deskripsi diperbarui tanpa mengubah jam.' },
      sellerToken,
      'PUT',
    );
    assert.equal(changedWithoutHoursResponse.status, 200);
    const unchangedHours = await changedWithoutHoursResponse.json() as {
      openTime: string | null;
      closeTime: string | null;
      operatingHours: string | null;
    };
    assert.equal(unchangedHours.openTime, '06:00');
    assert.equal(unchangedHours.closeTime, '17:00');
    assert.equal(unchangedHours.operatingHours, '06:00 - 17:00');

    const clearedHoursResponse = await jsonRequest(
      `/api/stores/${ownStore.id}`,
      { openTime: null, closeTime: null },
      sellerToken,
      'PUT',
    );
    assert.equal(clearedHoursResponse.status, 200);
    const clearedHours = await clearedHoursResponse.json() as {
      openTime: string | null;
      closeTime: string | null;
      operatingHours: string | null;
    };
    assert.equal(clearedHours.openTime, null);
    assert.equal(clearedHours.closeTime, null);
    assert.equal(clearedHours.operatingHours, null);
  });

  it('menerima jam null berpasangan dan menolak jam tidak valid atau tidak berpasangan', async () => {
    await assertErrorResponse(
      await jsonRequest('/api/stores', {
        name: 'Toko Jam Sebagian',
        categoryId,
        openTime: null,
      }, adminToken),
      400,
    );
    await assertErrorResponse(
      await jsonRequest('/api/stores', {
        name: 'Toko Jam Tidak Valid',
        categoryId,
        openTime: '25:00',
        closeTime: '17:00',
      }, adminToken),
      400,
    );
    await assertErrorResponse(
      await jsonRequest('/api/stores', {
        name: 'Toko Jam Campur',
        categoryId,
        openTime: null,
        closeTime: '17:00',
      }, adminToken),
      400,
    );

    const response = await jsonRequest('/api/stores', {
      name: 'Toko Jam Belum Diketahui',
      categoryId,
      openTime: null,
      closeTime: null,
    }, adminToken);
    assert.equal(response.status, 201);
    const store = await response.json() as {
      openTime: string | null;
      closeTime: string | null;
      operatingHours: string | null;
    };
    assert.equal(store.openTime, null);
    assert.equal(store.closeTime, null);
    assert.equal(store.operatingHours, null);
  });

  it('mengamankan dry-run dan mengimpor daftar Mobile secara idempoten', async () => {
    const category = await prisma!.category.create({ data: { name: 'Makanan' } });
    const exactMatches = Array.from({ length: 8 }, (_, index) => ({
      sourceMobileId: `mobile-store-${index + 1}`,
      name: `Toko Mobile ${index + 1}`,
      category: 'Makanan',
    }));

    for (const store of exactMatches) {
      await prisma!.store.create({
        data: {
          slug: store.sourceMobileId,
          name: store.name,
          categoryId: category.id,
          status: 'buka',
        },
      });
    }

    await prisma!.store.create({
      data: {
        slug: 'fresgreen-organic',
        name: 'FresGreen Organic',
        categoryId: category.id,
        status: 'buka',
      },
    });
    await prisma!.store.create({
      data: {
        slug: 'slug-conflict',
        name: 'Nama di Backend',
        categoryId: category.id,
        status: 'buka',
      },
    });
    await prisma!.store.create({
      data: {
        slug: 'pemilik-nama',
        name: 'Nama Duplikat',
        categoryId: category.id,
        status: 'buka',
      },
    });
    const protectedStore = await prisma!.store.create({
      data: {
        slug: 'lumpur-kentang-27',
        name: 'Dicuri',
        ownerName: 'Tidak disentuh',
        zone: 'Zona lama',
        categoryId: category.id,
        openTime: '07:00',
        closeTime: '16:00',
        status: 'buka',
      },
    });

    const stores = [
      ...exactMatches,
      { sourceMobileId: 'lumpur-kentang-27', name: 'Lumpur Kentang 27', category: 'Makanan' },
      { sourceMobileId: 'fresh-green', name: 'Fresh Green', category: 'Makanan' },
      { sourceMobileId: 'slug-conflict', name: 'Nama Berbeda', category: 'Makanan' },
      { sourceMobileId: 'nama-duplikat-baru', name: 'Nama Duplikat', category: 'Makanan' },
      { sourceMobileId: 'kategori-belum-dikenal', name: 'Toko Kategori Baru', category: 'Kategori Mobile Baru' },
      { sourceMobileId: '', name: '', category: 'Makanan' },
      {
        id: 'toko-mobile-baru-1',
        name: 'Toko Mobile Baru 1',
        category: 'Makanan',
        displayCategory: '',
        badge: '',
        rating: '4.8',
        products: '3 Produk',
        image: 'gambar-lokal.png',
      },
      ...Array.from({ length: 34 }, (_, index) => ({
        sourceMobileId: `toko-mobile-baru-${index + 2}`,
        name: `Toko Mobile Baru ${index + 2}`,
        category: 'Makanan',
      })),
    ];
    assert.equal(stores.length, 49);

    await assertErrorResponse(
      await jsonRequest('/api/stores/mobile-sync/dry-run', { stores }, undefined),
      401,
    );
    await assertErrorResponse(
      await jsonRequest('/api/stores/mobile-sync/import', { stores }, undefined),
      401,
    );
    await assertErrorResponse(
      await jsonRequest('/api/stores/mobile-sync/import', { stores }, sellerToken),
      403,
    );
    await assertErrorResponse(
      await jsonRequest('/api/stores/mobile-sync/dry-run', { stores }, sellerToken),
      403,
    );
    const duplicateSourceResponse = await jsonRequest(
      '/api/stores/mobile-sync/dry-run',
      {
        stores: [
          { sourceMobileId: 'sumber-ganda', name: 'Toko Pertama', category: 'Makanan' },
          { sourceMobileId: 'sumber-ganda', name: 'Toko Kedua', category: 'Makanan' },
        ],
      },
      adminToken,
    );
    assert.equal(duplicateSourceResponse.status, 200);
    const duplicateSourceResult = await duplicateSourceResponse.json() as {
      results: Array<{ status: string }>;
    };
    assert.deepEqual(duplicateSourceResult.results.map((result) => result.status), ['create', 'conflict']);

    const beforeDryRun = await prisma!.store.findMany({
      include: { products: true },
      orderBy: { id: 'asc' },
    });
    const dryRunResponse = await jsonRequest(
      '/api/stores/mobile-sync/dry-run',
      { stores },
      adminToken,
    );
    assert.equal(dryRunResponse.status, 200);
    const dryRun = await dryRunResponse.json() as {
      results: Array<{ sourceMobileId: string | null; status: string; reason?: string }>;
      summary: { create: number; already_present: number; conflict: number; invalid: number };
    };
    assert.equal(dryRun.results.length, 49);
    assert.deepEqual(dryRun.summary, {
      create: 35,
      already_present: 8,
      conflict: 5,
      invalid: 1,
    });
    assert.equal(
      dryRun.results.find((result) => result.sourceMobileId === 'lumpur-kentang-27')?.status,
      'conflict',
    );
    assert.equal(
      dryRun.results.find((result) => result.sourceMobileId === 'fresh-green')?.status,
      'conflict',
    );
    assert.match(
      dryRun.results.find((result) => result.sourceMobileId === 'fresh-green')?.reason ?? '',
      /FresGreen Organic/,
    );
    assert.equal(
      dryRun.results.find((result) => result.sourceMobileId === 'kategori-belum-dikenal')?.status,
      'conflict',
    );
    assert.equal(
      dryRun.results.find((result) => result.sourceMobileId === 'slug-conflict')?.status,
      'conflict',
    );
    assert.equal(dryRun.results.find((result) => result.status === 'invalid')?.status, 'invalid');
    const afterDryRun = await prisma!.store.findMany({
      include: { products: true },
      orderBy: { id: 'asc' },
    });
    assert.deepEqual(afterDryRun, beforeDryRun);

    const importResponse = await jsonRequest(
      '/api/stores/mobile-sync/import',
      { stores },
      adminToken,
    );
    assert.equal(importResponse.status, 200);
    const imported = await importResponse.json() as {
      results: Array<{ status: string; created?: boolean }>;
      summary: { create: number; already_present: number; conflict: number; invalid: number };
    };
    assert.equal(imported.results.length, 49);
    assert.deepEqual(imported.summary, {
      create: 35,
      already_present: 8,
      conflict: 5,
      invalid: 1,
    });
    assert.equal(imported.results.filter((result) => result.created === true).length, 35);

    const importedStores = await prisma!.store.findMany({
      where: { sourceMobileId: { startsWith: 'toko-mobile-baru-' } },
      include: { products: true },
    });
    assert.equal(importedStores.length, 35);
    for (const store of importedStores) {
      assert.equal(store.status, 'menunggu_verifikasi');
      assert.equal(store.openTime, null);
      assert.equal(store.closeTime, null);
      assert.equal(store.ownerName, '');
      assert.equal(store.zone, '');
      assert.equal(store.sellerId, null);
      assert.equal(store.products.length, 0);
    }

    const countAfterImport = await prisma!.store.count();
    const unchangedProtectedStore = await prisma!.store.findUnique({
      where: { id: protectedStore.id },
    });
    assert.equal(unchangedProtectedStore?.name, 'Dicuri');
    assert.equal(unchangedProtectedStore?.ownerName, 'Tidak disentuh');
    assert.equal(unchangedProtectedStore?.zone, 'Zona lama');
    assert.equal(unchangedProtectedStore?.openTime, '07:00');
    assert.equal(unchangedProtectedStore?.closeTime, '16:00');
    const retryResponse = await jsonRequest(
      '/api/stores/mobile-sync/import',
      { stores },
      adminToken,
    );
    assert.equal(retryResponse.status, 200);
    const retry = await retryResponse.json() as {
      results: Array<{ status: string }>;
      summary: { create: number; already_present: number; conflict: number; invalid: number };
    };
    assert.equal(retry.results.length, 49);
    assert.deepEqual(retry.summary, {
      create: 0,
      already_present: 43,
      conflict: 5,
      invalid: 1,
    });
    assert.equal(await prisma!.store.count(), countAfterImport);

    const adminManagedStores = await apiRequest('/api/stores/manage', adminToken);
    assert.equal(adminManagedStores.status, 200);
    const adminList = await adminManagedStores.json() as Array<{ slug: string }>;
    assert.ok(adminList.some((store) => store.slug === 'toko-mobile-baru-1'));
    const sellerStoreListResponse = await apiRequest('/api/stores/manage', sellerToken);
    assert.equal(sellerStoreListResponse.status, 200);
    const postImportSellerList = await sellerStoreListResponse.json() as Array<{ sellerId: number | null }>;
    assert.ok(postImportSellerList.every((store) => store.sellerId === sellerId));
  });

  it('menolak rating tidak bulat dan menerima review valid', async () => {
    await assertErrorResponse(
      await jsonRequest('/api/store-reviews', {
        text: 'Review uji',
        rating: 4.5,
      }),
      400,
    );
    await assertErrorResponse(
      await jsonRequest('/api/store-reviews', {
        text: 'Review tanpa rating',
      }),
      400,
    );

    const response = await jsonRequest('/api/store-reviews', {
      name: 'Pengunjung Uji',
      date: 'Baru saja',
      text: 'Review valid.',
      rating: 5,
    });
    assert.equal(response.status, 201);
    assert.ok(Array.isArray(await response.json()));
  });

  it('menghitung ulasan toko per toko dan menerapkan filter sebelum pagination', async () => {
    const category = await prisma!.category.create({
      data: { name: 'Kategori Review Toko' },
    });
    const store = await prisma!.store.create({
      data: {
        slug: 'review-store-uji',
        name: 'Toko Review Uji',
        categoryId: category.id,
        status: 'buka',
      },
    });
    const otherStore = await prisma!.store.create({
      data: {
        slug: 'review-store-lain',
        name: 'Toko Review Lain',
        categoryId: category.id,
        status: 'buka',
      },
    });
    const createStoreReview = (
      storeId: number,
      rating: number,
      name: string,
      options: { isPublic?: boolean; isDeleted?: boolean; photos?: string[] } = {},
    ) => prisma!.review.create({
      data: {
        type: 'store',
        storeId,
        name,
        date: 'Hari ini',
        text: `Review ${name}`,
        rating,
        isPublic: options.isPublic ?? true,
        isDeleted: options.isDeleted ?? false,
        photos: {
          create: (options.photos ?? []).map((url) => ({ url })),
        },
      },
    });

    await Promise.all([
      createStoreReview(store.id, 5, 'Bintang Lima', {
        photos: ['foto-1.jpg', 'foto-2.jpg', 'foto-3.jpg'],
      }),
      createStoreReview(store.id, 4, 'Bintang Empat'),
      createStoreReview(store.id, 3, 'Bintang Tiga'),
      createStoreReview(store.id, 2, 'Bintang Dua'),
      createStoreReview(store.id, 1, 'Review Dihapus', { isDeleted: true }),
      createStoreReview(store.id, 5, 'Review Privat', { isPublic: false }),
      createStoreReview(store.id, 0, 'Rating Tidak Valid'),
      createStoreReview(otherStore.id, 5, 'Review Toko Lain'),
    ]);

    const statisticsResponse = await apiRequest(
      `/api/stores/${store.slug}/reviews/statistics`,
    );
    assert.equal(statisticsResponse.status, 200);
    const statistics = await statisticsResponse.json() as {
      data: {
        total_reviews: number;
        with_photo: number;
        star_5: number;
        star_4: number;
        star_1_3: number;
      };
    };
    assert.deepEqual(statistics.data, {
      total_reviews: 4,
      with_photo: 1,
      star_5: 1,
      star_4: 1,
      star_1_3: 2,
    });

    const allResponse = await apiRequest(
      `/api/stores/${store.id}/reviews?filter=all&page=1&limit=2`,
    );
    assert.equal(allResponse.status, 200);
    const allReviews = await allResponse.json() as {
      data: Array<{ rating: number }>;
      total_count: number;
      current_page_count: number;
    };
    assert.equal(allReviews.total_count, 4);
    assert.equal(allReviews.current_page_count, 2);

    const photoResponse = await apiRequest(
      `/api/stores/${store.slug}/reviews?filter=photo`,
    );
    const photoReviews = await photoResponse.json() as {
      data: Array<{ rating: number; photos: Array<{ url: string }> }>;
      total_count: number;
    };
    assert.equal(photoReviews.total_count, 1);
    assert.equal(photoReviews.data[0].rating, 5);
    assert.equal(photoReviews.data[0].photos.length, 3);

    for (const [filter, expectedRatings] of [
      ['5', [5]],
      ['4', [4]],
      ['1-3', [3, 2]],
    ] as const) {
      const response = await apiRequest(
        `/api/stores/${store.slug}/reviews?filter=${filter}`,
      );
      const result = await response.json() as {
        data: Array<{ rating: number }>;
        total_count: number;
      };
      assert.equal(result.total_count, expectedRatings.length);
      assert.deepEqual(result.data.map((review) => review.rating).sort(), [...expectedRatings].sort());
    }

    const searchedResponse = await apiRequest(
      `/api/stores/${store.slug}/reviews?filter=1-3&search=Bintang%20Dua`,
    );
    const searched = await searchedResponse.json() as {
      data: Array<{ rating: number }>;
      total_count: number;
    };
    assert.equal(searched.total_count, 1);
    assert.deepEqual(searched.data.map((review) => review.rating), [2]);

    const storeResponse = await apiRequest(`/api/stores/${store.slug}`);
    const storeDto = await storeResponse.json() as { reviewCount: number };
    assert.equal(storeDto.reviewCount, 4);

    const submittedResponse = await jsonRequest(
      `/api/stores/${store.slug}/reviews`,
      {
        name: 'Pembeli Baru',
        date: 'Baru saja',
        text: 'Pengalaman baik.',
        rating: 5,
      },
    );
    assert.equal(submittedResponse.status, 201);
    const updatedStatisticsResponse = await apiRequest(
      `/api/stores/${store.slug}/reviews/statistics`,
    );
    const updatedStatistics = await updatedStatisticsResponse.json() as {
      data: { total_reviews: number; star_5: number };
    };
    assert.equal(updatedStatistics.data.total_reviews, 5);
    assert.equal(updatedStatistics.data.star_5, 2);
  });

  it('membatasi halaman ulasan pasar menjadi sepuluh dan menghitung total database', async () => {
    const ratings = [5, 4, 3, 2, 1, 5, 4, 3, 2, 1, 5];
    await Promise.all(
      ratings.map((rating, index) =>
        prisma!.review.create({
          data: {
            type: 'market',
            name: `Pengunjung Pasar ${index + 1}`,
            date: 'Hari ini',
            text: `Ulasan pasar ${index + 1}`,
            rating,
            overallRating: rating,
            photos: index === 0
              ? { create: [{ url: 'foto-pasar.jpg' }] }
              : undefined,
          },
        }),
      ),
    );
    await prisma!.review.create({
      data: {
        type: 'market',
        name: 'Ulasan privat',
        text: 'Tidak ditampilkan',
        rating: 5,
        overallRating: 5,
        isPublic: false,
      },
    });
    await prisma!.review.create({
      data: {
        type: 'market',
        name: 'Ulasan terhapus',
        text: 'Tidak ditampilkan',
        rating: 5,
        overallRating: 5,
        isDeleted: true,
      },
    });

    const firstPageResponse = await apiRequest(
      '/api/market-reviews/page?page=1&limit=100',
    );
    assert.equal(firstPageResponse.status, 200);
    const firstPage = await firstPageResponse.json() as {
      data: Array<{ id: number }>;
      total_count: number;
      current_page_count: number;
      page: number;
      limit: number;
    };
    assert.equal(firstPage.total_count, 11);
    assert.equal(firstPage.current_page_count, 10);
    assert.equal(firstPage.page, 1);
    assert.equal(firstPage.limit, 10);

    const secondPageResponse = await apiRequest(
      '/api/market-reviews/page?page=2&limit=10',
    );
    assert.equal(secondPageResponse.status, 200);
    const secondPage = await secondPageResponse.json() as {
      data: Array<{ id: number }>;
      total_count: number;
      current_page_count: number;
      page: number;
      limit: number;
    };
    assert.equal(secondPage.total_count, 11);
    assert.equal(secondPage.current_page_count, 1);
    assert.equal(secondPage.page, 2);
    assert.equal(secondPage.limit, 10);
    assert.equal(
      new Set([...firstPage.data, ...secondPage.data].map((review) => review.id)).size,
      11,
    );

    const statisticsResponse = await apiRequest(
      '/api/market-reviews/statistics',
    );
    assert.equal(statisticsResponse.status, 200);
    const statistics = await statisticsResponse.json() as {
      data: {
        total_reviews: number;
        with_photo: number;
        star_5: number;
        star_4: number;
        star_1_3: number;
      };
    };
    assert.deepEqual(statistics.data, {
      total_reviews: 11,
      with_photo: 1,
      star_5: 3,
      star_4: 2,
      star_1_3: 6,
    });

    const newReviewResponse = await jsonRequest('/api/market-reviews', {
      name: 'Ulasan pasar baru',
      date: 'Hari ini',
      text: 'Tersimpan sebagai ulasan pasar.',
      rating: 5,
    });
    assert.equal(newReviewResponse.status, 201);
    const savedReview = await prisma!.review.findFirst({
      where: { type: 'market', name: 'Ulasan pasar baru' },
    });
    assert.ok(savedReview);
  });

  it('menyediakan rekomendasi database dan bookmark yang terikat pengguna', async () => {
    const targetNames = [
      'Bakso Goreng Bagoplek',
      'Lumpur Kentang 27',
      'Sego Liwet Bakar Kemangi',
      'Klepon-ku',
    ];
    const stores = [];
    const products = [];

    for (const [index, name] of targetNames.entries()) {
      const store = await prisma!.store.create({
        data: {
          slug: `rekomendasi-${index + 1}`,
          name,
          categoryId,
          zone: `Blok ${String.fromCharCode(65 + index)}`,
          status: 'buka',
          bannerUrl: `https://example.test/store-${index + 1}.jpg`,
        },
      });
      stores.push(store);
      products.push(await prisma!.product.create({
        data: {
          storeId: store.id,
          name: `Produk ${index + 1}`,
          description: `Deskripsi produk ${index + 1}`,
          price: [2_147_483_647, 10000, 0, 8000][index],
          photoUrl: `https://example.test/product-${index + 1}.jpg`,
        },
      }));
    }

    const createStoreReview = (storeId: number, rating: number) =>
      prisma!.review.create({
        data: {
          type: 'store',
          storeId,
          name: 'Pengunjung Uji',
          date: 'Hari ini',
          text: 'Ulasan untuk rekomendasi.',
          rating,
        },
      });
    await Promise.all([
      createStoreReview(stores[0].id, 5),
      createStoreReview(stores[1].id, 4),
      createStoreReview(stores[1].id, 4),
      createStoreReview(stores[1].id, 5),
      createStoreReview(stores[2].id, 4),
      createStoreReview(stores[2].id, 4),
    ]);

    const recommendedStoresResponse = await apiRequest(
      '/api/recommendations/stores',
    );
    assert.equal(recommendedStoresResponse.status, 200);
    const recommendedStores = await recommendedStoresResponse.json() as {
      success: boolean;
      data: Array<{
        id: number;
        name: string;
        category: string;
        location: string;
        status: string;
        rating: number;
        reviewCount: number;
      }>;
    };
    assert.equal(recommendedStores.success, true);
    assert.deepEqual(
      recommendedStores.data.map((store) => store.name),
      targetNames,
    );
    assert.deepEqual(
      recommendedStores.data.map((store) => store.id),
      stores.map((store) => store.id),
    );
    assert.equal(recommendedStores.data[0].rating, 5);
    assert.equal(recommendedStores.data[0].reviewCount, 1);
    assert.equal(recommendedStores.data[1].reviewCount, 3);
    assert.deepEqual(recommendedStores.data.map((store) => store.status), [
      'buka',
      'buka',
      'buka',
      'buka',
    ]);

    const storeListResponse = await apiRequest('/api/stores');
    const storeList = await storeListResponse.json() as Array<{
      id: number;
      rating: number;
      reviewCount: number;
    }>;
    const catalogStore = storeList.find((store) => store.id === stores[0].id);
    assert.equal(catalogStore?.rating, 5);
    assert.equal(catalogStore?.reviewCount, 1);

    const recommendationsResponse = await apiRequest(
      '/api/recommendations/products',
    );
    assert.equal(recommendationsResponse.status, 200);
    const recommendations = await recommendationsResponse.json() as {
      success: boolean;
      data: {
        recommendations: Array<{
          id: number;
          storeId: number;
          name: string;
          photoUrl: string;
          price: number;
          rating: number | null;
          reviewCount: number;
          recommendationLabel: string;
        }>;
      };
    };
    assert.equal(recommendations.success, true);
    assert.deepEqual(
      recommendations.data.recommendations.map((item) => item.id),
      products.slice(0, 3).map((product) => product.id),
    );
    assert.deepEqual(
      recommendations.data.recommendations.map((item) => item.recommendationLabel),
      ['WAJIB COBA', 'PRODUK LOKAL FAVORIT', 'PILIHAN PENGUNJUNG'],
    );
    assert.equal(recommendations.data.recommendations[0].rating, null);
    assert.equal(recommendations.data.recommendations[0].reviewCount, 0);

    const expectedSortFirstProduct: Record<string, number> = {
      best_selling: products[1].id,
      highest_rating: products[0].id,
      newest: products[3].id,
      lowest_price: products[2].id,
      highest_price: products[0].id,
    };
    const publicCatalogProductIds = (await prisma!.product.findMany({
      where: { store: { status: { in: ['buka', 'tutup'] } } },
      select: { id: true },
    })).map((product) => product.id).sort((a, b) => a - b);
    for (const [sort, expectedId] of Object.entries(expectedSortFirstProduct)) {
      const response = await apiRequest(
        `/api/recommendations/featured-products?sort=${sort}`,
      );
      assert.equal(response.status, 200);
      const body = await response.json() as {
        success: boolean;
        data: {
          sort: string;
          products: Array<{
            id: number;
            storeId: number;
            salesCount: number | null;
            availabilityStatus: string;
          }>;
        };
      };
      assert.equal(body.success, true);
      assert.equal(body.data.sort, sort);
      assert.equal(body.data.products[0].id, expectedId);
      assert.ok(body.data.products.every((product) =>
        stores.some((store) => store.id === product.storeId),
      ));
      assert.deepEqual(
        body.data.products.map((product) => product.id).sort((a, b) => a - b),
        publicCatalogProductIds,
      );
      assert.equal(body.data.products[0].salesCount, null);
      assert.equal(body.data.products[0].availabilityStatus, 'catalog_listed');
    }
    const invalidSort = await apiRequest(
      '/api/recommendations/featured-products?sort=popular',
    );
    assert.equal(invalidSort.status, 400);
    assert.equal(
      (await invalidSort.json() as { success: boolean }).success,
      false,
    );

    const unauthenticatedBookmarks = await apiRequest('/api/bookmarks');
    assert.equal(unauthenticatedBookmarks.status, 401);
    assert.deepEqual(await unauthenticatedBookmarks.json(), {
      success: false,
      message: 'Silakan login terlebih dahulu.',
      data: null,
      error: 'Silakan login terlebih dahulu.',
    });
    const addBookmark = await jsonRequest(
      '/api/bookmarks',
      { productId: products[0].id },
      sellerToken,
    );
    assert.equal(addBookmark.status, 200);
    const firstBookmark = await addBookmark.json() as {
      data: { id: number; product: { id: number } };
    };
    assert.equal(firstBookmark.data.product.id, products[0].id);
    const duplicateBookmark = await jsonRequest(
      '/api/bookmarks',
      { productId: products[0].id },
      sellerToken,
    );
    assert.equal(duplicateBookmark.status, 200);
    const duplicateBody = await duplicateBookmark.json() as {
      data: { id: number };
    };
    assert.equal(duplicateBody.data.id, firstBookmark.data.id);

    const bookmarkList = await apiRequest('/api/bookmarks', sellerToken);
    const bookmarkBody = await bookmarkList.json() as {
      data: Array<{ product: { id: number } }>;
    };
    assert.equal(bookmarkBody.data.length, 1);
    assert.equal(bookmarkBody.data[0].product.id, products[0].id);
    const otherSellerTokenForBookmarks = sign(
      { id: otherSellerId, role: 'seller' },
      'test-secret-not-for-production',
      { algorithm: 'HS256' },
    );
    const otherUserBookmarks = await apiRequest(
      '/api/bookmarks',
      otherSellerTokenForBookmarks,
    );
    assert.equal(otherUserBookmarks.status, 200);
    assert.deepEqual(await otherUserBookmarks.json(), {
      success: true,
      message: 'Belum ada produk yang dibookmark.',
      data: [],
    });

    const status = await apiRequest(
      `/api/bookmarks/${products[0].id}/status`,
      sellerToken,
    );
    assert.equal(
      ((await status.json()) as { data: { isBookmarked: boolean } }).data.isBookmarked,
      true,
    );
    const otherUserDelete = await jsonRequest(
      `/api/bookmarks/${products[0].id}`,
      {},
      otherSellerTokenForBookmarks,
      'DELETE',
    );
    assert.equal(
      ((await otherUserDelete.json()) as { data: { removed: boolean } }).data.removed,
      false,
    );
    const removeBookmark = await jsonRequest(
      `/api/bookmarks/${products[0].id}`,
      {},
      sellerToken,
      'DELETE',
    );
    assert.equal(
      ((await removeBookmark.json()) as { data: { removed: boolean } }).data.removed,
      true,
    );

    await prisma!.store.update({
      where: { id: stores[3].id },
      data: { status: 'menunggu_verifikasi' },
    });
    const hiddenProductBookmark = await jsonRequest(
      '/api/bookmarks',
      { productId: products[3].id },
      sellerToken,
    );
    assert.equal(hiddenProductBookmark.status, 404);
    const hiddenProductStatus = await apiRequest(
      `/api/bookmarks/${products[3].id}/status`,
      sellerToken,
    );
    const hiddenProductStatusBody = await hiddenProductStatus.json() as {
      data: { isAvailable: boolean };
    };
    assert.equal(hiddenProductStatusBody.data.isAvailable, false);
    const incompleteStoresResponse = await apiRequest(
      '/api/recommendations/stores',
    );
    assert.equal(incompleteStoresResponse.status, 409);
    const incompleteStores = await incompleteStoresResponse.json() as {
      success: boolean;
      data: { missingStores: string[] };
    };
    assert.equal(incompleteStores.success, false);
    assert.deepEqual(incompleteStores.data.missingStores, ['Klepon-ku']);
  });

  it('menangani 400, 413, 404, dan error 500 tanpa detail internal', async () => {
    const malformedJson = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"email":',
    });
    await assertErrorResponse(malformedJson, 400);

    const oversizedJson = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(60 * 1024) }),
    });
    await assertErrorResponse(oversizedJson, 413);
    await assertErrorResponse(await apiRequest('/api/endpoint-tidak-ada'), 404);

    const originalConsoleError = console.error;
    const logLines: string[] = [];
    console.error = (line: string) => logLines.push(line);
    try {
      let statusCode = 0;
      let body: unknown;
      const response = {
        headersSent: false,
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(value: unknown) {
          body = value;
          return this;
        },
      } as unknown as Response;
      const request = {
        method: 'GET',
        path: '/password-secret-token',
        baseUrl: '',
      } as Request;
      const next: NextFunction = () => {};

      errorHandler(new Error('password=private token=private'), request, response, next);
      assert.equal(statusCode, 500);
      assert.deepEqual(body, {
        success: false,
        message: 'Terjadi kesalahan di server.',
        data: null,
        error: 'Terjadi kesalahan di server.',
      });
      assert.equal(logLines.length, 1);
      assert.ok(!logLines[0].includes('private'));

      let prismaStatusCode = 0;
      const prismaResponse = {
        headersSent: false,
        status(code: number) {
          prismaStatusCode = code;
          return this;
        },
        json() {
          return this;
        },
      } as unknown as Response;
      errorHandler(
        new Prisma.PrismaClientKnownRequestError('internal', {
          code: 'P2025',
          clientVersion: 'test',
        }),
        request,
        prismaResponse,
        next,
      );
      assert.equal(prismaStatusCode, 404);
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('mencatat request tanpa query, password, atau token', async () => {
    const originalConsoleLog = console.log;
    const logLines: string[] = [];
    const passwordMarker = 'password-marker-private';
    const tokenMarker = 'token-marker-private';
    console.log = (line: string) => logLines.push(line);
    try {
      const response = await fetch(
        `${baseUrl}/api/auth/login?token=${tokenMarker}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'invalid-email', password: passwordMarker }),
        },
      );
      await response.text();
      assert.equal(response.status, 400);
    } finally {
      console.log = originalConsoleLog;
    }

    assert.equal(logLines.length, 1);
    const entry = JSON.parse(logLines[0]) as {
      event: string;
      method: string;
      endpoint: string;
      statusCode: number;
      durationMs: number;
    };
    assert.equal(entry.event, 'http_request');
    assert.equal(entry.method, 'POST');
    assert.equal(entry.endpoint, '/api/auth/login');
    assert.equal(entry.statusCode, 400);
    assert.equal(typeof entry.durationMs, 'number');
    assert.ok(!logLines[0].includes(passwordMarker));
    assert.ok(!logLines[0].includes(tokenMarker));
  });
});
