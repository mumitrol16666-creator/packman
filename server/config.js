/** Настройки сервиса читаются из переменных окружения (.env рядом с docker-compose или экспорт в shell). */
export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT) || 8787,
    dbPath: env.DB_PATH || './data/analytics.db',
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
