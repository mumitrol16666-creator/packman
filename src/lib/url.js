import { langPrefix } from '../i18n/index.js';

// Сайт может жить не в корне домена (превью на GitHub Pages лежит в /packman/),
// поэтому все внутренние ссылки и файлы из public/ строятся через url().
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Ссылка на страницу сайта с учётом подпапки и языка: url('/clubs/gold/', 'kk') → /kz/clubs/gold/ */
export function url(path = '/', lang = 'ru') {
  return `${base}${langPrefix(lang)}${path}`;
}

/** Файл из public/: язык на адрес не влияет. */
export function asset(path) {
  return `${base}${path}`;
}
