-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TEMP TABLE "_Store_sequence_backup" (
    "seq" INTEGER NOT NULL
);
INSERT INTO "_Store_sequence_backup" ("seq")
SELECT COALESCE(
    (SELECT "seq" FROM "sqlite_sequence" WHERE "name" = 'Store'),
    0
);
CREATE TABLE "new_Store" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL DEFAULT '',
    "categoryId" INTEGER NOT NULL,
    "zone" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'menunggu_verifikasi',
    "openTime" TEXT DEFAULT '06:00',
    "closeTime" TEXT DEFAULT '17:00',
    "sourceMobileId" TEXT,
    "establishedYear" INTEGER,
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "bannerUrl" TEXT,
    "logoUrl" TEXT,
    "sellerId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Store_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Store_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Store" ("bannerUrl", "categoryId", "closeTime", "createdAt", "description", "email", "establishedYear", "id", "logoUrl", "name", "openTime", "ownerName", "phone", "sellerId", "slug", "status", "zone") SELECT "bannerUrl", "categoryId", "closeTime", "createdAt", "description", "email", "establishedYear", "id", "logoUrl", "name", "openTime", "ownerName", "phone", "sellerId", "slug", "status", "zone" FROM "Store";
DROP TABLE "Store";
ALTER TABLE "new_Store" RENAME TO "Store";
CREATE UNIQUE INDEX "Store_slug_key" ON "Store"("slug");
CREATE UNIQUE INDEX "Store_sourceMobileId_key" ON "Store"("sourceMobileId");
CREATE INDEX "Store_categoryId_idx" ON "Store"("categoryId");
UPDATE "sqlite_sequence"
SET "seq" = MAX(
    "seq",
    (SELECT "seq" FROM "_Store_sequence_backup"),
    COALESCE((SELECT MAX("id") FROM "Store"), 0)
)
WHERE "name" = 'Store';
INSERT INTO "sqlite_sequence" ("name", "seq")
SELECT
    'Store',
    MAX(
        (SELECT "seq" FROM "_Store_sequence_backup"),
        COALESCE((SELECT MAX("id") FROM "Store"), 0)
    )
WHERE NOT EXISTS (
    SELECT 1 FROM "sqlite_sequence" WHERE "name" = 'Store'
);
DROP TABLE "_Store_sequence_backup";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
