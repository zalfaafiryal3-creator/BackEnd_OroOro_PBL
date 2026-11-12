# Backend Pasar Oro-Oro Dowo

## Menjalankan
1. Pasang Node.js 22.13 atau lebih baru (cek: `node -v`)
2. `npm install`
3. `npm run build` (jalankan setelah instalasi awal atau saat ingin memperbarui hasil build)
4. `npm start` (atau `npm run dev` agar otomatis restart saat file diubah)
5. Buka http://localhost:4000 -> harus muncul {"status":"ok"}

## Endpoint
| Method | URL | Fungsi |
|---|---|---|
| GET  | /api/store-reviews  | Ambil ulasan toko |
| POST | /api/store-reviews  | Kirim ulasan toko {name, date, text, rating} |
| GET  | /api/market-reviews | Ambil ulasan pasar |
| POST | /api/market-reviews | Kirim ulasan pasar |
| GET  | /api/market-reviews/page?page=1&limit=10 | Ambil ulasan pasar per halaman (maksimal 10), dengan filter dan pencarian opsional |
| GET  | /api/market-reviews/statistics | Statistik semua ulasan pasar publik |
| GET  | /api/markets/:id/reviews | Ambil ulasan pasar per pasar, dengan filter `?filter=all|photo|5|4|1-3` atau `?search=` |
| GET  | /api/markets/:id/reviews/statistics | Statistik ulasan pasar: `total_reviews`, `with_photo`, `star_5`, `star_4`, `star_1_3` |
| GET  | /api/stores/:id/reviews | Ambil ulasan per toko, dengan filter `?filter=all|photo|5|4|1-3`, pencarian, dan pagination |
| GET  | /api/stores/:id/reviews/statistics | Statistik ulasan toko: `total_reviews`, `with_photo`, `star_5`, `star_4`, `star_1_3` |
| POST | /api/stores/:id/reviews | Kirim ulasan untuk toko tertentu |

## Keamanan dan pengujian
Panduan security, validasi form, error handling, logging, contoh respons, dan checklist PBL ada di [SECURITY-VALIDATION.md](./SECURITY-VALIDATION.md).

Jalankan `npm test` untuk tes backend dan `npm run typecheck` untuk memeriksa tipe TypeScript.

## Tes tanpa Flutter
curl http://localhost:4000/api/store-reviews
curl -X POST http://localhost:4000/api/store-reviews -H "Content-Type: application/json" -d '{"name":"Budi","text":"Enak sekali!","rating":5}'

Database SQLite ditentukan oleh `DATABASE_URL` pada environment. Jangan menghapus file database untuk mereset data tanpa memastikan path dan memiliki backup.
