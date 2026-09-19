import branches from '../data/branches.json';
import site from '../data/site.json';

export { branches, site };

const photoModules = import.meta.glob('/src/assets/photos/*/*.{jpg,jpeg,png,webp}', { eager: true });

/** Фото филиала, отсортированные по имени файла. У филиала без съёмки — пустой массив. */
export function photosOf(slug) {
  return Object.entries(photoModules)
    .filter(([path]) => path.includes(`/photos/${slug}/`))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, mod]) => mod.default);
}

export function formatPrice(value) {
  return value.toLocaleString('ru-RU').replace(/ /g, ' ');
}

export function minHourPrice(branch) {
  return Math.min(...branch.zones.map((z) => z.prices.h1));
}

/** Максимальная герцовка из подписи зоны: «4K · 240 Гц» → 240, «280–420 Гц» → 420. */
export function maxHz(zone) {
  const numbers = (zone.hz.match(/\d+(?!\d*K)/g) || []).map(Number);
  return numbers.length ? Math.max(...numbers) : 0;
}

export function gisUrl(branch) {
  return `https://2gis.kz/aktobe/firm/${branch.gisFirmId}`;
}

export function phonePretty(phone) {
  const d = phone.replace(/\D/g, '');
  return `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9, 11)}`;
}
