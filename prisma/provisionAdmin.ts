import 'dotenv/config';
import { createInterface } from 'node:readline';
import { Prisma, PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { isValidEmail, isValidName } from '../src/lib/validate';
import { validatePassword } from '../src/lib/validatePassword';

const prisma = new PrismaClient();

function ask(prompt: string): Promise<string> {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    readline.question(prompt, (answer) => {
      readline.close();
      resolve(answer.trim());
    });
  });
}

function askPassword(prompt: string): Promise<string> {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error('Jalankan perintah ini langsung dari terminal interaktif.');
  }

  process.stdout.write(prompt);
  input.setRawMode(true);
  input.setEncoding('utf8');
  input.resume();

  return new Promise((resolve, reject) => {
    let password = '';

    const cleanup = () => {
      input.off('data', onData);
      input.setRawMode(false);
      input.pause();
      process.stdout.write('\n');
    };

    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === '\u0003') {
          cleanup();
          reject(new Error('Proses dibatalkan.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          cleanup();
          resolve(password);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          password = Array.from(password).slice(0, -1).join('');
        } else {
          password += character;
        }
      }
    };

    input.on('data', onData);
  });
}

async function provisionAdmin(): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new Error('Jalankan perintah ini langsung dari terminal interaktif.');
  }

  const name = await ask('Nama admin: ');
  const email = (await ask('Email admin: ')).toLowerCase();
  const password = await askPassword('Password admin (tidak ditampilkan): ');
  const confirmation = await askPassword('Ulangi password admin: ');

  if (!isValidName(name)) {
    throw new Error('Nama harus 2 sampai 60 karakter.');
  }
  if (!isValidEmail(email)) {
    throw new Error('Format email tidak valid.');
  }
  if (password !== confirmation) {
    throw new Error('Konfirmasi password tidak sama.');
  }

  const passwordErrors = validatePassword(password);
  if (passwordErrors.length > 0) {
    throw new Error(passwordErrors.join(' '));
  }

  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) {
    throw new Error('Email sudah digunakan. Tidak ada akun yang diubah.');
  }

  try {
    await prisma.user.create({
      data: { name, email, passwordHash: await hash(password, 10), role: 'admin' },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new Error('Email sudah digunakan. Tidak ada akun yang diubah.');
    }
    throw error;
  }

  console.log('Akun admin berhasil dibuat.');
}

provisionAdmin()
  .catch((error: unknown) => {
    if (error instanceof Error) {
      console.error(`Provisioning gagal: ${error.message}`);
    } else {
      console.error('Provisioning gagal karena kesalahan yang tidak diketahui.');
    }
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
