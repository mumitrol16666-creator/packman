import allBranches from '../data/branches.json';
import site from '../data/site.json';
import allEvents from '../data/events.json';

/** Клуб можно скрыть из админки (hidden: true), не удаляя его данные. */
const branches = allBranches.filter((b) => !b.hidden);

export { branches, site };

const eventImages = import.meta.glob('/src/assets/events/*/*.{jpg,jpeg,png,webp}', { eager: true });

/** Предстоящие и идущие события: прошедшие скрываются сами на следующий день после даты окончания. */
export function upcomingEvents(today = new Date().toISOString().slice(0, 10)) {
  return allEvents
    .filter((e) => !e.hidden && (e.dateEnd || e.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({
      ...e,
      image: Object.entries(eventImages).filter(([path]) => path.includes(`/events/${e.id}/`)).sort(([a], [b]) => a.localeCompare(b)).map(([, mod]) => mod.default)[0] || null,
    }));
}

const photoModules = import.meta.glob('/src/assets/photos/*/*.{jpg,jpeg,png,webp}', { eager: true });

/** Фото филиала, отсортированные по имени файла. У филиала без съёмки — пустой массив. */
export function photosOf(slug) {
  return Object.entries(photoModules)
    .filter(([path]) => path.includes(`/photos/${slug}/`))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, mod]) => mod.default);
}

export function formatPrice(value) {
  return value.toLocaleString('ru-RU').replace(/\u00a0/g, '\u202f');
}

export function minHourPrice(branch) {
  return Math.min(...branch.zones.map((z) => z.prices.h1));
}

/** Максимальная герцовка из подписи зоны: «4K · 240 Гц» → 240, «280–420 Гц» → 420. */
export function maxHz(zone) {
  const numbers = (zone.hz.match(/\d+(?!\d*K)/g) || []).map(Number);
  return numbers.length ? Math.max(...numbers) : 0;
}

export function reviewsUrl(branch) {
  return `https://2gis.kz/aktobe/firm/${branch.gisFirmId}/tab/reviews`;
}

export function ratingValue(value) {
  return value.toFixed(1).replace('.', ',');
}

/** Средний рейтинг сети, взвешенный по числу оценок в каждом клубе. */
export function networkRating() {
  const rated = branches.filter((b) => b.rating);
  const count = rated.reduce((sum, b) => sum + b.rating.count, 0);
  const value = rated.reduce((sum, b) => sum + b.rating.value * b.rating.count, 0) / count;
  return { value, count };
}

export function gisUrl(branch) {
  return `https://2gis.kz/aktobe/firm/${branch.gisFirmId}`;
}

export function phonePretty(phone) {
  const d = phone.replace(/\D/g, '');
  return `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9, 11)}`;
}
