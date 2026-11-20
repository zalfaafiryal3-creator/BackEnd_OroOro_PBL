import { PrismaClient } from '@prisma/client';

// Shared Prisma instance for database access
export const prisma = new PrismaClient();

export default prisma;
