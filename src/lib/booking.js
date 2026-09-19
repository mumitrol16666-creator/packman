const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const DAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
// без похожих символов (0/O, 1/I), чтобы код легко диктовался и сверялся
const CODE_ALPHABET = 'ABCDEFGHJKLMNPRSTUVWXYZ23456789';

export const MAX_PEOPLE = 20;

export function plural(n, one, few, many) {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}

export function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${d} ${MONTHS[m - 1]} (${DAYS[date.getDay()]})`;
}

export function makeCode(random = Math.random) {
  let code = '';
  for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return code;
}

/**
 * @param {{branchName: string, date: string, time: string, people: number,
 *   zoneName?: string, duration?: string, together?: boolean, code: string}} b
 */
export function buildMessage(b) {
  const n = b.people;
  const pcs = `${n} ${plural(n, 'компьютер', 'компьютера', 'компьютеров')}`;
  let text = `Здравствуйте! ${n === 1 ? 'Хочу' : 'Хотим'} забронировать ${pcs} в Pacman ${b.branchName} на ${formatDate(b.date)} в ${b.time}`;
  if (b.duration) text += `, ${b.duration}`;
  text += '.';
  if (b.zoneName) text += `\nЗона: ${b.zoneName}.`;
  if (n > 1 && b.together) text += '\nЖелательно места рядом.';
  text += `\n\nЗаявка с сайта #${b.code}`;
  return text;
}

export function whatsappUrl(number, text) {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
