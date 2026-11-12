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

type SeedProduct = {
  name: string;
  price: number;
  description?: string;
};

type SeedStore = {
  slug: string;
  name: string;
  category: string;
  description?: string;
  products?: SeedProduct[];
};

// Sama dengan marketStores di mobile (lib/data/market_data.dart)
const stores: SeedStore[] = [
  {
    slug: 'lumpur-kentang-27',
    name: 'Lumpur Kentang 27',
    category: 'Makanan',
    description: 'Kuliner legendaris kue lumpur kentang lumer di Pasar Oro Oro Dowo.',
    products: [
      {
        name: 'Kue Lumpur Kismis',
        price: 7000,
        description: 'Kue lumpur kentang lumer bertekstur lembut dengan rasa manis legit dan kismis pilihan.',
      },
      {
        name: 'Kue Lumpur Keju',
        price: 7000,
        description: 'Kue lumpur kentang lembut bertabur parutan keju asin gurih mantap.',
      },
      {
        name: 'Kue Lumpur Kelapa',
        price: 7000,
        description: 'Kue lumpur kentang manis lembut dengan sensasi serutan kelapa muda segar.',
      },
      {
        name: 'Kue Lumpur Cokelat Manis',
        price: 8000,
        description: 'Kue lumpur kentang lumer bertabur cokelat leleh manis nikmat.',
      },
    ],
  },
  {
    slug: 'bakso-goreng-bangkit',
    name: 'Bakso Goreng Ayam Bangkit',
    category: 'Makanan',
    description: 'Bakso goreng ayam hangat renyah favorit pengunjung pasar.',
    products: [
      {
        name: 'Bakso Goreng Original',
        price: 7000,
        description: 'Bakso goreng ayam renyah di luar, kenyal lembut di dalam dengan cita rasa gurih sedap.',
      },
      {
        name: 'Bakso Goreng Saus Pedas',
        price: 8000,
        description: 'Bakso goreng ayam renyah gurih disajikan dengan cocolan saus sambal pedas nampol.',
      },
      {
        name: 'Paket Komplit Bakso Goreng Pedas',
        price: 15000,
        description: 'Porsi lengkap bakso goreng ayam krispi dengan taburan bubuk cabai pedas gurih.',
      },
    ],
  },
  {
    slug: 'klepon-ku',
    name: 'Klepon-ku',
    category: 'Makanan',
    description: 'Spesialis jajanan pasar tradisional klepon dan kue basah khas Jawa.',
    products: [
      {
        name: 'Klepon Gula Merah',
        price: 15000,
        description: 'Kue klepon kenyal dengan isian gula merah manis lumer bertabur kelapa parut segar.',
      },
      {
        name: 'Bikang Suji',
        price: 4000,
        description: 'Kue carabikang tradisional mekar dengan aroma pandan suji manis legit.',
      },
      {
        name: 'Lemper Ayam Gurih',
        price: 7000,
        description: 'Ketan kukus pulen dengan isian ayam suwir berbumbu santan gurih sedap.',
      },
      {
        name: 'Lupis Manis Saus Gula Merah',
        price: 10000,
        description: 'Kue lupis ketan kenyal bertabur kelapa parut dan kucuran saus gula merah manis legit.',
      },
    ],
  },
  {
    slug: 'pangsit-mie-arema',
    name: 'Pangsit Mie Arema',
    category: 'Makanan',
    description: 'Kuliner mie pangsit otentik khas Malang dengan kuah kaldu segar.',
    products: [
      {
        name: 'Pangsit Mie Pedas Spesial',
        price: 18000,
        description: 'Mie kenyal bertabur ayam cincang gurih, pangsit krispi, dan level sambal pedas nikmat.',
      },
      {
        name: 'Pangsit Basah Kuah Pedas',
        price: 12000,
        description: 'Pangsit ayam lembut dengan kuah kaldu pedas gurih menghangatkan.',
      },
      {
        name: 'Pangsit Mie Kuah Asin Gurih',
        price: 16000,
        description: 'Mie pangsit klasik khas Malang dengan kuah kaldu ayam gurih dan rasa asin yang pas.',
      },
    ],
  },
  {
    slug: 'bagoplek-bakso-goreng',
    name: 'Bakso Goreng Bagoplek',
    category: 'Makanan',
    description: 'Bakso goreng mekar beraneka bumbu tabur dan cocolan sambal.',
    products: [
      {
        name: 'Bakso Goreng Sambal Pedas Mercon',
        price: 14000,
        description: 'Bakso goreng mekar renyah disiram sambal cabai rawit pedas mercon.',
      },
      {
        name: 'Tahu Bakso Sambal Mercon',
        price: 12000,
        description: 'Tahu bakso goreng lembut gurih dengan lumuran sambal pedas mercon nampol.',
      },
      {
        name: 'Bakso Goreng Bumbu Asin Gurih',
        price: 12000,
        description: 'Bakso goreng krispi dengan taburan bumbu asin gurih lezat dan renyah.',
      },
    ],
  },
  {
    slug: 'sego-liwet-kemangi',
    name: 'Sego Liwet Bakar Kemangi',
    category: 'Kuliner Legendaris',
    description: 'Nasi liwet bakar legendaris dibungkus daun pisang dengan rempah harum kemangi.',
    products: [
      {
        name: 'Sego Liwet Ayam Suwir Pedas',
        price: 22000,
        description: 'Nasi liwet bakar aroma kemangi dengan suwiran ayam bumbu sambal pedas gurih.',
      },
      {
        name: 'Sego Liwet Cumi Sambal Ijo Pedas',
        price: 25000,
        description: 'Nasi liwet bakar kemangi dengan cumi asin gurih dan sambal ijo pedas mantap.',
      },
      {
        name: 'Sego Liwet Teri Asin Gurih',
        price: 20000,
        description: 'Nasi liwet bakar gurih dengan taburan ikan teri asin renyah dan bumbu rempah wangi.',
      },
    ],
  },
  {
    slug: 'warung-lalapan-bu-win',
    name: 'Warung Lalapan Bu Win',
    category: 'Makanan',
    description: 'Warung aneka lalapan ayam, bebek, dan lele goreng sambal segar.',
    products: [
      {
        name: 'Ayam Geprek Sambal Bawang Pedas',
        price: 20000,
        description: 'Ayam goreng krispi digeprek dengan ulekan cabai rawit dan sambal bawang pedas gurih.',
      },
      {
        name: 'Lele Goreng Sambal Terasi Pedas',
        price: 18000,
        description: 'Ikan lele goreng gurih renyah disajikan dengan lalapan segar dan sambal terasi pedas mantap.',
      },
      {
        name: 'Tahu Tempe Goreng Sambal Pedas',
        price: 10000,
        description: 'Tahu dan tempe goreng gurih disajikan dengan cocolan sambal cabai pedas nikmat.',
      },
    ],
  },
  {
    slug: 'soto-rawon-bu-ninik',
    name: 'Soto Rawon Bu Ninik',
    category: 'Makanan',
    description: 'Kuliner khas Jawa Timur soto ayam hangat dan rawon daging kluwek legendaris.',
    products: [
      {
        name: 'Rawon Daging Kuah Gurih',
        price: 25000,
        description: 'Rawon daging sapi empuk dengan kuah kluwek hitam pekat bercita rasa gurih sedap.',
      },
      {
        name: 'Soto Daging Sambal Rawit Pedas',
        price: 24000,
        description: 'Soto daging sapi hangat dengan koya gurih dan racikan sambal cabai rawit pedas mantap.',
      },
    ],
  },
  {
    slug: 'cak-abu-gado-gado',
    name: 'Cak Abu Gado-Gado',
    category: 'Makanan',
    description: 'Gado-gado legendaris sayuran segar dengan siraman bumbu kacang gurih mantap.',
    products: [
      {
        name: 'Gado-Gado Spesial Bumbu Kacang Pedas',
        price: 18000,
        description: 'Sayuran rebus segar, lontong, tahu, dan telur disiram bumbu kacang gurih dan sambal pedas lezat.',
      },
    ],
  },
  {
    slug: 'pastel-premium',
    name: 'Pastel Premium',
    category: 'Makanan',
    description: 'Jajanan pastel premium kulit renyah berlapis dengan aneka isian gurih dan pedas.',
    products: [
      {
        name: 'Pastel Spesial Ayam Pedas',
        price: 10000,
        description: 'Pastel renyah berlapis dengan isian daging ayam cincang, wortel, dan cabai rawit pedas mantap.',
      },
      {
        name: 'Pastel Sayur Telur Gurih',
        price: 8000,
        description: 'Pastel kulit renyah dengan isian sayur, bihun, dan potongan telur bercita rasa asin gurih.',
      },
    ],
  },
  {
    slug: 'gorengan-bu-sulbiah',
    name: 'Gorengan Bu Sulbiah',
    category: 'Makanan',
    description: 'Gorengan tradisional khas pasar hangat renyah dan gurih.',
    products: [
      {
        name: 'Tahu Isi Sambal Pedas',
        price: 5000,
        description: 'Tahu goreng krispi dengan isian sayuran berbumbu pedas gurih renyah.',
      },
      {
        name: 'Tempe Mendoan Gurih',
        price: 5000,
        description: 'Tempe berbalut adonan tepung daun bawang gurih lembut disajikan hangat.',
      },
    ],
  },
  { slug: 'fresgreen-organic', name: 'FresGreen Organic', category: 'Sayur & Buah' },
  { slug: 'norriture', name: 'Norriture', category: 'Daging & Ikan' },
  { slug: 'wiwit-sayur', name: 'Wiwit Sayur', category: 'Sayur & Buah' },
  {
    slug: 'toko-sembako-barokah',
    name: 'Toko Sembako Barokah',
    category: 'Sembako & Perabotan',
    products: [
      {
        name: 'Gula Pasir 1kg',
        price: 17000,
        description: 'Gula pasir kristal putih murni bercita rasa manis alami.',
      },
    ],
  },
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
    const store = await prisma.store.upsert({
      where: { slug: s.slug },
      update: {
        zone: zoneByCategory[s.category] ?? 'Blok A',
        ...(s.description ? { description: s.description } : {}),
      },
      create: {
        slug: s.slug,
        name: s.name,
        ownerName: 'Belum diisi',
        categoryId: categoryIds.get(s.category)!,
        zone: zoneByCategory[s.category] ?? 'Blok A',
        status: 'buka',
        description: s.description ?? '',
      },
    });

    if (s.products && s.products.length > 0) {
      for (const p of s.products) {
        const existing = await prisma.product.findFirst({
          where: { storeId: store.id, name: p.name },
        });

        if (!existing) {
          await prisma.product.create({
            data: {
              storeId: store.id,
              name: p.name,
              price: p.price,
              description: p.description ?? '',
            },
          });
        } else if (p.description && !existing.description) {
          await prisma.product.update({
            where: { id: existing.id },
            data: {
              description: p.description,
              price: p.price,
            },
          });
        }
      }
    }
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