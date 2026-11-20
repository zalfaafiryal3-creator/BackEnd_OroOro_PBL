import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@pasaroro.com';
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('Admin sudah ada, skip.');
    return;
  }

  await prisma.user.create({
    data: {
      name: 'Admin Pasar',
      email,
      passwordHash: await hash('Admin123!', 10),
      role: 'admin',
    },
  });
  console.log('Akun admin berhasil dibuat:');
  console.log('  Email   : admin@pasaroro.com');
  console.log('  Password: Admin123!');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

