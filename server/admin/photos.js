import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.(jpg|jpeg|png|webp)$/i;
const SCOPES = { clubs: 'src/assets/photos', events: 'src/assets/events' };
const MAX_WIDTH = 2400;
const MAX_PHOTOS = 40;

export class PhotoError extends Error {}

/** Фото клубов и афиши событий лежат в папках по коду: src/assets/photos/<клуб>/, src/assets/events/<событие>/. */
export function createPhotoStore(projectRoot) {
  function dirOf(scope, id) {
    if (!SCOPES[scope] || !ID.test(id || '')) throw new PhotoError('Неверный адрес папки с фото');
    const base = resolve(projectRoot, SCOPES[scope]);
    const dir = resolve(base, id);
    if (!dir.startsWith(base + sep)) throw new PhotoError('Неверный адрес папки с фото');
    return dir;
  }

  function fileOf(scope, id, name) {
    if (!FILE.test(name || '')) throw new PhotoError('Неверное имя файла');
    return join(dirOf(scope, id), name);
  }

  function list(scope, id) {
    const dir = dirOf(scope, id);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((name) => FILE.test(name))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name, size: statSync(join(dir, name)).size }));
  }

  /**
   * Порядок фото на сайте — это порядок имён файлов, первое фото становится обложкой.
   * Поэтому файлы получают номер в начале имени: 01-…, 02-…
   */
  function applyOrder(scope, id, names) {
    const dir = dirOf(scope, id);
    const bare = (name) => name.replace(/^\d{2}-/, '');
    // два прохода: сначала во временные имена, чтобы новые номера не наступали на ещё не переименованные файлы
    names.forEach((name, i) => renameSync(join(dir, name), join(dir, `.reorder-${i}`)));
    names.forEach((name, i) => renameSync(join(dir, `.reorder-${i}`), join(dir, `${String(i + 1).padStart(2, '0')}-${bare(name)}`)));
  }

  function reorder(scope, id, names) {
    const current = list(scope, id).map((p) => p.name);
    if (!Array.isArray(names) || names.length !== current.length || [...names].sort().join('|') !== [...current].sort().join('|')) {
      throw new PhotoError('Список фото устарел: обновите страницу и повторите');
    }
    applyOrder(scope, id, names);
    return list(scope, id);
  }

  /** Фото поворачивается по EXIF, уменьшается до разумного размера и сохраняется как JPEG без метаданных (в них бывает геопозиция). */
  async function upload(scope, id, buffer) {
    const dir = dirOf(scope, id);
    const existing = list(scope, id).map((p) => p.name);
    if (existing.length >= MAX_PHOTOS) throw new PhotoError(`В папке уже ${MAX_PHOTOS} фото: удалите лишние`);
    let sharp;
    try {
      sharp = (await import('sharp')).default;
    } catch {
      throw new PhotoError('На сервере не установлен модуль обработки изображений (sharp)');
    }
    let output;
    try {
      output = await sharp(buffer, { failOn: 'error' }).rotate().resize({ width: MAX_WIDTH, withoutEnlargement: true }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    } catch {
      throw new PhotoError('Файл не похож на изображение: нужны JPEG, PNG или WebP');
    }
    mkdirSync(dir, { recursive: true });
    if (existing.length) applyOrder(scope, id, existing);
    const name = `${String(existing.length + 1).padStart(2, '0')}-${randomBytes(4).toString('hex')}.jpg`;
    writeFileSync(join(dir, name), output);
    return list(scope, id);
  }

  function remove(scope, id, name) {
    const file = fileOf(scope, id, name);
    if (!existsSync(file)) throw new PhotoError('Такого фото уже нет');
    unlinkSync(file);
    return list(scope, id);
  }

  function removeAll(scope, id) {
    const dir = dirOf(scope, id);
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }

  const thumbs = new Map();
  async function thumbnail(scope, id, name) {
    const file = fileOf(scope, id, name);
    if (!existsSync(file)) throw new PhotoError('Такого фото нет');
    const key = `${file}:${statSync(file).mtimeMs}`;
    if (!thumbs.has(key)) {
      if (thumbs.size > 300) thumbs.clear();
      const sharp = (await import('sharp')).default;
      thumbs.set(key, await sharp(file).resize({ width: 480 }).jpeg({ quality: 72 }).toBuffer());
    }
    return thumbs.get(key);
  }

  return { list, upload, remove, removeAll, reorder, thumbnail };
}
