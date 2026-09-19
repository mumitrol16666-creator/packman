import { createServer } from 'node:http';
import { loadConfig } from './config.js';
import { insertEvent, openDb, visitorSecret } from './db.js';
import { createAdmin } from './admin/routes.js';
import { serveFile } from './admin/static.js';
import { createRateLimiter, normalizeEvent } from './ingest.js';
import { bookingNotice } from './report.js';
import { runScheduler } from './scheduler.js';
import { sendTelegram } from './telegram.js';

const config = loadConfig();
const db = openDb(config.dbPath);
const secret = visitorSecret(db);
const allow = createRateLimiter();
const MAX_BODY = 4096;
const admin = createAdmin({ db, config, clientIp });

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && config.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}

function clientIp(req) {
  const forwarded = config.trustProxy ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  return forwarded || req.socket.remoteAddress || '';
}

function readBody(req) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        resolve(null);
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

const server = createServer(async (req, res) => {
  cors(req, res);
  const path = (req.url || '').split('?')[0];

  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  if (req.method === 'GET' && path === '/api/health') {
    return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }));
  }
  if (admin && (await admin(req, res, path))) return;
  if (req.method !== 'POST' || path !== '/api/track') {
    // без Caddy или nginx сервис может сам отдавать собранный сайт: удобно локально и на маленьком сервере
    if (config.serveSite && (req.method === 'GET' || req.method === 'HEAD')) {
      const cache = path.startsWith('/_astro/') ? 'public, max-age=31536000, immutable' : 'no-cache';
      if (serveFile(res, config.siteDir, path, { cache })) return;
      if (serveFile(res, config.siteDir, '/404.html', { status: 404 })) return;
    }
    return res.writeHead(404).end();
  }

  const body = await readBody(req);
  // ответ всегда одинаковый: по нему нельзя понять, принято событие или отброшено
  res.writeHead(204).end();

  const event = normalizeEvent(body, {
    ip: clientIp(req),
    userAgent: req.headers['user-agent'] || '',
    secret,
    timezone: config.timezone,
  });
  if (!event || !allow(event.visitor)) return;

  try {
    insertEvent(db, event);
  } catch (error) {
    console.error('[track] не удалось записать событие:', error.message);
    return;
  }

  if (event.event === 'booking_whatsapp' && config.bookingsChat) {
    sendTelegram({ token: config.botToken, chat: config.bookingsChat, html: bookingNotice(event) }).catch((error) => console.error('[bookings]', error.message));
  }
});

async function tick() {
  try {
    const sent = await runScheduler({
      db,
      config,
      send: (html) => sendTelegram({ token: config.botToken, chat: config.reportChat, html }),
    });
    for (const item of sent) console.log(`[reports] отправлен ${item.kind} за ${item.period}`);
  } catch (error) {
    console.error('[reports]', error.message);
  }
}

server.listen(config.port, () => {
  console.log(`[pacman-analytics] слушает порт ${config.port}, база ${config.dbPath}, часовой пояс ${config.timezone}`);
  console.log(admin ? '[pacman-analytics] админка включена: /admin/' : '[pacman-analytics] ADMIN_PASSWORD не задан: админка выключена');
  if (!config.botToken || !config.reportChat) console.log('[pacman-analytics] TG_BOT_TOKEN или TG_REPORT_CHAT_ID не заданы: события пишутся, отчёты не отправляются');
  if (config.buildOnStart) {
    if (admin) admin.buildNow();
    else console.log('[pacman-analytics] BUILD_ON_START задан, но без ADMIN_PASSWORD сборка не запускается');
  }
  tick();
  setInterval(tick, 5 * 60 * 1000).unref();
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
