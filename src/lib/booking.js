const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const DAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MONTHS_KK = ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан'];
const DAYS_KK = ['жексенбі', 'дүйсенбі', 'сейсенбі', 'сәрсенбі', 'бейсенбі', 'жұма', 'сенбі'];
// без похожих символов (0/O, 1/I), чтобы код легко диктовался и сверялся
const CODE_ALPHABET = 'ABCDEFGHJKLMNPRSTUVWXYZ23456789';

export const MAX_PEOPLE = 20;
const NIGHT_PACKAGES = ['night', 'turbo'];

export function plural(n, one, few, many) {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}

/** Ночью (22:00–08:00) по правилам клуба и закону РК вход только с 18 лет. durationId — 'night', 'turbo', 'h3' и т. п. */
export function isAdultsOnly(time, durationId = '') {
  const hour = Number(time.slice(0, 2));
  return hour >= 22 || hour < 8 || NIGHT_PACKAGES.includes(durationId);
}

/** true, если выбранные дата и время уже прошли (сравнение по локальному времени посетителя). */
export function isPast(date, time, now = new Date()) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm).getTime() < now.getTime() - 5 * 60 * 1000;
}

export function formatDate(iso, lang = 'ru') {
  const [y, m, d] = iso.split('-').map(Number);
  const weekday = new Date(y, m - 1, d).getDay();
  return lang === 'kk' ? `${d} ${MONTHS_KK[m - 1]} (${DAYS_KK[weekday]})` : `${d} ${MONTHS[m - 1]} (${DAYS[weekday]})`;
}

export function makeCode(random = Math.random) {
  let code = '';
  for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return code;
}

/**
 * Текст заявки для WhatsApp.
 * duration: null | { kind: 'hours', hours: 3 } | { kind: 'package', name: 'Ночь', from: '23:00', to: '08:00' }
 * @param {{branchName: string, date: string, time: string, people: number, zoneName?: string,
 *   duration?: object | null, together?: boolean, code: string, lang?: 'ru' | 'kk'}} b
 */
export function buildMessage(b) {
  return b.lang === 'kk' ? messageKk(b) : messageRu(b);
}

function messageRu(b) {
  const n = b.people;
  const pcs = `${n} ${plural(n, 'компьютер', 'компьютера', 'компьютеров')}`;
  let text = `Здравствуйте! ${n === 1 ? 'Хочу' : 'Хотим'} забронировать ${pcs} в Pacman ${b.branchName} на ${formatDate(b.date)} в ${b.time}`;
  if (b.duration?.kind === 'hours') text += `, на ${b.duration.hours} ${plural(b.duration.hours, 'час', 'часа', 'часов')}`;
  if (b.duration?.kind === 'package') text += `, пакет «${b.duration.name}»`;
  text += '.';
  if (b.zoneName) text += `\nЗона: ${b.zoneName}.`;
  if (n > 1 && b.together) text += '\nЖелательно места рядом.';
  return `${text}\n\nЗаявка с сайта #${b.code}`;
}

// В казахском тексте данные идут списком: так не нужны падежные окончания у чисел, дат и названий.
function messageKk(b) {
  const n = b.people;
  const lines = [
    `Сәлеметсіз бе! Pacman ${b.branchName} клубында орын ${n === 1 ? 'брондағым' : 'брондағымыз'} келеді.`,
    `Күні: ${formatDate(b.date, 'kk')}`,
    `Уақыты: ${b.time}`,
    `Компьютер саны: ${n}`,
  ];
  if (b.duration?.kind === 'hours') lines.push(`Ұзақтығы: ${b.duration.hours} сағат`);
  if (b.duration?.kind === 'package') lines.push(`Пакет: ${b.duration.name}, ${b.duration.from}–${b.duration.to}`);
  if (b.zoneName) lines.push(`Аймақ: ${b.zoneName}`);
  if (n > 1 && b.together) lines.push('Орындар қатар болса екен.');
  return `${lines.join('\n')}\n\nСайттан өтінім #${b.code}`;
}

export function whatsappUrl(number, text) {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
