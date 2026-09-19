import { createHash } from 'node:crypto';
import { localParts } from './time.js';

const EVENT_RE = /^[a-z0-9_]{1,40}$/;
const SLUG_RE = /^[a-z0-9-]{1,40}$/;
const SESSION_RE = /^[A-Za-z0-9-]{8,64}$/;
const CODE_RE = /^[A-Z0-9]{4}$/;
const DEVICES = new Set(['mobile', 'tablet', 'desktop']);
const BOT_RE = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python|axios|node-fetch|go-http/i;

const UTM_ALIASES = { ig: 'instagram', insta: 'instagram', inst: 'instagram', '2gis': '2gis', dgis: '2gis', tg: 'telegram', wa: 'whatsapp', fb: 'facebook', yt: 'youtube' };

const REFERRERS = [
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)2gis\.[a-z.]+$/, '2gis'],
  [/(^|\.)google\.[a-z.]+$/, 'google'],
  [/(^|\.)(yandex\.[a-z.]+|ya\.ru)$/, 'yandex'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)(t\.me|telegram\.org)$/, 'telegram'],
  [/(^|\.)(wa\.me|whatsapp\.com)$/, 'whatsapp'],
  [/(^|\.)(facebook\.com|fb\.com)$/, 'facebook'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
  [/(^|\.)taplink\.[a-z]+$/, 'taplink'],
];

/** Источник визита: метка utm_source важнее реферера; без обоих — прямой заход. */
export function classifySource({ source, referrer }) {
  if (typeof source === 'string' && source.trim()) {
    const key = source.trim().toLowerCase().slice(0, 40);
    return UTM_ALIASES[key] || key;
  }
  if (typeof referrer === 'string' && referrer) {
    const host = referrer.toLowerCase().replace(/^www\./, '').slice(0, 80);
    for (const [re, name] of REFERRERS) if (re.test(host)) return name;
    return host;
  }
  return 'direct';
}

export function isBot(userAgent) {
  return !userAgent || BOT_RE.test(userAgent);
}

/** Посетитель обезличен: хэш от суточной соли, IP и браузера. Сам IP никуда не записывается. */
export function visitorHash(secret, day, ip, userAgent) {
  return createHash('sha256').update(`${secret}|${day}|${ip}|${userAgent}`).digest('hex').slice(0, 16);
}

const slug = (v) => (typeof v === 'string' && SLUG_RE.test(v) ? v : null);

/**
 * Проверяет присланное событие и превращает его в строку для базы.
 * Возвращает null для мусора и ботов: такие запросы молча отбрасываются.
 */
export function normalizeEvent(body, { ip, userAgent, secret, timezone, now = Date.now() }) {
  if (!body || typeof body !== 'object' || isBot(userAgent)) return null;
  if (typeof body.event !== 'string' || !EVENT_RE.test(body.event)) return null;
  if (typeof body.session !== 'string' || !SESSION_RE.test(body.session)) return null;
  if (typeof body.path !== 'string' || !body.path.startsWith('/')) return null;

  const { day, hour } = localParts(now, timezone);
  const clubPage = body.path.match(/^(?:\/kz)?\/clubs\/([a-z0-9-]+)\//);
  const number = Number.isFinite(body.ms) ? body.ms : Number.isFinite(body.people) ? body.people : null;

  return {
    ts: now,
    day,
    hour,
    event: body.event,
    path: body.path.split(/[?#]/)[0].slice(0, 200),
    visitor: visitorHash(secret, day, ip, userAgent),
    session: body.session,
    device: DEVICES.has(body.device) ? body.device : null,
    source: classifySource(body),
    campaign: typeof body.campaign === 'string' ? body.campaign.slice(0, 60) : null,
    branch: slug(body.branch) || (clubPage ? clubPage[1] : null),
    zone: slug(body.zone),
    section: slug(body.section),
    value: number === null ? null : Math.max(0, Math.min(Math.round(number), 30 * 60 * 1000)),
    code: typeof body.code === 'string' && CODE_RE.test(body.code) ? body.code : null,
    lang: body.lang === 'kk' || body.path.startsWith('/kz/') ? 'kk' : 'ru',
  };
}

/** Не больше limit событий в минуту с одного посетителя: защита от накрутки и зацикленных скриптов. */
export function createRateLimiter(limit = 120, windowMs = 60_000) {
  const hits = new Map();
  return function allow(key, now = Date.now()) {
    if (hits.size > 5000) for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
    const entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}
