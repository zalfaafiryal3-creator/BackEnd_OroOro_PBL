import { PrismaClient } from '@prisma/client';

// Satu koneksi database yang dipakai bersama oleh controller dan middleware
export const prisma = new PrismaClient();
