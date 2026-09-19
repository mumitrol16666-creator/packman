// Сайт может жить не в корне домена (превью на GitHub Pages лежит в /packman/),
// поэтому все внутренние ссылки и файлы из public/ строятся через url().
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export function url(path = '/') {
  return `${base}${path}`;
}
