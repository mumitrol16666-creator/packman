// Все периоды отчётов считаются по местному времени клуба (по умолчанию Asia/Aqtobe), а не по времени сервера.

const formatters = new Map();

function formatter(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }),
    );
  }
  return formatters.get(timeZone);
}

/** Местные дата и час для момента времени: { day: '2026-09-19', hour: 21 }. */
export function localParts(ts, timeZone) {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(new Date(ts)).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24 };
}

const toUtc = (day) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const toDay = (date) => date.toISOString().slice(0, 10);

export function addDays(day, n) {
  const date = toUtc(day);
  date.setUTCDate(date.getUTCDate() + n);
  return toDay(date);
}

/** 0 — понедельник, 6 — воскресенье. */
export function weekdayIndex(day) {
  return (toUtc(day).getUTCDay() + 6) % 7;
}

export function weekStart(day) {
  return addDays(day, -weekdayIndex(day));
}

export function monthStart(day) {
  return `${day.slice(0, 7)}-01`;
}

export function previousMonth(day) {
  const lastOfPrevious = addDays(monthStart(day), -1);
  return { from: monthStart(lastOfPrevious), to: lastOfPrevious };
}

export function daysBetween(from, to) {
  return Math.round((toUtc(to) - toUtc(from)) / 86400000) + 1;
}

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const WEEKDAYS_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const PREVIOUS_WEEKDAY = ['прошлому понедельнику', 'прошлому вторнику', 'прошлой среде', 'прошлому четвергу', 'прошлой пятнице', 'прошлой субботе', 'прошлому воскресенью'];
const WEEKDAYS_NOM = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];

export function humanDay(day) {
  const [, m, d] = day.split('-').map(Number);
  return `${d} ${MONTHS_GEN[m - 1]} (${WEEKDAYS_SHORT[weekdayIndex(day)]})`;
}

export function humanRange(from, to) {
  const [, fm, fd] = from.split('-').map(Number);
  const [, tm, td] = to.split('-').map(Number);
  return fm === tm ? `${fd}–${td} ${MONTHS_GEN[tm - 1]}` : `${fd} ${MONTHS_GEN[fm - 1]} – ${td} ${MONTHS_GEN[tm - 1]}`;
}

export function humanMonth(day) {
  const [y, m] = day.split('-').map(Number);
  return `${MONTHS_NOM[m - 1]} ${y}`;
}

/** «прошлой пятнице», «прошлому вторнику»: с чем сравнивается дневной отчёт. */
export const previousWeekday = (day) => PREVIOUS_WEEKDAY[weekdayIndex(day)];
export const weekdayName = (index) => WEEKDAYS_NOM[index];
