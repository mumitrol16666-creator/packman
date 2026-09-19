import { collectStats } from './stats.js';
import { addDays, daysBetween, humanDay, humanMonth, humanRange, previousMonth, previousWeekday, weekdayIndex, weekdayName } from './time.js';

const SOURCE_LABELS = {
  instagram: 'Instagram', '2gis': '2ГИС', google: 'Google', yandex: 'Яндекс', tiktok: 'TikTok', telegram: 'Telegram',
  whatsapp: 'WhatsApp', facebook: 'Facebook', youtube: 'YouTube', taplink: 'Taplink', direct: 'прямые заходы',
};
const SECTION_LABELS = { clubs: 'Клубы', prices: 'Цены', promos: 'Акции', features: 'Удобства', booking: 'Бронь', rules: 'Правила', photos: 'Фото' };
const DEVICE_LABELS = { mobile: 'телефоны', tablet: 'планшеты', desktop: 'компьютеры' };

const num = (n) => n.toLocaleString('ru-RU');
const pct = (part, total) => (total ? `${Math.round((part / total) * 100)}%` : '0%');
const escapeHtml = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const clubName = (slug) => slug.charAt(0).toUpperCase() + slug.slice(1);

function duration(sec) {
  if (!sec) return 'нет данных';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `≈ ${m} мин ${s} с` : `≈ ${s} с`;
}

/** «+12% к прошлой неделе», «−3 к прошлой пятнице». Для маленьких чисел проценты обманчивы, поэтому там разница в штуках. */
function delta(current, previous, label) {
  if (!previous) return '';
  const diff = current - previous;
  if (diff === 0) return ` (без изменений к ${label})`;
  const sign = diff > 0 ? '+' : '−';
  const value = previous < 20 ? num(Math.abs(diff)) : `${Math.round((Math.abs(diff) / previous) * 100)}%`;
  return ` (${sign}${value} к ${label})`;
}

function shares(rows, key, labels, total, limit = 5) {
  return rows
    .slice(0, limit)
    .map((r) => `${escapeHtml(labels[r[key]] || r[key])} ${pct(r.n, total)}`)
    .join(' · ');
}

function counts(rows, limit = 6) {
  return rows.slice(0, limit).map((r) => `${clubName(r.branch)} ${num(r.n)}`).join(' · ');
}

function contactsLine(c) {
  const parts = [
    ['WhatsApp напрямую', c.whatsapp_direct],
    ['звонки', c.phone],
    ['маршрут в 2ГИС', c.route_2gis],
    ['Instagram', c.instagram],
    ['отзывы в 2ГИС', c.reviews_2gis],
  ].filter(([, n]) => n > 0);
  return parts.length ? parts.map(([label, n]) => `${label} ${num(n)}`).join(' · ') : 'не было';
}

function body(stats, previous, previousLabel) {
  const lines = [
    `👥 Посетители: <b>${num(stats.visitors)}</b>${delta(stats.visitors, previous.visitors, previousLabel)}`,
    `Визиты: ${num(stats.sessions)} · просмотры страниц: ${num(stats.pageviews)}`,
    `⏱ Среднее время на сайте: ${duration(stats.avgEngagedSec)}`,
    '',
    `🎯 Заявки на бронь: <b>${num(stats.bookings)}</b>${delta(stats.bookings, previous.bookings, previousLabel)} · конверсия ${(stats.conversion * 100).toFixed(1).replace('.', ',')}%`,
  ];
  if (stats.bookingsByBranch.length) lines.push(counts(stats.bookingsByBranch));
  lines.push(`📞 Другие контакты: ${contactsLine(stats.contacts)}`, '');
  lines.push(`🔗 Источники: ${shares(stats.sources, 'source', SOURCE_LABELS, stats.sessions)}`);
  if (stats.clubViews.length) lines.push(`🏠 Страницы клубов: ${counts(stats.clubViews)}`);
  if (stats.devices.length) lines.push(`📱 Устройства: ${shares(stats.devices, 'device', DEVICE_LABELS, stats.sessions, 3)}`);
  return lines;
}

function extras(stats) {
  const lines = [];
  if (stats.sections.length) lines.push(`📖 Дошли до раздела: ${shares(stats.sections, 'section', SECTION_LABELS, stats.sessions, 6)}`);
  if (stats.kazakhSessions) lines.push(`🌐 Казахская версия сайта: ${pct(stats.kazakhSessions, stats.sessions)} визитов`);
  if (stats.peakHours.length) lines.push(`⏰ Пик посещений: ${stats.peakHours.map((h) => `${String(h.hour).padStart(2, '0')}:00`).join(', ')}`);
  const best = [...stats.byDay].sort((a, b) => b.n - a.n)[0];
  if (best) lines.push(`📅 Лучший день: ${humanDay(best.day)}, визитов: ${num(best.n)}`);
  return lines;
}

const EMPTY = 'За этот период посещений не было. Если сайт работал, проверь, что счётчик подключён: переменная PUBLIC_TRACK_URL при сборке сайта и адрес сервиса /api/track.';
const FOOTNOTE = '<i>Заявка — это нажатие «Открыть WhatsApp» с готовым текстом. Отправил ли человек сообщение, видно только в WhatsApp клуба: сверяйте по коду заявки.</i>';

export function dailyReport(db, day, siteName) {
  const stats = collectStats(db, day, day);
  const weekAgo = addDays(day, -7);
  const previous = collectStats(db, weekAgo, weekAgo);
  const head = [`📊 <b>${escapeHtml(siteName)}</b>`, `Отчёт за ${humanDay(day)}`, ''];
  if (!stats.sessions) return [...head, EMPTY].join('\n');
  return [...head, ...body(stats, previous, previousWeekday(day))].join('\n');
}

export function weeklyReport(db, from, siteName) {
  const to = addDays(from, 6);
  const stats = collectStats(db, from, to);
  const previous = collectStats(db, addDays(from, -7), addDays(from, -1));
  const head = [`📊 <b>${escapeHtml(siteName)}</b>`, `Итоги недели, ${humanRange(from, to)}`, ''];
  if (!stats.sessions) return [...head, EMPTY].join('\n');
  return [...head, ...body(stats, previous, 'прошлой неделе'), '', ...extras(stats), '', FOOTNOTE].join('\n');
}

export function monthlyReport(db, from, to, siteName) {
  const stats = collectStats(db, from, to);
  const prev = previousMonth(from);
  const previous = collectStats(db, prev.from, prev.to);
  const head = [`📊 <b>${escapeHtml(siteName)}</b>`, `Итоги месяца: ${humanMonth(from)}`, ''];
  if (!stats.sessions) return [...head, EMPTY].join('\n');

  const lines = [...head, ...body(stats, previous, 'прошлому месяцу'), '', ...extras(stats)];
  lines.push(`В среднем за день: визитов ${num(Math.round(stats.sessions / daysBetween(from, to)))}, заявок ${(stats.bookings / daysBetween(from, to)).toFixed(1).replace('.', ',')}`);

  const byWeekday = Array.from({ length: 7 }, () => 0);
  for (const d of stats.byDay) byWeekday[weekdayIndex(d.day)] += d.n;
  const topWeekday = byWeekday.indexOf(Math.max(...byWeekday));
  lines.push(`Самый активный день недели: ${weekdayName(topWeekday)}`);

  if (stats.bookingsByBranch.length > 1) {
    const first = stats.bookingsByBranch[0];
    const last = stats.bookingsByBranch[stats.bookingsByBranch.length - 1];
    lines.push(`Больше всего заявок: ${clubName(first.branch)} (${num(first.n)}), меньше всего: ${clubName(last.branch)} (${num(last.n)})`);
  }
  return [...lines, '', FOOTNOTE].join('\n');
}

export function bookingNotice(e) {
  const parts = [`🟡 <b>Заявка с сайта${e.code ? ` #${e.code}` : ''}</b>`, `Pacman ${clubName(e.branch || 'клуб')}`];
  if (e.zone) parts.push(`зона: ${escapeHtml(e.zone)}`);
  if (e.value) parts.push(`человек: ${e.value}`);
  return `${parts.join(' · ')}\nЧеловек открыл WhatsApp с готовым текстом. Сообщение должно прийти в чат клуба.`;
}
