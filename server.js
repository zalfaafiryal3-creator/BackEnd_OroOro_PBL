const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '50kb' }));

// Cek server hidup: buka http://localhost:4000/ di browser.
app.get('/', (_req, res) => res.json({ status: 'ok', app: 'Pasar Oro-Oro Dowo API' }));

// Satu fungsi untuk membuat endpoint ulasan, dipakai untuk toko & pasar.
function reviewRoutes(path, table) {
  const list = () =>
    db.prepare(`SELECT id, name, date, text, rating FROM ${table} ORDER BY id DESC`).all();

  // Ambil semua ulasan
  app.get(path, (_req, res) => res.json(list()));

  // Kirim ulasan baru -> balas dengan daftar terbaru (sesuai review_api.dart)
  app.post(path, (req, res) => {
    const body = req.body || {};
    const text = String(body.text ?? '').trim();
    const name = String(body.name ?? '').trim() || 'Anonim';
    const date = String(body.date ?? '').trim();
    const rating = Math.round(Number(body.rating ?? 5));

    if (!text) return res.status(400).json({ error: 'Ulasan tidak boleh kosong.' });
    if (text.length > 1000) return res.status(400).json({ error: 'Ulasan maksimal 1000 karakter.' });
    if (name.length > 60) return res.status(400).json({ error: 'Nama maksimal 60 karakter.' });
    if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Rating harus 1 sampai 5.' });

    db.prepare(`INSERT INTO ${table} (name, date, text, rating) VALUES (?, ?, ?, ?)`)
      .run(name, date, text, rating);
    res.status(201).json(list());
  });
}

reviewRoutes('/api/store-reviews', 'store_reviews');
reviewRoutes('/api/market-reviews', 'market_reviews');

// Endpoint tidak dikenal
app.use((_req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));

// Error tak terduga
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan di server.' });
});

app.listen(PORT, '0.0.0.0', () => console.log(`API jalan di http://localhost:${PORT}`));
