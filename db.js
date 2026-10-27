// Database SQLite bawaan Node.js (tanpa install apa-apa selain Node 22.13+).
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(process.env.DB_FILE || 'pasar.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS store_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT 'Anonim',
    date TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL,
    rating INTEGER NOT NULL DEFAULT 5,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS market_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT 'Anonim',
    date TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL,
    rating INTEGER NOT NULL DEFAULT 5,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

module.exports = db;
