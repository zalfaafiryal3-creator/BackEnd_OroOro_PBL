import { User as PrismaUser } from '@prisma/client';

export type User = PrismaUser;
export type UserRole = 'admin' | 'seller';

export type SafeUser = Omit<PrismaUser, 'passwordHash'>;

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
}

export interface LoginInput {
  email: string;
  password: string;
}
