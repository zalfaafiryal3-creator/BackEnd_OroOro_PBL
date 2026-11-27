import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@pasar.com';
  const password = 'adminpasar123';
  const passwordHash = await hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name: 'Admin Utama',
      passwordHash,
      role: 'admin',
    },
    create: {
      name: 'Admin Utama',
      email,
      passwordHash,
      role: 'admin',
    },
  });

  console.log('Akun admin utama berhasil dibuat/diperbarui:');
  console.log(`  ID      : ${user.id}`);
  console.log(`  Email   : ${user.email}`);
  console.log(`  Role    : ${user.role}`);
  console.log(`  Password: ${password}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
