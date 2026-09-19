import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const COOKIE = 'pm_admin';
export const MIN_PASSWORD_LENGTH = 8;

const sha256 = (value) => createHash('sha256').update(value).digest();

/** Сравнение без утечки времени: сравниваются хэши, поэтому длина пароля тоже не раскрывается. */
export function passwordMatches(given, expected) {
  if (typeof given !== 'string' || !expected) return false;
  return timingSafeEqual(sha256(given), sha256(expected));
}

function adminSecret(db) {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'admin_secret'").get();
  if (row) return row.value;
  const value = randomBytes(32).toString('hex');
  db.prepare("INSERT INTO meta (key, value) VALUES ('admin_secret', ?)").run(value);
  return value;
}

/**
 * Сессия — подписанная метка времени в куке. Ключ подписи зависит от пароля,
 * поэтому смена ADMIN_PASSWORD сразу выбрасывает всех из админки.
 */
export function createSessions(db, password) {
  const key = sha256(`${adminSecret(db)}|${password}`);
  const sign = (expires) => createHmac('sha256', key).update(`admin|${expires}`).digest('hex');

  return {
    issue(now = Date.now()) {
      const expires = now + SESSION_TTL_MS;
      return `${expires}.${sign(expires)}`;
    },
    verify(token, now = Date.now()) {
      if (typeof token !== 'string') return false;
      const [expires, signature] = token.split('.');
      if (!/^\d{13}$/.test(expires || '') || !/^[0-9a-f]{64}$/.test(signature || '')) return false;
      if (Number(expires) < now) return false;
      return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(Number(expires)), 'hex'));
    },
  };
}

export function readCookie(req) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) return rest.join('=');
  }
  return null;
}

export function sessionCookie(token, secure) {
  const maxAge = token ? Math.floor(SESSION_TTL_MS / 1000) : 0;
  return `${COOKIE}=${token || ''}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

/** Не больше limit попыток входа за окно с одного адреса. */
export function createLoginLimiter(limit = 8, windowMs = 15 * 60 * 1000) {
  const attempts = new Map();
  return {
    blocked(ip, now = Date.now()) {
      const entry = attempts.get(ip);
      return Boolean(entry && now - entry.start <= windowMs && entry.count >= limit);
    },
    fail(ip, now = Date.now()) {
      const entry = attempts.get(ip);
      if (!entry || now - entry.start > windowMs) attempts.set(ip, { start: now, count: 1 });
      else entry.count += 1;
    },
    reset(ip) {
      attempts.delete(ip);
    },
  };
}
