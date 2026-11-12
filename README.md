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
| GET  | /api/recommendations/stores | Empat toko rekomendasi dari katalog toko dan urutan yang ditentukan |
| GET  | /api/recommendations/products | Maksimal tiga produk rekomendasi berdasarkan rating/aktivitas ulasan toko pemilik |
| GET  | /api/recommendations/featured-products | Produk katalog publik; default `sort=best_selling` |
| GET  | /api/recommendations/featured-products?sort=highest_rating | Produk diurutkan berdasarkan rating toko pemilik |
| GET  | /api/recommendations/featured-products?sort=newest | Produk diurutkan berdasarkan ID terbaru |
| GET  | /api/recommendations/featured-products?sort=lowest_price | Produk diurutkan berdasarkan harga termurah |
| GET  | /api/recommendations/featured-products?sort=highest_price | Produk diurutkan berdasarkan harga termahal |
| POST | /api/bookmarks | Login diperlukan; tambah bookmark dengan body `{ "productId": 1 }` |
| DELETE | /api/bookmarks/:productId | Login diperlukan; hapus bookmark milik pengguna aktif |
| GET | /api/bookmarks | Login diperlukan; daftar bookmark pengguna aktif |
| GET | /api/bookmarks/:productId/status | Login diperlukan; status bookmark dan ketersediaan katalog |

## Keamanan dan pengujian
Panduan security, validasi form, error handling, logging, contoh respons, dan checklist PBL ada di [SECURITY-VALIDATION.md](./SECURITY-VALIDATION.md).

Jalankan `npm test` untuk tes backend dan `npm run typecheck` untuk memeriksa tipe TypeScript.

Bookmark memakai tabel `Bookmark` dengan unique constraint per pasangan pengguna/produk. Terapkan migrasi baru dengan `npx prisma migrate deploy`.

Skema produk saat ini belum menyimpan rating/ulasan produk, jumlah penjualan, atau stok. Karena itu API mengirim `rating: null`, `reviewCount: 0`, `salesCount: null`, dan `availabilityStatus: "catalog_listed"` untuk produk yang masih tercantum pada toko publik. Rekomendasi produk memakai rating dan volume ulasan toko pemilik secara eksplisit sebagai fallback; jika belum ada ulasan toko publik, daftar rekomendasi berlabel dikembalikan kosong. `newest` menggunakan ID produk menurun karena produk belum memiliki `createdAt`.

Endpoint toko rekomendasi memakai empat baris toko yang ada dan mengurutkannya sesuai daftar target. Migrasi `20261112143000_normalize_recommended_store_names` menyelaraskan ejaan pada dua baris toko yang sudah ada tanpa mengganti ID atau relasi produknya. Jika target masih tidak ditemukan, endpoint mengembalikan HTTP 409 dan `missingStores`; API tidak membuat toko pengganti.

## Tes tanpa Flutter
curl http://localhost:4000/api/store-reviews
curl -X POST http://localhost:4000/api/store-reviews -H "Content-Type: application/json" -d '{"name":"Budi","text":"Enak sekali!","rating":5}'

Database SQLite ditentukan oleh `DATABASE_URL` pada environment. Jangan menghapus file database untuk mereset data tanpa memastikan path dan memiliki backup.
