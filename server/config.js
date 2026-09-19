import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Настройки сервиса читаются из переменных окружения (.env рядом с docker-compose или экспорт в shell). */
export function loadConfig(env = process.env) {
  const projectRoot = resolve(env.PROJECT_ROOT || DEFAULT_ROOT);
  const dbPath = env.DB_PATH || './data/analytics.db';
  return {
    projectRoot,
    siteDir: resolve(env.SITE_DIR || join(projectRoot, 'dist')),
    dataDir: dbPath === ':memory:' ? resolve('./data') : dirname(resolve(dbPath)),
    adminPassword: env.ADMIN_PASSWORD || '',
    serveSite: env.SERVE_SITE === '1',
    buildOnStart: env.BUILD_ON_START === '1',
    port: Number(env.PORT) || 8787,
    dbPath,
    timezone: env.TIMEZONE || 'Asia/Aqtobe',
    reportHour: env.REPORT_HOUR === undefined || env.REPORT_HOUR === '' ? 9 : Number(env.REPORT_HOUR),
    botToken: env.TG_BOT_TOKEN || '',
    reportChat: env.TG_REPORT_CHAT_ID || '',
    bookingsChat: env.TG_BOOKINGS_CHAT_ID || '',
    allowedOrigins: (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    trustProxy: env.TRUST_PROXY !== '0',
    siteName: env.SITE_NAME || 'Pacman Game Center',
  };
}
