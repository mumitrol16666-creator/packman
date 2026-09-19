import { daysBetween } from './time.js';

const CONTACT_EVENTS = ['whatsapp_direct', 'phone', 'route_2gis', 'instagram', 'reviews_2gis'];

/**
 * Все показатели за период [from, to] включительно (даты местные, формат YYYY-MM-DD).
 * Заявка — пара «визит + код»: повторные нажатия кнопки с тем же кодом считаются одной заявкой,
 * а случайно совпавшие коды у разных людей — разными.
 */
export function collectStats(db, from, to) {
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const range = 'day BETWEEN ? AND ?';

  // первый по времени ряд каждого визита: из него берутся источник, устройство и час прихода
  const firstOfSession = `SELECT session, source, device, hour, day, MIN(ts) AS first_ts FROM events WHERE ${range} GROUP BY session`;

  const sessions = one(`SELECT COUNT(DISTINCT session) AS n FROM events WHERE ${range}`, from, to).n;
  const bookingSessions = one(`SELECT COUNT(DISTINCT session) AS n FROM events WHERE ${range} AND event = 'booking_whatsapp'`, from, to).n;
  const engaged = one(
    `SELECT AVG(total) AS avg_ms FROM (SELECT SUM(value) AS total FROM events WHERE ${range} AND event = 'engaged' GROUP BY session)`,
    from,
    to,
  ).avg_ms;

  const contacts = Object.fromEntries(CONTACT_EVENTS.map((name) => [name, 0]));
  for (const row of all(`SELECT event, COUNT(*) AS n FROM events WHERE ${range} AND event IN (${CONTACT_EVENTS.map(() => '?').join(',')}) GROUP BY event`, from, to, ...CONTACT_EVENTS)) {
    contacts[row.event] = row.n;
  }

  return {
    from,
    to,
    days: daysBetween(from, to),
    visitors: one(`SELECT COUNT(*) AS n FROM (SELECT DISTINCT day, visitor FROM events WHERE ${range})`, from, to).n,
    sessions,
    pageviews: one(`SELECT COUNT(*) AS n FROM events WHERE ${range} AND event = 'pageview'`, from, to).n,
    avgEngagedSec: engaged ? Math.round(engaged / 1000) : 0,
    bookings: one(`SELECT COUNT(DISTINCT session || ':' || COALESCE(code, '')) AS n FROM events WHERE ${range} AND event = 'booking_whatsapp'`, from, to).n,
    conversion: sessions ? bookingSessions / sessions : 0,
    bookingsByBranch: all(
      `SELECT branch, COUNT(DISTINCT session || ':' || COALESCE(code, '')) AS n FROM events WHERE ${range} AND event = 'booking_whatsapp' AND branch IS NOT NULL GROUP BY branch ORDER BY n DESC, branch`,
      from,
      to,
    ),
    contacts,
    sources: all(`SELECT source, COUNT(*) AS n FROM (${firstOfSession}) GROUP BY source ORDER BY n DESC, source`, from, to),
    devices: all(`SELECT device, COUNT(*) AS n FROM (${firstOfSession}) WHERE device IS NOT NULL GROUP BY device ORDER BY n DESC`, from, to),
    peakHours: all(`SELECT hour, COUNT(*) AS n FROM (${firstOfSession}) GROUP BY hour ORDER BY n DESC, hour LIMIT 3`, from, to),
    byDay: all(`SELECT day, COUNT(*) AS n FROM (${firstOfSession}) GROUP BY day ORDER BY day`, from, to),
    clubViews: all(
      `SELECT branch, COUNT(*) AS n FROM events WHERE ${range} AND event = 'pageview' AND path LIKE '/clubs/%' AND branch IS NOT NULL GROUP BY branch ORDER BY n DESC, branch`,
      from,
      to,
    ),
    sections: all(
      `SELECT section, COUNT(DISTINCT session) AS n FROM events WHERE ${range} AND event = 'section_view' AND section IS NOT NULL GROUP BY section ORDER BY n DESC, section`,
      from,
      to,
    ),
  };
}

/** Были ли вообще события до указанного дня: нужно, чтобы не слать пустые отчёты за время до установки счётчика. */
export function hasEventsBefore(db, day) {
  return Boolean(db.prepare('SELECT 1 AS x FROM events WHERE day <= ? LIMIT 1').get(day));
}
