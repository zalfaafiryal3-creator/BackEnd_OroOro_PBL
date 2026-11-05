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
      products: Array<{ price: number }>;
    };
    assert.equal(ownStore.sellerId, sellerId);
    assert.equal(ownStore.status, 'menunggu_verifikasi');
    assert.equal(ownStore.products[0].price, 7000);

    await assertErrorResponse(
      await jsonRequest(`/api/stores/${ownStore.id}`, { status: 'tutup' }, sellerToken, 'PUT'),
      403,
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
      await jsonRequest(`/api/stores/${otherStore.id}`, { name: 'Diubah Seller' }, sellerToken, 'PUT'),
      403,
    );
    await assertErrorResponse(
      await jsonRequest(`/api/stores/${otherStore.id}`, {}, sellerToken, 'DELETE'),
      403,
    );
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
