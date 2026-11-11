import { prisma } from '../lib/prisma';
import { TastePreference, VisitPlannerInput } from '../validators/visitPlannerValidation';

export type ProductDto = {
  id: number;
  name: string;
  price: number;
  description: string;
  photoUrl?: string | null;
};

export type StopDto = {
  order: number;
  storeId: number;
  storeName: string;
  category: string;
  zone: string;
  products: ProductDto[];
  estimatedCost: number;
  estimatedTime: number; // Dalam menit
  reason: string;
};

export type VisitPlanResponseData = {
  title: string;
  budget: number;
  totalEstimatedCost: number;
  remainingBudget: number;
  totalEstimatedTime: number;
  stops: StopDto[];
};

export type VisitPlanServiceResult = {
  success: boolean;
  message: string;
  data: VisitPlanResponseData;
};

// Kategori non-kuliner yang tidak masuk dalam rute wisata kuliner
const NON_CULINARY_CATEGORIES = [
  'sembako & perabotan',
  'sembako',
  'mainan & baju',
  'mainan',
  'pakaian',
  'daging & ikan',
  'sayur & buah',
];

// Pola kata kunci untuk pencocokan preferensi rasa
const TASTE_PATTERNS: Record<TastePreference, RegExp> = {
  manis: /(manis|gula|kue|lumpur|klepon|kismis|bikang|legit|cokelat|madu|pisang|selai|sirup|sweet|karamel|bolu|puding)/i,
  pedas: /(pedas|pedes|sambal|sambel|cabe|cabai|mercon|balado|rica|rawit|geprek|chili|spicy|level)/i,
  asin: /(asin|garam|gurih|keripik|teri|keju|telur asin|tahu|tempe|salted|salty)/i,
  gurih: /(gurih|savory|ayam|daging|kaldu|keju|bakso|pangsit|mie|lemper|bakar|goreng|kuah|santan|bawang|rendang|soto|rawon)/i,
};

function capitalize(text: string): string {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/**
 * Menyusun judul rute rekomendasi
 * Contoh: "Rute 1 Jam, Pedas & Hemat" atau "Rute 30 Menit, Manis & Hemat"
 */
function buildTitle(availableMinutes: number, rawDurationText: string | undefined, taste: TastePreference): string {
  const tasteLabel = capitalize(taste);
  let timeLabel = rawDurationText ?? `${availableMinutes} Menit`;

  if (!rawDurationText) {
    if (availableMinutes <= 35) {
      timeLabel = '30 Menit';
    } else if (availableMinutes <= 75) {
      timeLabel = '1 Jam';
    } else {
      timeLabel = '2 Jam';
    }
  }

  return `Rute ${timeLabel}, ${tasteLabel} & Hemat`;
}

/**
 * Menghasilkan alasan rekomendasi yang informatif dan relevan
 */
function generateStopReason(
  stopOrder: number,
  totalStops: number,
  storeName: string,
  products: ProductDto[],
  taste: TastePreference,
  zone: string,
): string {
  const productNames = products.map((p) => p.name).join(', ');
  const tasteLabel = capitalize(taste);
  const locationText = zone ? ` di area ${zone}` : '';

  if (totalStops === 1) {
    return `Rekomendasi utama di ${storeName}${locationText} menyajikan ${productNames} dengan cita rasa ${tasteLabel} khas yang pas di kantong.`;
  }

  if (stopOrder === 1) {
    return `Pemberhentian awal di ${storeName}${locationText} untuk menikmati ${productNames} dengan cita rasa ${tasteLabel} favorit.`;
  }

  if (stopOrder === totalStops) {
    return `Penutup rute yang pas di ${storeName} untuk melengkapi petualangan rasa ${tasteLabel} dengan ${productNames}.`;
  }

  return `Pemberhentian ke-${stopOrder} di ${storeName} dengan pilihan ${productNames} bercita rasa ${tasteLabel} yang lezat.`;
}

/**
 * Service untuk memproses rekomendasi rute kunjungan AI
 */
export async function generateVisitPlan(input: VisitPlannerInput): Promise<VisitPlanServiceResult> {
  const { availableTime, tastePreference, budget, rawDurationText } = input;
  const title = buildTitle(availableTime, rawDurationText, tastePreference);

  // 1. Ambil data toko yang aktif beserta kategori dan produk dari database
  const allStores = await prisma.store.findMany({
    where: {
      status: 'buka',
    },
    include: {
      category: true,
      products: {
        orderBy: { price: 'asc' },
      },
    },
    orderBy: {
      id: 'asc',
    },
  });

  // Filter khusus toko kuliner (makanan, jajanan, kuliner legendaris)
  const stores = allStores.filter(
    (s) => !NON_CULINARY_CATEGORIES.includes(s.category.name.trim().toLowerCase()),
  );

  // Validasi: periksa apakah ada toko atau produk kuliner di database
  const totalProductsCount = stores.reduce((sum, s) => sum + s.products.length, 0);
  if (stores.length === 0 || totalProductsCount === 0) {
    return {
      success: true,
      message: 'Rekomendasi belum dapat dibuat karena data katalog toko atau produk belum tersedia di pasar.',
      data: {
        title,
        budget,
        totalEstimatedCost: 0,
        remainingBudget: budget,
        totalEstimatedTime: 0,
        stops: [],
      },
    };
  }

  // 2. Pencocokan produk dan toko berdasarkan preferensi rasa
  const tasteRegex = TASTE_PATTERNS[tastePreference];

  type ScoredProduct = ProductDto & { score: number };

  type ScoredStore = {
    store: (typeof stores)[number];
    matchingProducts: ScoredProduct[];
    storeScore: number;
    minPrice: number;
  };

  const eligibleStores: ScoredStore[] = [];

  for (const store of stores) {
    if (!store.products || store.products.length === 0) continue;

    const matchedProducts: ScoredProduct[] = [];
    let storeScore = 0;

    // Cek setiap produk toko yang secara spesifik mencerminkan rasa yang diminta
    for (const prod of store.products) {
      let productScore = 0;

      if (tasteRegex.test(prod.name)) {
        productScore += 5;
      }
      if (tasteRegex.test(prod.description)) {
        productScore += 3;
      }

      // Hanya masukkan produk yang benar-benar cocok dengan preferensi rasa
      if (productScore > 0) {
        matchedProducts.push({
          id: prod.id,
          name: prod.name,
          price: prod.price,
          description: prod.description,
          photoUrl: prod.photoUrl,
          score: productScore,
        });
        storeScore += productScore;
      }
    }

    if (matchedProducts.length > 0) {
      // Urutkan produk berdasarkan skor kecocokan tertinggi, lalu harga termurah
      matchedProducts.sort((a, b) => b.score - a.score || a.price - b.price);

      eligibleStores.push({
        store,
        matchingProducts: matchedProducts,
        storeScore,
        minPrice: matchedProducts[0].price,
      });
    }
  }

  // Jika tidak ada toko/produk yang cocok dengan preferensi rasa
  if (eligibleStores.length === 0) {
    return {
      success: true,
      message: `Tidak ditemukan toko atau produk yang sesuai dengan preferensi rasa '${tastePreference}'.`,
      data: {
        title,
        budget,
        totalEstimatedCost: 0,
        remainingBudget: budget,
        totalEstimatedTime: 0,
        stops: [],
      },
    };
  }

  // 3. Tentukan batas jumlah perhentian (stops) berdasarkan waktu tersedia
  let minStops = 1;
  let maxStops = 2;

  if (availableTime <= 35) {
    minStops = 1;
    maxStops = Math.min(2, Math.max(1, Math.floor(availableTime / 15)));
  } else if (availableTime <= 75) {
    minStops = 2;
    maxStops = Math.min(4, Math.max(2, Math.floor(availableTime / 15)));
  } else {
    minStops = 3;
    maxStops = Math.min(5, Math.max(3, Math.floor(availableTime / 20)));
  }

  // 4. Bangun penawaran menu (offers) per toko yang cocok rasa
  type StoreOffer = {
    store: (typeof stores)[number];
    products: ProductDto[];
    cost: number;
    tasteScore: number;
  };

  const storeOffers: StoreOffer[] = [];

  for (const item of eligibleStores) {
    // Penawaran 1: Produk utama dengan skor rasa tertinggi
    const p1 = item.matchingProducts[0];
    storeOffers.push({
      store: item.store,
      products: [
        {
          id: p1.id,
          name: p1.name,
          price: p1.price,
          description: p1.description,
          photoUrl: p1.photoUrl,
        },
      ],
      cost: p1.price,
      tasteScore: p1.score,
    });

    // Penawaran 2 (Kombo): Jika toko memiliki produk cocok kedua dan budget memungkinkan
    if (item.matchingProducts.length > 1) {
      const p2 = item.matchingProducts[1];
      const comboCost = p1.price + p2.price;
      if (comboCost <= budget) {
        storeOffers.push({
          store: item.store,
          products: [
            {
              id: p1.id,
              name: p1.name,
              price: p1.price,
              description: p1.description,
              photoUrl: p1.photoUrl,
            },
            {
              id: p2.id,
              name: p2.name,
              price: p2.price,
              description: p2.description,
              photoUrl: p2.photoUrl,
            },
          ],
          cost: comboCost,
          tasteScore: p1.score + p2.score + 2, // Bonus variasi rasa dalam 1 toko
        });
      }
    }
  }

  // 5. Algoritma Optimasi Kombinasi Rekomendasi berdasarkan Budget & Waktu
  // Mengelompokkan penawaran berdasarkan toko agar satu toko tidak dikunjungi berulang kali
  const storeMap = new Map<number, StoreOffer[]>();
  for (const offer of storeOffers) {
    const list = storeMap.get(offer.store.id) ?? [];
    list.push(offer);
    storeMap.set(offer.store.id, list);
  }

  const uniqueStoreIds = Array.from(storeMap.keys());

  type CandidateRoute = {
    offers: StoreOffer[];
    totalCost: number;
    score: number;
  };

  let bestRoute: CandidateRoute | null = null;

  // Pencarian kombinasi toko berbeda (kedalaman 1 sampai maxStops)
  function searchCombinations(
    startIndex: number,
    currentOffers: StoreOffer[],
    currentCost: number,
    currentTasteScore: number,
  ) {
    const stopsCount = currentOffers.length;

    if (stopsCount > 0 && currentCost <= budget) {
      // Evaluasi skor kombinasi saat ini
      const utilizationRatio = currentCost / budget; // 0.0 - 1.0
      const stopFitness = stopsCount >= minStops && stopsCount <= maxStops ? 25 : -10;
      
      // Semakin optimal memanfaatkan budget (tanpa melebihi), semakin tinggi skor
      const candidateScore =
        utilizationRatio * 150 +
        currentTasteScore * 5 +
        stopFitness +
        stopsCount * 15;

      if (!bestRoute || candidateScore > bestRoute.score) {
        bestRoute = {
          offers: [...currentOffers],
          totalCost: currentCost,
          score: candidateScore,
        };
      }
    }

    if (stopsCount >= maxStops) return;

    for (let i = startIndex; i < uniqueStoreIds.length; i++) {
      const storeId = uniqueStoreIds[i];
      const offersForStore = storeMap.get(storeId) ?? [];

      for (const offer of offersForStore) {
        if (currentCost + offer.cost <= budget) {
          currentOffers.push(offer);
          searchCombinations(
            i + 1,
            currentOffers,
            currentCost + offer.cost,
            currentTasteScore + offer.tasteScore,
          );
          currentOffers.pop();
        }
      }
    }
  }

  searchCombinations(0, [], 0, 0);

  const matchedRoute = bestRoute as CandidateRoute | null;

  // Jika budget tidak cukup bahkan untuk produk termurah yang cocok
  if (!matchedRoute || matchedRoute.offers.length === 0) {
    const lowestPrice = Math.min(...eligibleStores.map((e) => e.minPrice));
    return {
      success: true,
      message: `Budget Rp${budget.toLocaleString('id-ID')} belum mencukupi. Produk rasa ${tastePreference} terendah mulai dari Rp${lowestPrice.toLocaleString('id-ID')}. Coba tingkatkan budget Anda.`,
      data: {
        title,
        budget,
        totalEstimatedCost: 0,
        remainingBudget: budget,
        totalEstimatedTime: 0,
        stops: [],
      },
    };
  }

  type SelectedStopRaw = {
    store: (typeof stores)[number];
    selectedProducts: ProductDto[];
    cost: number;
  };

  const selectedStops: SelectedStopRaw[] = matchedRoute.offers.map((o: StoreOffer) => ({
    store: o.store,
    selectedProducts: o.products,
    cost: o.cost,
  }));

  // 6. Menyusun urutan rute kunjungan berdasarkan zona/alur pasar
  // Alur zona: Blok A -> Blok B -> Blok C -> lainnya
  selectedStops.sort((a, b) => {
    const zoneA = (a.store.zone || '').toUpperCase();
    const zoneB = (b.store.zone || '').toUpperCase();
    if (zoneA < zoneB) return -1;
    if (zoneA > zoneB) return 1;
    return a.cost - b.cost;
  });

  // 7. Alokasikan estimasi waktu per stop secara proporsional sesuai waktu yang tersedia
  const totalStopsCount = selectedStops.length;
  // Waktu kunjungan ideal per perhentian (antara 15 hingga 30 menit)
  const baseTimePerStop = Math.max(15, Math.min(30, Math.floor(availableTime / totalStopsCount)));
  let allocatedTimeTotal = baseTimePerStop * totalStopsCount;
  if (allocatedTimeTotal > availableTime) {
    allocatedTimeTotal = availableTime;
  }

  let totalEstimatedCost = 0;

  const stops: StopDto[] = selectedStops.map((stop, index) => {
    const order = index + 1;
    totalEstimatedCost += stop.cost;

    // Distribusikan menit per stop
    const stopTime =
      index === totalStopsCount - 1
        ? allocatedTimeTotal - baseTimePerStop * (totalStopsCount - 1)
        : baseTimePerStop;

    const reason = generateStopReason(
      order,
      totalStopsCount,
      stop.store.name,
      stop.selectedProducts,
      tastePreference,
      stop.store.zone,
    );

    return {
      order,
      storeId: stop.store.id,
      storeName: stop.store.name,
      category: stop.store.category.name,
      zone: stop.store.zone || 'Pasar Oro-Oro Dowo',
      products: stop.selectedProducts,
      estimatedCost: stop.cost,
      estimatedTime: stopTime,
      reason,
    };
  });

  const totalEstimatedTime = stops.reduce((sum, s) => sum + s.estimatedTime, 0);
  const remainingBudgetAmount = budget - totalEstimatedCost;

  return {
    success: true,
    message: 'Rekomendasi rute berhasil dibuat',
    data: {
      title,
      budget,
      totalEstimatedCost,
      remainingBudget: remainingBudgetAmount,
      totalEstimatedTime,
      stops,
    },
  };
}
