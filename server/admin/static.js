import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff',
};

/**
 * Отдаёт файл из папки root по адресу urlPath. Возвращает false, если файла нет.
 * Адрес проверяется так, чтобы нельзя было выйти за пределы папки.
 */
export function serveFile(res, root, urlPath, { cache = 'no-cache', status = 200, headers = {} } = {}) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return false;
  }
  if (decoded.includes('\0')) return false;
  const base = resolve(root);
  let file = resolve(base, `.${decoded}`);
  if (file !== base && !file.startsWith(base + sep)) return false;
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file) || !statSync(file).isFile()) return false;
  res.writeHead(status, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': cache, ...headers });
  createReadStream(file).pipe(res);
  return true;
}
