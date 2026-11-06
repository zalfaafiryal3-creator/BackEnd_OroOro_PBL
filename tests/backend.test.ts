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
      assert.deepEqual(body, { error: 'Terjadi kesalahan di server.' });
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
