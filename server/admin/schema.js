// Проверка контента перед записью. Ошибки формулируются для маркетолога, а не для разработчика:
// «Клуб Premium, зал VIP: «цена 1 час» должно быть целым числом от 0 до 1 000 000».

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const PRICE_KEYS = [['h1', '1 час'], ['h3', '3 часа'], ['h5', '5 часов'], ['morning', 'Утро'], ['day', 'День'], ['night', 'Ночь'], ['turbo', 'Турбо ночь']];
const PACKAGE_IDS = ['morning', 'day', 'night', 'turbo'];
const SPEC_KEYS = [['cpu', 'Процессор'], ['gpu', 'Видеокарта'], ['ram', 'Память'], ['mouse', 'Мышь'], ['keyboard', 'Клавиатура'], ['headset', 'Наушники']];

/** Убирает управляющие символы (кроме переноса строки и табуляции), которые попадают при вставке из Word и мессенджеров. */
function stripControl(value) {
  return [...value].filter((ch) => ch >= ' ' || ch === '\n' || ch === '\t').join('');
}

class Checker {
  constructor() {
    this.errors = [];
    this.where = [];
  }
  at(label, fn) {
    this.where.push(label);
    try {
      return fn();
    } finally {
      this.where.pop();
    }
  }
  fail(message) {
    this.errors.push(`${this.where.join(', ')}: ${message}`);
  }
  text(value, label, { max = 200, required = false } = {}) {
    if (value === undefined || value === null || value === '') {
      if (required) this.fail(`заполните поле «${label}»`);
      return required ? '' : null;
    }
    if (typeof value !== 'string') {
      this.fail(`поле «${label}» должно быть текстом`);
      return null;
    }
    const clean = stripControl(value).trim();
    if (clean.length > max) this.fail(`поле «${label}» длиннее ${max} символов`);
    if (required && !clean) this.fail(`заполните поле «${label}»`);
    return clean || (required ? '' : null);
  }
  /** Пара «русский + казахский»: русский обязателен (если required), казахский можно оставить пустым. */
  pair(source, target, field, label, options = {}) {
    const ru = this.text(source[field], label, options);
    if (ru !== null || options.required) target[field] = ru;
    const kk = this.text(source[`${field}_kk`], `${label} (қаз)`, { ...options, required: false });
    if (kk) target[`${field}_kk`] = kk;
  }
  match(value, re, label, { required = true } = {}) {
    if (value === undefined || value === null || value === '') {
      if (required) this.fail(`заполните поле «${label}»`);
      return null;
    }
    if (typeof value !== 'string' || !re.test(value)) {
      this.fail(`поле «${label}» заполнено в неверном формате`);
      return null;
    }
    return value;
  }
  int(value, label, { min = 0, max = 1_000_000, required = true } = {}) {
    if (value === undefined || value === null || value === '') {
      if (required) this.fail(`заполните поле «${label}»`);
      return null;
    }
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) {
      this.fail(`«${label}» должно быть целым числом от ${min.toLocaleString('ru-RU')} до ${max.toLocaleString('ru-RU')}`);
      return null;
    }
    return n;
  }
  float(value, label, { min, max, required = false } = {}) {
    if (value === undefined || value === null || value === '') {
      if (required) this.fail(`заполните поле «${label}»`);
      return null;
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max) {
      this.fail(`«${label}» должно быть числом от ${min} до ${max}`);
      return null;
    }
    return n;
  }
  url(value, label, { required = false } = {}) {
    const text = this.text(value, label, { max: 300, required });
    if (!text) return null;
    if (!/^https:\/\/[^\s]+$/.test(text)) {
      this.fail(`«${label}» должна быть ссылкой, начинающейся с https://`);
      return null;
    }
    return text;
  }
  list(value, label, { min = 0, max = 50 } = {}) {
    if (!Array.isArray(value)) {
      this.fail(`«${label}» должно быть списком`);
      return [];
    }
    if (value.length < min) this.fail(`в списке «${label}» должно быть не меньше ${min}`);
    if (value.length > max) this.fail(`в списке «${label}» должно быть не больше ${max}`);
    return value.slice(0, max);
  }
  unique(items, key, label) {
    const seen = new Set();
    for (const item of items) {
      if (item[key] && seen.has(item[key])) this.fail(`${label}: повторяется «${item[key]}»`);
      seen.add(item[key]);
    }
  }
}

function prices(c, source, keys) {
  const out = {};
  for (const [key, label] of keys) out[key] = c.int(source?.[key], `цена ${label}`);
  return out;
}

function zone(c, z) {
  const out = { id: c.match(z.id, SLUG, 'код зала') };
  c.pair(z, out, 'name', 'Название зала', { max: 40, required: true });
  out.hz = c.text(z.hz, 'Герцовка', { max: 40, required: true });
  out.pcs = c.int(z.pcs, 'Количество ПК', { min: 1, max: 1000, required: false });
  const specs = z.specs || {};
  out.specs = {
    monitor: c.list(specs.monitor, 'Мониторы', { min: 1, max: 6 }).map((m, i) => c.text(m, `Монитор ${i + 1}`, { max: 80, required: true })),
  };
  for (const [key, label] of SPEC_KEYS) out.specs[key] = c.text(specs[key], label, { max: 80, required: true });
  const mousepad = c.text(specs.mousepad, 'Коврик', { max: 80 });
  if (mousepad) out.specs.mousepad = mousepad;
  out.prices = prices(c, z.prices, PRICE_KEYS);
  return out;
}

export function validateBranches(input, existingSlugs) {
  const c = new Checker();
  const branches = c.at('Клубы', () => c.list(input, 'Клубы', { min: 1, max: 30 })).map((b) =>
    c.at(`Клуб ${b?.name || b?.slug || '?'}`, () => {
      b = b || {};
      const out = { slug: c.match(b.slug, SLUG, 'код клуба') };
      // код клуба — это адрес его страницы и папка с фото; менять его из админки нельзя
      if (out.slug && !existingSlugs.includes(out.slug)) c.fail('такого клуба нет; новый клуб добавляет разработчик');
      out.name = c.text(b.name, 'Название', { max: 30, required: true });
      out.accent = c.match(b.accent, COLOR, 'Цвет клуба');
      c.pair(b, out, 'address', 'Адрес', { max: 120, required: true });
      out.addressNote = c.text(b.addressNote, 'Уточнение к адресу', { max: 60 });
      const noteKk = c.text(b.addressNote_kk, 'Уточнение к адресу (қаз)', { max: 60 });
      if (noteKk) out.addressNote_kk = noteKk;
      c.pair(b, out, 'district', 'Район', { max: 80, required: true });
      c.pair(b, out, 'hours', 'Режим работы', { max: 60, required: true });
      out.whatsapp = c.match(b.whatsapp, /^7\d{10}$/, 'WhatsApp (11 цифр, начиная с 7)');
      out.phone = c.match(b.phone, /^\+7\d{10}$/, 'Телефон (+7 и 10 цифр)');
      out.email = c.match(b.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Почта', { required: false });
      out.gisFirmId = c.match(b.gisFirmId, /^\d{5,25}$/, 'Номер карточки в 2ГИС');
      const lat = c.float(b.geo?.lat, 'Широта', { min: -90, max: 90 });
      const lon = c.float(b.geo?.lon, 'Долгота', { min: -180, max: 180 });
      if (lat !== null && lon !== null) out.geo = { lat, lon };
      const value = c.float(b.rating?.value, 'Рейтинг', { min: 1, max: 5 });
      if (value !== null) {
        out.rating = { value, count: c.int(b.rating.count, 'Число оценок'), reviews: c.int(b.rating.reviews, 'Число отзывов', { required: false }) ?? 0 };
      }
      if (b.hidden === true) out.hidden = true;
      const review = c.text(b.needsReview, 'Заметка «проверить»', { max: 500 });
      if (review) out.needsReview = review;
      out.zones = c.list(b.zones, 'Залы', { min: 1, max: 12 }).map((z) => c.at(`зал ${z?.name || '?'}`, () => zone(c, z || {})));
      c.unique(out.zones, 'id', 'код зала');
      out.consoles = c.list(b.consoles ?? [], 'Приставки', { max: 8 }).map((item) =>
        c.at(`приставка ${item?.name || '?'}`, () => {
          const console = { id: c.match(item?.id, SLUG, 'код приставки') };
          c.pair(item || {}, console, 'name', 'Название', { max: 40, required: true });
          console.prices = prices(c, item?.prices, PRICE_KEYS.slice(0, 3));
          return console;
        }),
      );
      c.unique(out.consoles, 'id', 'код приставки');
      return out;
    }),
  );
  c.at('Клубы', () => c.unique(branches, 'slug', 'код клуба'));
  const missing = existingSlugs.filter((slug) => !branches.some((b) => b.slug === slug));
  if (missing.length) c.errors.push(`Клубы: нельзя удалить клуб (${missing.join(', ')}). Чтобы убрать его с сайта, включите «Скрыть клуб».`);
  return { data: branches, errors: c.errors };
}

export function validateSite(input) {
  const c = new Checker();
  const s = input && typeof input === 'object' ? input : {};
  const out = c.at('Общее', () => {
    const site = { brand: c.text(s.brand, 'Название сети', { max: 60, required: true }) };
    c.pair(s, site, 'city', 'Город', { max: 40, required: true });
    site.tagline = c.text(s.tagline, 'Слоган', { max: 80, required: true });
    site.instagram = c.url(s.instagram, 'Ссылка на Instagram', { required: true });
    site.instagramHandle = c.text(s.instagramHandle, 'Имя в Instagram', { max: 40, required: true });
    site.pricesUpdated = c.match(s.pricesUpdated, DATE, 'Дата обновления цен');
    const ratingsUpdated = c.match(s.ratingsUpdated, DATE, 'Дата обновления рейтингов', { required: false });
    if (ratingsUpdated) site.ratingsUpdated = ratingsUpdated;
    const packages = c.list(s.packages, 'Пакеты', { min: 4, max: 4 });
    site.packages = PACKAGE_IDS.map((id) => {
      const source = packages.find((p) => p?.id === id) || {};
      return c.at(`пакет ${source.name || id}`, () => {
        const pack = { id };
        c.pair(source, pack, 'name', 'Название', { max: 30, required: true });
        pack.from = c.match(source.from, TIME, 'Начало (ЧЧ:ММ)');
        pack.to = c.match(source.to, TIME, 'Конец (ЧЧ:ММ)');
        return pack;
      });
    });
    c.pair(s, site, 'packageNote', 'Примечание к пакетам', { max: 300 });
    return site;
  });

  out.promos = c.at('Акции', () => c.list(s.promos ?? [], 'Акции', { max: 20 })).map((p) =>
    c.at(`Акция ${p?.title || '?'}`, () => {
      p = p || {};
      const promo = { id: c.match(p.id, SLUG, 'код акции') };
      c.pair(p, promo, 'title', 'Название', { max: 60, required: true });
      c.pair(p, promo, 'audience', 'Для кого', { max: 60 });
      const price = c.int(p.price, 'Цена', { required: false });
      if (price !== null) {
        promo.price = price;
        c.pair(p, promo, 'unit', 'Единица цены', { max: 20, required: true });
      } else {
        c.pair(p, promo, 'badge', 'Плашка', { max: 20 });
      }
      c.pair(p, promo, 'note', 'Условия', { max: 400 });
      promo.color = c.match(p.color, COLOR, 'Цвет');
      if (p.hidden === true) promo.hidden = true;
      return promo;
    }),
  );
  c.at('Акции', () => c.unique(out.promos, 'id', 'код акции'));

  out.features = c.at('Удобства', () => c.list(s.features ?? [], 'Удобства', { max: 12 })).map((f, i) =>
    c.at(`Удобство ${i + 1}`, () => {
      const feature = {};
      c.pair(f || {}, feature, 'title', 'Заголовок', { max: 60, required: true });
      c.pair(f || {}, feature, 'text', 'Описание', { max: 300, required: true });
      return feature;
    }),
  );
  out.rules = c.at('Правила', () => c.list(s.rules ?? [], 'Правила', { max: 20 }).map((r, i) => c.text(r, `Пункт ${i + 1}`, { max: 500, required: true })));
  out.rules_kk = c.at('Правила (қаз)', () => c.list(s.rules_kk ?? [], 'Правила (қаз)', { max: 20 }).map((r, i) => c.text(r, `Пункт ${i + 1}`, { max: 500, required: true })));
  return { data: out, errors: c.errors };
}

export function validateEvents(input, branchSlugs) {
  const c = new Checker();
  const events = c.at('События', () => c.list(input, 'События', { max: 100 })).map((e) =>
    c.at(`Событие ${e?.title || '?'}`, () => {
      e = e || {};
      const event = { id: c.match(e.id, SLUG, 'код события') };
      c.pair(e, event, 'title', 'Название', { max: 80, required: true });
      event.date = c.match(e.date, DATE, 'Дата начала');
      event.dateEnd = c.match(e.dateEnd, DATE, 'Дата окончания', { required: false });
      if (event.date && event.dateEnd && event.dateEnd < event.date) c.fail('дата окончания раньше даты начала');
      event.time = c.match(e.time, TIME, 'Время (ЧЧ:ММ)', { required: false });
      event.branch = c.match(e.branch, SLUG, 'Клуб', { required: false });
      if (event.branch && !branchSlugs.includes(event.branch)) c.fail('выбран клуб, которого нет');
      c.pair(e, event, 'description', 'Описание', { max: 600 });
      c.pair(e, event, 'prize', 'Призовой фонд', { max: 80 });
      event.link = c.url(e.link, 'Ссылка «Подробнее»');
      if (e.hidden === true) event.hidden = true;
      return event;
    }),
  );
  c.at('События', () => c.unique(events, 'id', 'код события'));
  return { data: events, errors: c.errors };
}

/** Изменились ли цены хотя бы в одном зале или на приставках: тогда на сайте обновляется дата прайса. */
export function pricesChanged(before, after) {
  const snapshot = (branches) => JSON.stringify(branches.map((b) => [b.slug, b.zones.map((z) => [z.id, z.prices]), (b.consoles || []).map((x) => [x.id, x.prices])]));
  return snapshot(before) !== snapshot(after);
}
