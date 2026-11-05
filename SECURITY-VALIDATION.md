# Panduan Security, Validasi, Error, dan Logging

Dokumen ini mencatat perilaku backend yang tersedia dan cara menguji bagian security, form validation, error handling, dan logging. API tetap menggunakan format error `{ "error": "pesan", "errors": ["..."] }`; field `errors` bersifat opsional.

## 1. Security

### Autentikasi dan password

- Password disimpan sebagai hash bcrypt dengan cost 10, bukan sebagai teks biasa.
- JWT menggunakan algoritma HS256 dan kedaluwarsa setelah 7 hari. Middleware membatasi algoritma yang diterima, memeriksa claim `id` dan `role`, lalu mencocokkan pengguna serta role terkini di database.
- Token diterima dari cookie `token` atau header `Authorization: Bearer <token>`. Cookie menggunakan `HttpOnly`, `SameSite=Lax`, dan `Secure` ketika `NODE_ENV=production`.
- Respons login dan register juga mengirim token pada JSON untuk kompatibilitas klien API. Klien harus menjaga token dan tidak mencatatnya ke log.
- Respons pengguna login/register hanya berisi `id`, `name`, `email`, dan `role`; hash password tidak dikirim.
- Login, register, dan pengiriman ulasan dibatasi:

| Aksi | Batas |
|---|---|
| Percobaan login gagal | 10 kali per 15 menit; login berhasil tidak dihitung |
| Register dari satu alamat | 10 kali per jam |
| Pengiriman review | 30 kali per menit |

### Role dan kepemilikan

| Aksi | Admin | Seller |
|---|---|---|
| Membuat/mengubah/menghapus kategori | Diizinkan | Ditolak |
| Melihat daftar toko pengelolaan | Semua toko | Toko miliknya |
| Membuat toko | Dapat menentukan seller dan status | Pemilik ditetapkan dari akun login; status menunggu verifikasi |
| Mengubah/menghapus toko | Semua toko | Hanya toko miliknya |
| Mengubah status toko | Diizinkan | Ditolak |

Pendaftaran publik selalu membuat role `seller`. Mengirim `"role": "admin"` tidak memberikan hak admin. Admin baru hanya dibuat melalui perintah lokal `npm run admin:provision`, yang meminta password tanpa menampilkannya dan menolak email yang sudah dipakai. Perintah ini tidak mengubah akun yang sudah ada.

### Header, CORS, dan konfigurasi

- Helmet dipasang untuk mengirim header keamanan HTTP.
- CORS menggunakan daftar origin pada `CORS_ORIGIN` (beberapa origin dipisahkan koma). Saat development, origin localhost juga diizinkan. Saat production, hanya origin yang didaftarkan yang diizinkan.
- CORS bukan pengganti autentikasi/otorisasi. Permintaan tanpa header `Origin`, seperti aplikasi mobile atau `curl`, tetap dapat mencapai API; endpoint privat tetap membutuhkan autentikasi.
- Pastikan `JWT_SECRET` dikonfigurasi sebagai rahasia kuat di environment deployment. Jangan menaruh nilainya di dokumentasi, source control, log, atau screenshot.
- `trust proxy` tidak diaktifkan. Jika deployment menggunakan reverse proxy, tinjau konfigurasi proxy dan alamat jaringan sebelum mengubahnya.

## 2. Form Validation

Input divalidasi sebelum dipakai ke database. Input invalid umumnya mendapat HTTP `400` dengan pesan Bahasa Indonesia.

| Input | Aturan utama |
|---|---|
| Register | Nama 2–60 karakter; email valid maksimal 254 karakter; password minimal 8 karakter, huruf besar, huruf kecil, angka, dan maksimal 72 byte; konfirmasi wajib sama dengan password |
| Login | Email dan password wajib; email harus valid; password maksimal 72 byte |
| Kategori | Nama 2–40 karakter; ID harus bilangan bulat positif yang valid |
| Toko | Nama 2–80 karakter; `categoryId` berupa ID positif; jam `HH:MM`; status `buka`, `tutup`, atau `menunggu_verifikasi`; panjang field teks dibatasi |
| Produk | Nama wajib maksimal 80 karakter; harga wajib bilangan bulat Rupiah antara 0 dan 2.147.483.647; maksimal 50 produk per toko |
| Review | Teks wajib maksimal 1.000 karakter; rating bilangan bulat 1–5; nama maksimal 60 karakter; tanggal berupa teks maksimal 100 karakter |
| Filter toko | `q` maksimal 100 karakter, kategori maksimal 80 karakter, dan status pengelolaan harus salah satu status toko yang berlaku |

Harga produk dapat dikirim sebagai angka bulat (`7000`) atau teks Rupiah yang jelas (`"Rp 7.000"`). Nilai pecahan dan format ambigu ditolak. URL gambar/banner harus berupa URL HTTP/HTTPS atau alamat lokal yang diizinkan validator.

Field `sellerId` dan `status` dari seller tidak dapat memindahkan kepemilikan atau melewati verifikasi admin. Filter query tunggal juga divalidasi; mengirim parameter berulang yang menjadi array akan ditolak.

Belum ada endpoint/controller/model promo di backend yang diaudit. Karena itu panduan ini tidak mendokumentasikan API promo.

## Contoh request dan response

### Register publik

Request berikut sengaja mengirim role admin. Role tersebut tidak digunakan untuk menetapkan hak akun.

```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "Budi",
  "email": "budi@example.test",
  "password": "Password123!",
  "confirmPassword": "Password123!",
  "role": "admin"
}
```

Respons `201 Created`:

```json
{
  "user": {
    "id": 12,
    "name": "Budi",
    "email": "budi@example.test",
    "role": "seller"
  },
  "token": "<token-jwt>"
}
```

### Validasi gagal

Request `POST /api/auth/login` dengan format email yang tidak valid:

```json
{
  "email": "bukan-email",
  "password": "Password123!"
}
```

Respons `400 Bad Request`:

```json
{
  "error": "Format email tidak valid.",
  "errors": ["Format email tidak valid."]
}
```

### Endpoint yang memerlukan autentikasi

Kirim token hasil login/register pada header berikut. Gunakan role yang sesuai; token contoh di bawah bukan token sungguhan.

```http
GET /api/auth/admin-check
Authorization: Bearer <token-jwt>
```

## 3. Error Handling

Semua error menggunakan bentuk berikut; `errors` boleh tidak ada:

```json
{
  "error": "Format email tidak valid.",
  "errors": ["Format email tidak valid."]
}
```

Pemetaan utama:

| HTTP | Kondisi umum | Contoh pesan |
|---|---|---|
| 400 | Validasi gagal atau JSON rusak | `Format JSON tidak valid.` |
| 401 | Belum login, kredensial salah, atau token tidak valid | `Email atau password salah.` |
| 403 | Role atau kepemilikan tidak memberi izin | `Kamu tidak punya izin untuk aksi ini.` |
| 404 | Endpoint atau data tidak ditemukan | `Endpoint tidak ditemukan.` |
| 409 | Data unik bertabrakan atau konflik | `Data sudah terdaftar.` |
| 413 | Body melebihi batas JSON 50 KB | `Data yang dikirim terlalu besar.` |
| 500 | Kesalahan server tak terduga | `Terjadi kesalahan di server.` |

Error Prisma yang dikenal dipetakan secara terkontrol: `P2002` ke `409`, `P2003` ke `400`, `P2025` ke `404`, dan beberapa error data (`P2000`, `P2006`, `P2007`, `P2011`, `P2012`) ke `400`. Pesan khusus dari controller dapat lebih spesifik. Stack trace dan detail internal tidak dikirim ke pengguna.

## 4. Logging

Log ditulis sebagai satu objek JSON per baris: log informasi ke `stdout` dan error ke `stderr`. Contoh request:

```json
{
  "method": "POST",
  "endpoint": "/api/auth/login",
  "statusCode": 400,
  "durationMs": 5.12,
  "timestamp": "2026-01-01T10:00:00.000Z",
  "level": "info",
  "event": "http_request"
}
```

Endpoint menggunakan pola route tanpa nilai parameter; route yang tidak cocok dicatat sebagai `unmatched`. Request log tidak menyimpan query string, body, header, password, atau token. Error server mencatat method, endpoint, status, nama error, dan kode error yang sudah dibatasi formatnya—bukan pesan error atau stack trace.

## 5. Pengujian

Jalankan dari folder `BackEnd`:

```sh
npm test
npm run typecheck
npm run build
```

`npm test` menggunakan `node:test` dan database SQLite sementara dengan nama direktori unik di bawah `prisma`. Database ini dibersihkan setelah pengujian; test tidak menggunakan `prisma/dev.db` atau database pengguna.

### Endpoint dan perilaku yang diuji

| Endpoint | Yang diperiksa |
|---|---|
| `GET /` | Health check, CORS allowlist, dan header Helmet |
| `POST /api/auth/register` | Input invalid, konfirmasi password, serta pendaftaran dengan role seller meski request mengirim role admin |
| `POST /api/auth/login` | Validasi, password salah, login admin dan seller |
| `GET /api/auth/admin-check` | Tanpa token, role admin/seller, role token yang dimanipulasi, serta token HS256 lama |
| `POST /api/categories` | Seller ditolak, validasi nama, pembuatan kategori, konflik nama |
| `PUT /api/categories/:id` | Validasi ID dan data yang tidak ditemukan |
| `POST /api/stores` | Validasi harga/produk serta pemaksaan pemilik dan status seller |
| `GET /api/stores/manage` | Validasi filter status |
| `GET /api/stores` | Penolakan filter query berulang |
| `PUT /api/stores/:id` dan `DELETE /api/stores/:id` | Seller ditolak mengubah atau menghapus toko orang lain; seller tidak boleh mengubah status tokonya |
| `POST /api/store-reviews` | Rating invalid dan review valid |
| `GET /api/endpoint-tidak-ada` | Respons endpoint tidak ditemukan |

Middleware error juga diuji langsung untuk respons `500` yang aman dan pemetaan Prisma `P2025`. Logging diuji untuk memastikan query string, password, dan token tidak tercatat.

### Checklist untuk laporan PBL

- [x] Jalankan `npm test`; seluruh 9 tes integrasi lulus saat dokumentasi ini dibuat.
- [x] Jalankan `npm run typecheck`.
- [x] Pastikan pengujian selesai tanpa menyisakan direktori database sementara.
- [ ] Uji integrasi langsung dengan aplikasi Flutter dan Admin Next.js pada environment pengembangan.
- [ ] Pastikan origin deployment sudah dicantumkan dengan benar pada `CORS_ORIGIN`.
- [ ] Uji endpoint yang belum tercakup suite, termasuk `/api/market-reviews`, endpoint profil/logout, rate limit, dan deployment di belakang proxy.

Checklist yang belum dicentang adalah pekerjaan verifikasi lanjutan, bukan hasil yang sudah diklaim oleh suite otomatis.
