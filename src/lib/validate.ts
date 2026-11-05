// Aturan validasi input yang bisa dipakai ulang

// Ambil nilai sebagai string yang sudah dirapikan. Selain string -> string kosong.
export function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parsePositiveId(value: unknown): number | null {
  let number: number;

  if (typeof value === 'number') {
    number = value;
  } else if (typeof value === 'string' && /^\d+$/.test(value)) {
    number = Number(value);
  } else {
    return null;
  }

  return Number.isSafeInteger(number) && number > 0 && number <= 2_147_483_647
    ? number
    : null;
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidName(name: string): boolean {
  return name.length >= 2 && name.length <= 60;
}
