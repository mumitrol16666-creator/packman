// Правдоподобные тестовые данные, чтобы посмотреть отчёты до подключения настоящего сайта.
import { insertEvent } from './db.js';
import { addDays, weekdayIndex } from './time.js';

function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BRANCHES = [['premium', 26], ['pro', 22], ['batys', 20], ['gold', 14], ['prime', 12], ['city', 6]];
const SOURCES = [['instagram', 52], ['2gis', 22], ['direct', 14], ['google', 8], ['tiktok', 4]];
const HOURS = [1, 1, 1, 0, 0, 0, 1, 1, 2, 3, 4, 5, 6, 6, 7, 8, 9, 10, 12, 14, 16, 15, 11, 5];

export function seedDemo(db, lastDay, days = 45, seed = 7) {
  const rand = prng(seed);
  const pick = (weighted) => {
    const total = weighted.reduce((sum, [, w]) => sum + w, 0);
    let r = rand() * total;
    for (const [value, w] of weighted) if ((r -= w) < 0) return value;
    return weighted[0][0];
  };

  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(lastDay, -i);
    const weekend = weekdayIndex(day) >= 4 ? 1.5 : 1;
    const growth = 1 + (days - i) / 120;
    const sessions = Math.round((110 + rand() * 40) * weekend * growth);

    for (let n = 0; n < sessions; n++) {
      const hour = Number(pick(HOURS.map((w, h) => [h, w])));
      const ts = Date.parse(`${day}T00:00:00Z`) + hour * 3600_000 + Math.floor(rand() * 3600_000);
      const base = {
        ts, day, hour, path: '/', visitor: `v${day}${Math.floor(rand() * sessions * 0.9)}`, session: `s-${day}-${n}`,
        device: rand() < 0.9 ? 'mobile' : 'desktop', source: pick(SOURCES), campaign: null, branch: null, zone: null, section: null, value: null, code: null,
      };
      const add = (patch) => insertEvent(db, { ...base, ...patch, ts: base.ts + Math.floor(rand() * 60_000) });

      add({ event: 'pageview' });
      add({ event: 'section_view', section: 'clubs' });
      if (rand() < 0.72) add({ event: 'section_view', section: 'prices' });
      if (rand() < 0.5) add({ event: 'section_view', section: 'promos' });
      if (rand() < 0.36) add({ event: 'section_view', section: 'booking' });

      const branch = pick(BRANCHES);
      if (rand() < 0.45) add({ event: 'pageview', path: `/clubs/${branch}/`, branch });
      if (rand() < 0.075) add({ event: 'booking_whatsapp', branch, zone: 'main', value: 1 + Math.floor(rand() * 4), code: `D${String(n).padStart(3, '0')}` });
      if (rand() < 0.04) add({ event: 'whatsapp_direct', branch });
      if (rand() < 0.02) add({ event: 'phone', branch });
      if (rand() < 0.05) add({ event: 'route_2gis', branch });
      add({ event: 'engaged', value: Math.round((25 + rand() * 170) * 1000) });
    }
  }
}
