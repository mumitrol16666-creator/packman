import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { MIN_PASSWORD_LENGTH, createLoginLimiter, createSessions, passwordMatches, readCookie, sessionCookie } from './auth.js';
import { createBuilder } from './builder.js';
import { createContentStore } from './content.js';
import { PhotoError, createPhotoStore } from './photos.js';
import { pricesChanged, validateBranches, validateEvents, validateSite } from './schema.js';
import { serveFile } from './static.js';

const UI_DIR = fileURLToPath(new URL('./ui/', import.meta.url));
const JSON_LIMIT = 1024 * 1024;
const IMAGE_LIMIT = 20 * 1024 * 1024;
const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
};

function readBuffer(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('Слишком большой файл'), { status: 413 }));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Админка: вход по паролю, правка контента, фото и публикация.
 * Возвращает обработчик (req, res, path, ip) → true, если запрос относился к админке.
 */
export function createAdmin({ db, config, clientIp }) {
  if (!config.adminPassword) return null;
  if (config.adminPassword.length < MIN_PASSWORD_LENGTH) {
    console.log(`[admin] ADMIN_PASSWORD короче ${MIN_PASSWORD_LENGTH} символов: админка выключена`);
    return null;
  }

  const sessions = createSessions(db, config.adminPassword);
  const limiter = createLoginLimiter();
  const content = createContentStore(config.projectRoot, join(config.dataDir, 'backups'));
  const photos = createPhotoStore(config.projectRoot);
  const builder = createBuilder({ projectRoot: config.projectRoot, siteDir: config.siteDir });

  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers });
    res.end(JSON.stringify(body));
  };
  const today = () => new Date().toISOString().slice(0, 10);

  function saveContent(name, input) {
    const branches = content.read('branches');
    const slugs = branches.map((b) => b.slug);
    const result =
      name === 'branches' ? validateBranches(input, slugs)
      : name === 'site' ? validateSite(input)
      : validateEvents(input, slugs);
    if (result.errors.length) return { errors: result.errors };

    if (name === 'branches' && pricesChanged(branches, result.data)) {
      const site = content.read('site');
      content.write('site', { ...site, pricesUpdated: today() });
    }
    if (name === 'events') {
      // афиши удалённых событий не должны копиться на диске
      const kept = new Set(result.data.map((e) => e.id));
      for (const old of content.read('events')) if (!kept.has(old.id)) photos.removeAll('events', old.id);
    }
    content.write(name, result.data);
    builder.request();
    return { data: result.data };
  }

  return async function handle(req, res, path) {
    if (path !== '/admin' && !path.startsWith('/admin/')) return false;
    if (path === '/admin') {
      res.writeHead(302, { Location: '/admin/' }).end();
      return true;
    }

    const secure = req.headers['x-forwarded-proto'] === 'https';
    const authed = sessions.verify(readCookie(req));

    try {
      // --- интерфейс: страница и её файлы открыты, данные — только после входа
      if (!path.startsWith('/admin/api/')) {
        if (req.method !== 'GET') return send(res, 405, { error: 'Метод не поддерживается' }), true;
        const file = path === '/admin/' ? '/index.html' : path.slice('/admin'.length);
        if (!serveFile(res, UI_DIR, file, { cache: 'no-cache', headers: SECURITY_HEADERS })) send(res, 404, { error: 'Не найдено' });
        return true;
      }

      const route = path.slice('/admin/api'.length);

      // защита от подделки запросов с чужих сайтов: свой заголовок браузер не даст выставить постороннему сайту
      if (req.method !== 'GET' && req.headers['x-pacman-admin'] !== '1') return send(res, 403, { error: 'Запрос отклонён' }), true;

      if (route === '/login' && req.method === 'POST') {
        const ip = clientIp(req);
        if (limiter.blocked(ip)) return send(res, 429, { error: 'Слишком много попыток. Подождите 15 минут.' }), true;
        const body = JSON.parse((await readBuffer(req, 4096)).toString('utf8') || '{}');
        if (!passwordMatches(body.password, config.adminPassword)) {
          limiter.fail(ip);
          return send(res, 401, { error: 'Неверный пароль' }), true;
        }
        limiter.reset(ip);
        return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(sessions.issue(), secure) }), true;
      }
      if (route === '/session' && req.method === 'GET') return send(res, 200, { authed }), true;
      if (route === '/logout' && req.method === 'POST') return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', secure) }), true;

      if (!authed) return send(res, 401, { error: 'Нужно войти' }), true;

      if (route === '/content' && req.method === 'GET') {
        return send(res, 200, { branches: content.read('branches'), site: content.read('site'), events: content.read('events'), build: builder.status() }), true;
      }

      const contentMatch = route.match(/^\/content\/(branches|site|events)$/);
      if (contentMatch && req.method === 'PUT') {
        const input = JSON.parse((await readBuffer(req, JSON_LIMIT)).toString('utf8'));
        const result = saveContent(contentMatch[1], input);
        if (result.errors) return send(res, 422, { errors: result.errors }), true;
        return send(res, 200, { data: result.data, site: content.read('site'), build: builder.status() }), true;
      }

      if (route === '/build' && req.method === 'GET') return send(res, 200, builder.status()), true;
      if (route === '/build' && req.method === 'POST') {
        builder.request({ photosChanged: true });
        return send(res, 200, builder.status()), true;
      }

      const photoMatch = route.match(/^\/photos\/(clubs|events)\/([a-z0-9-]+)(?:\/(order|[^/]+?)(\/thumb)?)?$/);
      if (photoMatch) {
        const [, scope, id, file, thumb] = photoMatch;
        if (!file && req.method === 'GET') return send(res, 200, { photos: photos.list(scope, id) }), true;
        if (!file && req.method === 'POST') {
          const list = await photos.upload(scope, id, await readBuffer(req, IMAGE_LIMIT));
          builder.request({ photosChanged: scope === 'clubs' });
          return send(res, 200, { photos: list }), true;
        }
        if (file === 'order' && req.method === 'PUT') {
          const body = JSON.parse((await readBuffer(req, JSON_LIMIT)).toString('utf8'));
          const list = photos.reorder(scope, id, body.names);
          builder.request({ photosChanged: scope === 'clubs' });
          return send(res, 200, { photos: list }), true;
        }
        if (file && thumb && req.method === 'GET') {
          const image = await photos.thumbnail(scope, id, decodeURIComponent(file));
          res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600', ...SECURITY_HEADERS }).end(image);
          return true;
        }
        if (file && !thumb && req.method === 'DELETE') {
          const list = photos.remove(scope, id, decodeURIComponent(file));
          builder.request({ photosChanged: scope === 'clubs' });
          return send(res, 200, { photos: list }), true;
        }
      }

      return send(res, 404, { error: 'Не найдено' }), true;
    } catch (error) {
      if (error instanceof PhotoError) return send(res, 400, { error: error.message }), true;
      if (error instanceof SyntaxError) return send(res, 400, { error: 'Запрос не удалось разобрать' }), true;
      if (error.status === 413) return send(res, 413, { error: 'Файл больше 20 МБ' }), true;
      console.error('[admin]', error);
      return send(res, 500, { error: 'Внутренняя ошибка. Подробности в журнале сервера.' }), true;
    }
  };
}
