export type TastePreference = 'manis' | 'pedas' | 'asin' | 'gurih';

export type VisitPlannerInput = {
  availableTime: number; // Dalam menit: 30, 60, 120, dll.
  tastePreference: TastePreference;
  budget: number; // Rupiah > 0
  rawDurationText?: string;
};

export type ValidationResult<T> = {
  isValid: boolean;
  errors: string[];
  data?: T;
};

const VALID_TASTES: readonly TastePreference[] = ['manis', 'pedas', 'asin', 'gurih'] as const;

/**
 * Parsing waktu dari berbagai format:
 * - 30 -> 30
 * - "30" -> 30
 * - "30 Menit" -> 30
 * - "1 Jam" -> 60
 * - "2 Jam +" atau "2 Jam" -> 120
 */
export function parseAvailableTime(value: unknown): { minutes: number; label: string } | null {
  if (typeof value === 'number') {
    if (Number.isFinite(value) && value > 0) {
      const minutes = Math.round(value);
      let label = `${minutes} Menit`;
      if (minutes >= 120) {
        label = '2 Jam +';
      } else if (minutes >= 60) {
        label = '1 Jam';
      }
      return { minutes, label };
    }
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    // Format "1 Jam", "2 Jam +", "2 Jam"
    const hourMatch = trimmed.match(/^(\d+)\s*jam/i);
    if (hourMatch) {
      const hours = parseInt(hourMatch[1], 10);
      if (hours > 0) {
        return {
          minutes: hours * 60,
          label: hours >= 2 ? '2 Jam +' : `${hours} Jam`,
        };
      }
    }

    // Format "30 Menit", "45 Menit"
    const minuteMatch = trimmed.match(/^(\d+)\s*menit/i);
    if (minuteMatch) {
      const minutes = parseInt(minuteMatch[1], 10);
      if (minutes > 0) {
        return {
          minutes,
          label: `${minutes} Menit`,
        };
      }
    }

    // Hanya angka berupa string "60" atau "30"
    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric) && numeric > 0) {
      const minutes = Math.round(numeric);
      let label = `${minutes} Menit`;
      if (minutes >= 120) {
        label = '2 Jam +';
      } else if (minutes >= 60) {
        label = '1 Jam';
      }
      return { minutes, label };
    }
  }

  return null;
}

/**
 * Parsing budget ke angka positif
 */
export function parseBudget(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
  }

  if (typeof value === 'string') {
    // Bersihkan karakter selain digit, contoh "Rp 100.000" -> "100000"
    const cleanStr = value.replace(/[^0-9]/g, '');
    if (!cleanStr) return null;
    const num = parseInt(cleanStr, 10);
    return !Number.isNaN(num) && num > 0 ? num : null;
  }

  return null;
}

/**
 * Validasi input AI Perencana Kunjungan
 */
export function validateVisitPlannerInput(body: unknown): ValidationResult<VisitPlannerInput> {
  const errors: string[] = [];

  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: ['Data request harus berupa objek JSON.'],
    };
  }

  const raw = body as Record<string, unknown>;

  // 1. Validasi Waktu Tersedia
  const parsedTime = parseAvailableTime(raw.availableTime);
  if (!parsedTime) {
    errors.push(
      'Waktu kunjungan wajib diisi dengan nilai yang valid (pilihan: 30 Menit, 1 Jam, 2 Jam + atau angka menit).',
    );
  }

  // 2. Validasi Preferensi Rasa
  const rawTaste = typeof raw.tastePreference === 'string' ? raw.tastePreference.trim().toLowerCase() : '';
  if (!rawTaste) {
    errors.push('Preferensi rasa wajib diisi.');
  } else if (!VALID_TASTES.includes(rawTaste as TastePreference)) {
    errors.push('Preferensi rasa harus sesuai pilihan yang tersedia (Manis, Pedas, Asin, atau Gurih).');
  }

  // 3. Validasi Budget
  if (raw.budget === undefined || raw.budget === null || raw.budget === '') {
    errors.push('Budget tidak boleh kosong.');
  } else {
    const parsedBudgetValue = parseBudget(raw.budget);
    if (parsedBudgetValue === null || parsedBudgetValue <= 0) {
      errors.push('Budget harus berupa angka positif.');
    } else if (parsedBudgetValue < 10000) {
      errors.push('Budget minimal adalah Rp10.000.');
    } else if (parsedBudgetValue > 120000) {
      errors.push('Budget maksimal adalah Rp120.000.');
    } else if (parsedBudgetValue % 5000 !== 0) {
      errors.push('Budget harus berupa kelipatan Rp5.000.');
    }
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
    };
  }

  const validTaste = rawTaste as TastePreference;
  const validBudget = parseBudget(raw.budget)!;

  return {
    isValid: true,
    errors: [],
    data: {
      availableTime: parsedTime!.minutes,
      tastePreference: validTaste,
      budget: validBudget,
      rawDurationText: parsedTime!.label,
    },
  };
}

