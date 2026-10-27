# Backend Pasar Oro-Oro Dowo

## Menjalankan
1. Pasang Node.js 22.13 atau lebih baru (cek: `node -v`)
2. `npm install`
3. `npm start`  (atau `npm run dev` agar otomatis restart saat file diubah)
4. Buka http://localhost:4000 -> harus muncul {"status":"ok"}

## Endpoint
| Method | URL | Fungsi |
|---|---|---|
| GET  | /api/store-reviews  | Ambil ulasan toko |
| POST | /api/store-reviews  | Kirim ulasan toko {name, date, text, rating} |
| GET  | /api/market-reviews | Ambil ulasan pasar |
| POST | /api/market-reviews | Kirim ulasan pasar |

## Tes tanpa Flutter
curl http://localhost:4000/api/store-reviews
curl -X POST http://localhost:4000/api/store-reviews -H "Content-Type: application/json" -d '{"name":"Budi","text":"Enak sekali!","rating":5}'

Data tersimpan di file `pasar.db` (hapus file ini untuk mengosongkan data).
