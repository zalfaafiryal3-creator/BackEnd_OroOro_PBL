import 'dotenv/config'; // harus paling atas: membaca file .env
import { app } from './app';

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET belum diisi di file .env');
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, '0.0.0.0', () => console.log(`API jalan di http://localhost:${PORT}`));
