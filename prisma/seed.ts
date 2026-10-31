import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const categories = [
  'Makanan',
  'Sayur & Buah',
  'Kuliner Legendaris',
  'Daging & Ikan',
  'Sembako & Perabotan',
  'Mainan & Baju',
];

// Zona hanya contoh awal. Ubah lewat panel admin kalau sudah ada data sebenarnya.
const zoneByCategory: Record<string, string> = {
  'Makanan': 'Blok A',
  'Kuliner Legendaris': 'Blok A',
  'Sayur & Buah': 'Blok B',
  'Daging & Ikan': 'Blok C',
  'Sembako & Perabotan': 'Blok C',
  'Mainan & Baju': 'Blok C',
};

type SeedStore = {
  slug: string;
  name: string;
  category: string;
  products?: { name: string; price: number }[];
};

// Sama dengan marketStores di mobile (lib/data/market_data.dart)
const stores: SeedStore[] = [
  {
    slug: 'lumpur-kentang-27',
    name: 'Lumpur Kentang 27',
    category: 'Makanan',
    products: [
      { name: 'Kismis', price: 7000 },
      { name: 'Keju', price: 7000 },
      { name: 'Kelapa', price: 7000 },
    ],
  },
  { slug: 'bakso-goreng-bangkit', name: 'Bakso Goreng Ayam Bangkit', category: 'Makanan' },
  {
    slug: 'klepon-ku',
    name: 'Klepon-ku',
    category: 'Makanan',
    products: [
      { name: 'Bikang Suji', price: 4000 },
      { name: 'Lemper Ayam', price: 7000 },
    ],
  },
  { slug: 'pangsit-mie-arema', name: 'Pangsit Mie Arema', category: 'Makanan' },
  { slug: 'bagoplek-bakso-goreng', name: 'Bagoplek Bakso Goreng', category: 'Makanan' },
  { slug: 'fresgreen-organic', name: 'FresGreen Organic', category: 'Sayur & Buah' },
  { slug: 'sego-liwet-kemangi', name: 'Sego liwet Bakar Kemangi', category: 'Kuliner Legendaris' },
  { slug: 'norriture', name: 'Norriture', category: 'Daging & Ikan' },
  { slug: 'wiwit-sayur', name: 'Wiwit Sayur', category: 'Sayur & Buah' },
  { slug: 'toko-sembako-barokah', name: 'Toko Sembako Barokah', category: 'Sembako & Perabotan' },
  { slug: 'kios-mainan-baju', name: 'Kios Mainan & Baju Ceria', category: 'Mainan & Baju' },
];

async function main() {
  // upsert = buat kalau belum ada. Aman dijalankan berkali-kali, data yang sudah diubah admin tidak tertimpa.
  const categoryIds = new Map<string, number>();
  for (const name of categories) {
    const row = await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
    categoryIds.set(name, row.id);
  }

  for (const s of stores) {
    await prisma.store.upsert({
      where: { slug: s.slug },
      update: {},
      create: {
        slug: s.slug,
        name: s.name,
        ownerName: 'Belum diisi',
        categoryId: categoryIds.get(s.category)!,
        zone: zoneByCategory[s.category] ?? '',
        status: 'buka',
        products: { create: s.products ?? [] },
      },
    });
  }

  console.log(`Seed selesai: ${categories.length} kategori, ${stores.length} toko.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });