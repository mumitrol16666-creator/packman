import test from 'node:test';
import assert from 'node:assert/strict';
import { insertEvent, openDb, visitorSecret } from '../server/db.js';
import { classifySource, createRateLimiter, isBot, normalizeEvent, visitorHash } from '../server/ingest.js';
import { bookingNotice, dailyReport, monthlyReport, weeklyReport } from '../server/report.js';
import { dueReports, runScheduler } from '../server/scheduler.js';
import { collectStats } from '../server/stats.js';
import { addDays, humanDay, humanRange, localParts, previousMonth, weekStart } from '../server/time.js';

const TZ = 'Asia/Aqtobe';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const ctx = (now) => ({ ip: '203.0.113.7', userAgent: UA, secret: 'secret', timezone: TZ, now });
const at = (iso) => Date.parse(iso);

test('местное время клуба: Актобе UTC+5, день меняется в 19:00 UTC', () => {
  assert.deepEqual(localParts(at('2026-09-19T18:59:00Z'), TZ), { day: '2026-09-19', hour: 23 });
  assert.deepEqual(localParts(at('2026-09-19T19:00:00Z'), TZ), { day: '2026-09-20', hour: 0 });
});

test('границы недели и месяца', () => {
  assert.equal(weekStart('2026-09-19'), '2026-09-14');
  assert.equal(weekStart('2026-09-14'), '2026-09-14');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.deepEqual(previousMonth('2026-10-01'), { from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(previousMonth('2027-01-15'), { from: '2026-12-01', to: '2026-12-31' });
  assert.equal(humanDay('2026-09-18'), '18 сентября (пт)');
  assert.equal(humanRange('2026-09-28', '2026-10-04'), '28 сентября – 4 октября');
});

test('источник визита: метка важнее реферера', () => {
  assert.equal(classifySource({ source: 'IG', referrer: 'google.com' }), 'instagram');
  assert.equal(classifySource({ referrer: 'l.instagram.com' }), 'instagram');
  assert.equal(classifySource({ referrer: '2gis.kz' }), '2gis');
  assert.equal(classifySource({ referrer: 'www.google.kz' }), 'google');
  assert.equal(classifySource({ referrer: 'yandex.kz' }), 'yandex');
  assert.equal(classifySource({ referrer: 'some-blog.kz' }), 'some-blog.kz');
  assert.equal(classifySource({}), 'direct');
});

test('боты и мусор отбрасываются', () => {
  assert.equal(isBot('Mozilla/5.0 (compatible; Googlebot/2.1)'), true);
  assert.equal(isBot(''), true);
  assert.equal(isBot(UA), false);
  const ok = { event: 'pageview', path: '/', session: 'abcd1234-ef' };
  assert.equal(normalizeEvent({ ...ok, event: 'DROP TABLE' }, ctx(1)), null);
  assert.equal(normalizeEvent({ ...ok, path: 'https://evil.example/' }, ctx(1)), null);
  assert.equal(normalizeEvent({ ...ok, session: 'x' }, ctx(1)), null);
  assert.equal(normalizeEvent(ok, { ...ctx(1), userAgent: 'curl/8.0' }), null);
  assert.equal(normalizeEvent(null, ctx(1)), null);
});

test('событие нормализуется, а IP в строку не попадает', () => {
  const row = normalizeEvent(
    { event: 'booking_whatsapp', path: '/clubs/gold/?utm_source=ig#booking', session: 'abcd1234-ef', device: 'mobile', source: 'ig', branch: 'gold', zone: 'main', people: 3, code: 'A7K2', extra: '<script>' },
    ctx(at('2026-09-19T16:00:00Z')),
  );
  assert.equal(row.day, '2026-09-19');
  assert.equal(row.hour, 21);
  assert.equal(row.path, '/clubs/gold/');
  assert.equal(row.source, 'instagram');
  assert.equal(row.branch, 'gold');
  assert.equal(row.value, 3);
  assert.equal(row.code, 'A7K2');
  assert.equal(JSON.stringify(row).includes('203.0.113.7'), false);
  assert.equal('extra' in row, false);
});

test('клуб и язык берутся из адреса страницы, если не переданы явно', () => {
  const row = normalizeEvent({ event: 'pageview', path: '/clubs/batys/', session: 'abcd1234-ef' }, ctx(1));
  assert.equal(row.branch, 'batys');
  assert.equal(row.lang, 'ru');
  const kz = normalizeEvent({ event: 'pageview', path: '/kz/clubs/gold/', session: 'abcd1234-ef' }, ctx(1));
  assert.equal(kz.branch, 'gold');
  assert.equal(kz.lang, 'kk');
});

test('старая база без колонки lang дополняется при открытии', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { DatabaseSync } = await import('node:sqlite');
  const file = join(mkdtempSync(join(tmpdir(), 'pacman-db-')), 'old.db');
  const old = new DatabaseSync(file);
  old.exec('CREATE TABLE events (id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, day TEXT NOT NULL, hour INTEGER NOT NULL, event TEXT NOT NULL, path TEXT NOT NULL, visitor TEXT NOT NULL, session TEXT NOT NULL, device TEXT, source TEXT, campaign TEXT, branch TEXT, zone TEXT, section TEXT, value INTEGER, code TEXT)');
  old.close();
  const db = openDb(file);
  assert.ok(db.prepare('PRAGMA table_info(events)').all().some((c) => c.name === 'lang'));
  db.close();
});

test('обезличенный код посетителя одинаков в пределах дня и меняется на следующий', () => {
  const a = visitorHash('s', '2026-09-19', '203.0.113.7', UA);
  assert.equal(a, visitorHash('s', '2026-09-19', '203.0.113.7', UA));
  assert.notEqual(a, visitorHash('s', '2026-09-20', '203.0.113.7', UA));
  assert.notEqual(a, visitorHash('s', '2026-09-19', '203.0.113.8', UA));
  assert.match(a, /^[0-9a-f]{16}$/);
});

test('секрет создаётся один раз и переживает повторное чтение', () => {
  const db = openDb(':memory:');
  const first = visitorSecret(db);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(visitorSecret(db), first);
});

test('ограничение частоты: 121-е событие за минуту отбрасывается, через минуту снова можно', () => {
  const allow = createRateLimiter(120, 60_000);
  for (let i = 0; i < 120; i++) assert.equal(allow('v', 1000), true);
  assert.equal(allow('v', 1000), false);
  assert.equal(allow('other', 1000), true);
  assert.equal(allow('v', 62_000), true);
});

function seed(db) {
  let n = 0;
  const add = (day, session, patch) =>
    insertEvent(db, { ts: Date.parse(`${day}T10:00:00Z`) + n++, day, hour: 15, event: 'pageview', path: '/', visitor: `v-${session}`, session, device: 'mobile', source: 'instagram', lang: 'ru', campaign: null, branch: null, zone: null, section: null, value: null, code: null, ...patch });

  // пятница 18 сентября: три визита, две заявки
  add('2026-09-18', 's1', {});
  add('2026-09-18', 's1', { event: 'section_view', section: 'prices' });
  add('2026-09-18', 's1', { event: 'pageview', path: '/clubs/gold/', branch: 'gold' });
  add('2026-09-18', 's1', { event: 'booking_whatsapp', branch: 'gold', value: 3, code: 'A7K2' });
  add('2026-09-18', 's1', { event: 'booking_whatsapp', branch: 'gold', value: 3, code: 'A7K2' });
  add('2026-09-18', 's1', { event: 'engaged', value: 90_000 });
  add('2026-09-18', 's2', { source: '2gis', device: 'desktop' });
  add('2026-09-18', 's2', { event: 'booking_whatsapp', branch: 'pro', value: 1, code: 'A7K2' });
  add('2026-09-18', 's2', { event: 'phone', branch: 'pro' });
  add('2026-09-18', 's2', { event: 'engaged', value: 30_000 });
  add('2026-09-18', 's3', { source: 'direct' });
  // пятница неделей раньше: один визит, одна заявка
  add('2026-09-11', 'p1', {});
  add('2026-09-11', 'p1', { event: 'booking_whatsapp', branch: 'gold', code: 'ZZZZ' });
}

test('показатели за день', () => {
  const db = openDb(':memory:');
  seed(db);
  const s = collectStats(db, '2026-09-18', '2026-09-18');
  assert.equal(s.sessions, 3);
  assert.equal(s.visitors, 3);
  assert.equal(s.pageviews, 4);
  assert.equal(s.bookings, 2, 'двойное нажатие с тем же кодом — одна заявка, совпавший код у другого визита — отдельная');
  assert.deepEqual(s.bookingsByBranch.map((r) => [r.branch, r.n]), [['gold', 1], ['pro', 1]]);
  assert.equal(s.bookingsByBranch.reduce((sum, r) => sum + r.n, 0), s.bookings);
  assert.equal(s.avgEngagedSec, 60);
  assert.equal(s.contacts.phone, 1);
  assert.deepEqual(s.sources.map((r) => [r.source, r.n]), [['2gis', 1], ['direct', 1], ['instagram', 1]]);
  assert.deepEqual(s.clubViews.map((r) => [r.branch, r.n]), [['gold', 1]]);
  assert.deepEqual(s.sections.map((r) => [r.section, r.n]), [['prices', 1]]);
  assert.ok(Math.abs(s.conversion - 2 / 3) < 1e-9);
});

test('дневной отчёт сравнивает с тем же днём недели и не ломает HTML', () => {
  const db = openDb(':memory:');
  seed(db);
  const text = dailyReport(db, '2026-09-18', 'Pacman <Game> Center');
  assert.match(text, /Отчёт за 18 сентября \(пт\)/);
  assert.match(text, /Посетители: <b>3<\/b> \(\+2 к прошлой пятнице\)/);
  assert.match(text, /Заявки на бронь: <b>2<\/b> \(\+1 к прошлой пятнице\) · конверсия 66,7%/);
  assert.match(text, /Gold 1 · Pro 1/);
  assert.match(text, /Pacman &lt;Game&gt; Center/);
  assert.ok(text.length < 4096);
});

test('пустой период: отчёт объясняет, что проверить', () => {
  const db = openDb(':memory:');
  assert.match(dailyReport(db, '2026-09-18', 'Pacman'), /посещений не было/);
  assert.match(weeklyReport(db, '2026-09-07', 'Pacman'), /посещений не было/);
  assert.match(monthlyReport(db, '2026-08-01', '2026-08-31', 'Pacman'), /посещений не было/);
});

test('уведомление о заявке', () => {
  const text = bookingNotice({ code: 'A7K2', branch: 'premium', zone: 'vip', value: 3 });
  assert.match(text, /Заявка с сайта #A7K2/);
  assert.match(text, /Pacman Premium · зона: vip · человек: 3/);
});

test('расписание: дневной после 9:00, недельный в понедельник, месячный первого числа', () => {
  const none = () => false;
  const kinds = (iso, isSent = none) => dueReports(at(iso), TZ, 9, isSent).map((r) => `${r.kind}:${r.period}`);

  // суббота 19 сентября, 08:59 по Актобе: дневной ещё рано, недельный за 7–13 сентября уже пора (понедельник прошёл)
  assert.deepEqual(kinds('2026-09-19T03:59:00Z'), ['weekly:2026-09-07', 'monthly:2026-08']);
  assert.deepEqual(kinds('2026-09-19T04:00:00Z'), ['daily:2026-09-18', 'weekly:2026-09-07', 'monthly:2026-08']);
  // понедельник 21 сентября, 08:00: недельный за 14–20 сентября ещё не пора
  assert.deepEqual(kinds('2026-09-21T03:00:00Z', (k) => k === 'monthly'), []);
  assert.deepEqual(kinds('2026-09-21T04:30:00Z', (k) => k === 'monthly'), ['daily:2026-09-20', 'weekly:2026-09-14']);
  // 1 октября, 09:30: уходит отчёт за сентябрь
  assert.deepEqual(kinds('2026-10-01T04:30:00Z', (k) => k === 'weekly'), ['daily:2026-09-30', 'monthly:2026-09']);
});

test('планировщик: отправляет один раз, без токена ничего не помечает, до установки счётчика молчит', async () => {
  const db = openDb(':memory:');
  seed(db);
  const config = { timezone: TZ, reportHour: 9, siteName: 'Pacman' };
  const now = at('2026-09-19T04:30:00Z');

  const dry = await runScheduler({ db, config, now, send: async () => ({ ok: false, dryRun: true }) });
  assert.deepEqual(dry, []);

  const sent = [];
  const first = await runScheduler({ db, config, now, send: async (html) => (sent.push(html), { ok: true }) });
  // за август счётчика ещё не было: месячный отчёт пропускается молча
  assert.deepEqual(first.map((r) => r.kind), ['daily', 'weekly']);
  assert.equal(sent.length, 2);

  const second = await runScheduler({ db, config, now: now + 600_000, send: async (html) => (sent.push(html), { ok: true }) });
  assert.deepEqual(second, []);
  assert.equal(sent.length, 2);
});

test('сбой Telegram не помечает отчёт отправленным', async () => {
  const db = openDb(':memory:');
  seed(db);
  const config = { timezone: TZ, reportHour: 9, siteName: 'Pacman' };
  const now = at('2026-09-19T04:30:00Z');
  await assert.rejects(runScheduler({ db, config, now, send: async () => { throw new Error('Telegram: 502'); } }));
  const retry = await runScheduler({ db, config, now, send: async () => ({ ok: true }) });
  assert.ok(retry.some((r) => r.kind === 'daily'));
});
