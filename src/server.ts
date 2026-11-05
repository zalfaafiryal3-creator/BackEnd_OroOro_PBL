import 'dotenv/config'; // harus paling atas: membaca file .env
import { app } from './app';
import { logError, logInfo } from './lib/logger';

if (!process.env.JWT_SECRET) {
  logError('server_start_failed', { reason: 'JWT_SECRET belum dikonfigurasi.' });
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 4000;
const server = app.listen(PORT, '0.0.0.0', () => {
  logInfo('server_started', { host: '0.0.0.0', port: PORT });
});

server.on('error', (error: NodeJS.ErrnoException) => {
  const errorCode = error.code && /^[A-Z0-9_]{1,40}$/.test(error.code)
    ? error.code
    : 'UNKNOWN';
  logError('server_listen_failed', { port: PORT, errorCode });
  process.exitCode = 1;
});
