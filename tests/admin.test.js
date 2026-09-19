import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { createLoginLimiter, createSessions, passwordMatches, readCookie, sessionCookie } from '../server/admin/auth.js';
import { createBuilder } from '../server/admin/builder.js';
import { createContentStore } from '../server/admin/content.js';
import { PhotoError, createPhotoStore } from '../server/admin/photos.js';
import { pricesChanged, validateBranches, validateEvents, validateSite } from '../server/admin/schema.js';
import { openDb } from '../server/db.js';

const root = new URL('..', import.meta.url).pathname;
const load = (name) => JSON.parse(readFileSync(join(root, 'src/data', `${name}.json`), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const temp = () => mkdtempSync(join(tmpdir(), 'pacman-admin-'));

test('пароль сравнивается целиком, пустой пароль не подходит никогда', () => {
  assert.equal(passwordMatches('pacman-2026', 'pacman-2026'), true);
  assert.equal(passwordMatches('pacman-202', 'pacman-2026'), false);
  assert.equal(passwordMatches('', ''), false);
  assert.equal(passwordMatches(undefined, 'pacman-2026'), false);
});

test('сессия: подпись, срок действия, смена пароля выбрасывает всех', () => {
  const db = openDb(':memory:');
  const sessions = createSessions(db, 'pacman-2026');
  const token = sessions.issue(1_800_000_000_000);
  assert.equal(sessions.verify(token, 1_800_000_000_000 + 60_000), true);
  assert.equal(sessions.verify(token, 1_800_000_000_000 + 13 * 3600_000), false, 'через 13 часов сессия истекла');
  const [expires, signature] = token.split('.');
  assert.equal(sessions.verify(`${Number(expires) + 1}.${signature}`, 1_800_000_000_000), false, 'подделанный срок');
  assert.equal(sessions.verify('garbage'), false);
  assert.equal(sessions.verify(null), false);
  assert.equal(createSessions(db, 'другой-пароль').verify(token, 1_800_000_000_000 + 60_000), false);
});

test('кука админки: только для /admin, недоступна скриптам и чужим сайтам', () => {
  const cookie = sessionCookie('123.abc', true);
  assert.match(cookie, /^pm_admin=123\.abc; Path=\/admin; HttpOnly; SameSite=Strict; Max-Age=43200; Secure$/);
  assert.match(sessionCookie('', false), /Max-Age=0$/);
  assert.equal(readCookie({ headers: { cookie: 'a=1; pm_admin=123.abc; b=2' } }), '123.abc');
  assert.equal(readCookie({ headers: {} }), null);
});

test('подбор пароля: после 8 ошибок вход закрыт на 15 минут', () => {
  const limiter = createLoginLimiter(8, 15 * 60_000);
  for (let i = 0; i < 8; i++) limiter.fail('1.2.3.4', 1000);
  assert.equal(limiter.blocked('1.2.3.4', 2000), true);
  assert.equal(limiter.blocked('5.6.7.8', 2000), false);
  assert.equal(limiter.blocked('1.2.3.4', 1000 + 16 * 60_000), false);
  limiter.reset('1.2.3.4');
  assert.equal(limiter.blocked('1.2.3.4', 2000), false);
});

test('текущий контент проходит проверку без ошибок и без потерь', () => {
  const branches = load('branches');
  const slugs = branches.map((b) => b.slug);
  const checked = validateBranches(branches, slugs);
  assert.deepEqual(checked.errors, []);
  assert.deepEqual(checked.data, branches);
  const site = validateSite(load('site'));
  assert.deepEqual(site.errors, []);
  assert.deepEqual(site.data, load('site'));
  assert.deepEqual(validateEvents(load('events'), slugs).errors, []);
});

test('ошибки контента объясняются по-человечески', () => {
  const branches = load('branches');
  const slugs = branches.map((b) => b.slug);
  const broken = clone(branches);
  broken[0].whatsapp = '8 708 040';
  broken[0].zones[0].prices.h1 = 'дорого';
  broken[1].zones[1].id = broken[1].zones[0].id;
  broken[2].accent = 'красный';
  broken.pop();
  const { errors } = validateBranches(broken, slugs);
  assert.ok(errors.some((e) => e.startsWith('Клуб Premium:') && e.includes('WhatsApp')));
  assert.ok(errors.some((e) => e.includes('зал VIP Varmilo') && e.includes('цена 1 час')));
  assert.ok(errors.some((e) => e.includes('код зала: повторяется')));
  assert.ok(errors.some((e) => e.includes('Цвет клуба')));
  assert.ok(errors.some((e) => e.includes('нельзя удалить клуб (city)')));

  const extra = clone(branches);
  extra.push({ ...clone(branches[0]), slug: 'new-club' });
  assert.ok(validateBranches(extra, slugs).errors.some((e) => e.includes('новый клуб добавляет разработчик')));
});

test('лишние и опасные поля в контент не попадают', () => {
  const branches = load('branches');
  const dirty = clone(branches);
  dirty[0].__proto__hack = { admin: true };
  dirty[0].script = '<script>alert(1)</script>';
  dirty[0].name = ` Premium${String.fromCharCode(7)} `;
  const { data, errors } = validateBranches(dirty, branches.map((b) => b.slug));
  assert.deepEqual(errors, []);
  assert.equal('script' in data[0], false);
  assert.equal(data[0].name, 'Premium');
});

test('акция: либо цена с единицей, либо плашка; ссылки только https', () => {
  const site = load('site');
  const withPrice = clone(site);
  withPrice.promos[0].unit = '';
  assert.ok(validateSite(withPrice).errors.some((e) => e.includes('Единица цены')));
  const badLink = clone(site);
  badLink.instagram = 'javascript:alert(1)';
  assert.ok(validateSite(badLink).errors.some((e) => e.includes('https://')));
});

test('события: даты, клуб и ссылка проверяются', () => {
  const slugs = ['premium', 'gold'];
  const good = [{ id: 'cs2-cup', title: 'CS2 Cup', date: '2026-10-03', dateEnd: '2026-10-04', time: '18:00', branch: 'premium', prize: '150 000 ₸', link: 'https://instagram.com/pacman.kz' }];
  assert.deepEqual(validateEvents(good, slugs).errors, []);
  const bad = [{ ...good[0], dateEnd: '2026-10-01', branch: 'nowhere', link: 'http://insecure.example', time: '25:00' }];
  const { errors } = validateEvents(bad, slugs);
  assert.ok(errors.some((e) => e.includes('дата окончания раньше')));
  assert.ok(errors.some((e) => e.includes('клуб, которого нет')));
  assert.ok(errors.some((e) => e.includes('https://')));
  assert.ok(errors.some((e) => e.includes('Время')));
});

test('изменение цены замечается, изменение адреса — нет', () => {
  const before = load('branches');
  const address = clone(before);
  address[0].address = 'Новый адрес, 1';
  assert.equal(pricesChanged(before, address), false);
  const price = clone(before);
  price[3].zones[1].prices.h1 += 50;
  assert.equal(pricesChanged(before, price), true);
});

test('контент: запись делает резервную копию, хранится не больше 30 копий', () => {
  const dir = temp();
  mkdirSync(join(dir, 'src/data'), { recursive: true });
  writeFileSync(join(dir, 'src/data/events.json'), '[]\n');
  const store = createContentStore(dir, join(dir, 'backups'));
  for (let i = 0; i < 33; i++) store.write('events', [{ id: `e${i}` }]);
  assert.deepEqual(store.read('events'), [{ id: 'e32' }]);
  assert.equal(readFileSync(join(dir, 'src/data/events.json'), 'utf8').endsWith('}\n]\n'), true);
  assert.ok(readdirSync(join(dir, 'backups')).length <= 30);
  assert.throws(() => store.read('../../etc/passwd'));
});

async function jpeg(color) {
  return sharp({ create: { width: 3200, height: 1800, channels: 3, background: color } }).jpeg().toBuffer();
}

test('фото: загрузка уменьшает и нумерует, порядок и удаление работают, чужие пути закрыты', async () => {
  const dir = temp();
  mkdirSync(join(dir, 'src/assets/photos/gold'), { recursive: true });
  writeFileSync(join(dir, 'src/assets/photos/gold/gold-01.jpg'), await jpeg('#ff0000'));
  const photos = createPhotoStore(dir);

  const afterUpload = await photos.upload('clubs', 'gold', await jpeg('#00ff00'));
  assert.deepEqual(afterUpload.map((p) => p.name.replace(/-[0-9a-f]{8}\.jpg$/, '-NEW.jpg')), ['01-gold-01.jpg', '02-NEW.jpg']);
  const meta = await sharp(join(dir, 'src/assets/photos/gold', afterUpload[1].name)).metadata();
  assert.equal(meta.width, 2400, 'большое фото уменьшено до 2400 по ширине');

  const swapped = photos.reorder('clubs', 'gold', [afterUpload[1].name, afterUpload[0].name]);
  assert.match(swapped[0].name, /^01-[0-9a-f]{8}\.jpg$/);
  assert.equal(swapped[1].name, '02-gold-01.jpg');
  assert.throws(() => photos.reorder('clubs', 'gold', ['01-gold-01.jpg']), PhotoError);

  assert.equal(photos.remove('clubs', 'gold', swapped[0].name).length, 1);
  assert.throws(() => photos.remove('clubs', 'gold', '../../../package.json'), PhotoError);
  assert.throws(() => photos.list('clubs', '../data'), PhotoError);
  assert.throws(() => photos.list('secrets', 'gold'), PhotoError);
  await assert.rejects(photos.upload('clubs', 'gold', Buffer.from('это не картинка')), PhotoError);

  await photos.upload('events', 'cs2-cup', await jpeg('#0000ff'));
  photos.removeAll('events', 'cs2-cup');
  assert.equal(existsSync(join(dir, 'src/assets/events/cs2-cup')), false);
});

test('публикация: успешная сборка подменяет сайт, упавшая оставляет прежний, изменения во время сборки не теряются', async () => {
  const dir = temp();
  const siteDir = join(dir, 'dist');
  mkdirSync(siteDir);
  writeFileSync(join(siteDir, 'index.html'), 'v1');
  writeFileSync(join(siteDir, 'stale.html'), 'old page');

  let version = 1;
  let fail = false;
  const runs = [];
  const run = async (command, args) => {
    runs.push(args.join(' '));
    if (!args.includes('build')) return;
    await new Promise((r) => setTimeout(r, 20));
    if (fail) throw new Error('Build failed: unexpected token');
    version += 1;
    const out = args[args.indexOf('--outDir') + 1];
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'index.html'), `v${version}`);
  };
  const builder = createBuilder({ projectRoot: dir, siteDir, run, log: () => {} });
  const settle = async () => { while (builder.status().status === 'building' || builder.status().pending) await new Promise((r) => setTimeout(r, 10)); };

  builder.request();
  builder.request();
  builder.request({ photosChanged: true });
  assert.equal(builder.status().status, 'building');
  await settle();
  assert.equal(readFileSync(join(siteDir, 'index.html'), 'utf8'), 'v3', 'три запроса подряд дают две сборки: текущую и одну догоняющую');
  assert.equal(existsSync(join(siteDir, 'stale.html')), false, 'страницы, которых больше нет, исчезают');
  assert.equal(runs.filter((r) => r.includes('make-og')).length, 1, 'картинки превью пересобираются только когда менялись фото');

  fail = true;
  builder.request();
  await settle();
  assert.equal(builder.status().status, 'error');
  assert.match(builder.status().error, /unexpected token/);
  assert.equal(readFileSync(join(siteDir, 'index.html'), 'utf8'), 'v3', 'сайт остался прежним');

  fail = false;
  builder.request();
  await settle();
  assert.equal(builder.status().status, 'idle');
  assert.equal(readFileSync(join(siteDir, 'index.html'), 'utf8'), 'v4');
});
