// Aturan validasi input yang bisa dipakai ulang

// Ambil nilai sebagai string yang sudah dirapikan. Selain string -> string kosong.
export function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidName(name: string): boolean {
  return name.length >= 2 && name.length <= 60;
}
