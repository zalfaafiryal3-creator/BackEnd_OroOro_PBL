// Mengembalikan daftar masalah pada password. Daftar kosong = password valid.
export function validatePassword(password: unknown): string[] {
  if (typeof password !== 'string' || password.length === 0) {
    return ['Password wajib diisi.'];
  }

  const errors: string[] = [];
  if (password.length < 8) errors.push('Password minimal 8 karakter.');
  if (password.length > 72) errors.push('Password maksimal 72 karakter.'); // batas bcrypt
  if (!/[A-Z]/.test(password)) errors.push('Password harus mengandung huruf besar.');
  if (!/[a-z]/.test(password)) errors.push('Password harus mengandung huruf kecil.');
  if (!/[0-9]/.test(password)) errors.push('Password harus mengandung angka.');
  return errors;
}
