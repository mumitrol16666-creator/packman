// Админка сайта Pacman. Без сборки и зависимостей: обычный модуль, который браузер загружает как есть.

const PRICE_COLUMNS = [['h1', '1 час'], ['h3', '3 часа'], ['h5', '5 часов'], ['morning', 'Утро'], ['day', 'День'], ['night', 'Ночь'], ['turbo', 'Турбо ночь']];
const SPEC_FIELDS = [['cpu', 'Процессор'], ['gpu', 'Видеокарта'], ['ram', 'Память'], ['mouse', 'Мышь'], ['keyboard', 'Клавиатура'], ['headset', 'Наушники'], ['mousepad', 'Коврик (необязательно)']];
const TABS = [['prices', 'Цены'], ['clubs', 'Клубы'], ['photos', 'Фото'], ['promos', 'Акции'], ['events', 'События'], ['general', 'Общее']];

const state = { content: null, saved: null, dirty: new Set(), tab: 'prices', club: null, build: null };
const $ = (id) => document.getElementById(id);

// ---------- запросы

async function api(method, path, body, { raw = false } = {}) {
  const headers = { 'X-Pacman-Admin': '1' };
  if (body !== undefined && !raw) headers['Content-Type'] = 'application/json';
  const response = await fetch(`/admin/api${path}`, { method, headers, body: body === undefined ? undefined : raw ? body : JSON.stringify(body), credentials: 'same-origin' });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && path !== '/login') showLogin();
  return { ok: response.ok, status: response.status, data };
}

// ---------- мелкие помощники для разметки

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'value') el.value = value;
    else if (key === 'checked') el.checked = Boolean(value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) if (child !== null && child !== undefined && child !== false) el.append(child);
  return el;
}

/** Панель сохранения видна всегда: без правок кнопки неактивны, с правками — подсвечена. */
function syncSavebar() {
  const dirty = state.dirty.size > 0;
  $('savebar').hidden = false;
  $('savebar').dataset.dirty = String(dirty);
  $('savebar-text').textContent = dirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены';
  $('save').disabled = !dirty;
  $('discard').disabled = !dirty;
}

function touch(name) {
  state.dirty.add(name);
  syncSavebar();
}

/** Поле, привязанное к свойству объекта. Пустая строка сохраняется как отсутствие значения. */
function input(target, key, section, { type = 'text', multiline = false, placeholder = '', numeric = false, rows = 3 } = {}) {
  const el = multiline ? h('textarea', { rows, placeholder }) : h('input', { type, placeholder, inputmode: numeric ? 'numeric' : null });
  el.value = target[key] ?? '';
  el.addEventListener('input', () => {
    const value = el.value;
    const number = Number(value.replace(',', '.').replace(/\s/g, ''));
    if (numeric) target[key] = value.trim() === '' ? null : Number.isFinite(number) ? number : value;
    else if (value === '') delete target[key];
    else target[key] = value;
    touch(section);
  });
  return el;
}

const field = (label, control) => h('label', { class: 'field' }, h('span', {}, label), control);

/** Русское поле и его казахская пара. Пустой казахский текст на сайте заменяется русским. */
function pair(label, target, key, section, options = {}) {
  return h('div', { class: 'pair' }, field(label, input(target, key, section, options)), field(`${label} · қазақша`, input(target, `${key}_kk`, section, options)));
}

function checkbox(label, target, key, section) {
  return h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: target[key] === true, onchange: (e) => { if (e.target.checked) target[key] = true; else delete target[key]; touch(section); } }), label);
}

function move(list, index, delta, section) {
  const to = index + delta;
  if (to < 0 || to >= list.length) return;
  [list[index], list[to]] = [list[to], list[index]];
  touch(section);
  render();
}

function tools(list, index, section, removeLabel = 'Удалить') {
  return h('div', { class: 'card__tools' },
    h('button', { class: 'btn btn--sm', type: 'button', title: 'Выше', disabled: index === 0, onclick: () => move(list, index, -1, section) }, '↑'),
    h('button', { class: 'btn btn--sm', type: 'button', title: 'Ниже', disabled: index === list.length - 1, onclick: () => move(list, index, 1, section) }, '↓'),
    h('button', { class: 'btn btn--sm btn--danger', type: 'button', onclick: () => { if (confirm(`${removeLabel}?`)) { list.splice(index, 1); touch(section); render(); } } }, removeLabel),
  );
}

const TRANSLIT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya' };

/** Код для адресов и связей: «Общий зал» → obschiy-zal. Уникален в пределах списка. */
function makeId(text, taken, fallback) {
  const base = [...String(text).toLowerCase()].map((ch) => TRANSLIT[ch] ?? ch).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}

function clubPills(onPick) {
  const branches = state.content.branches;
  if (!branches.some((b) => b.slug === state.club)) state.club = branches[0].slug;
  return h('div', { class: 'pills' }, branches.map((b) =>
    h('button', { type: 'button', 'aria-pressed': String(b.slug === state.club), style: `--accent:${b.accent}`, onclick: () => { state.club = b.slug; onPick?.(); render(); } }, b.name + (b.hidden ? ' (скрыт)' : '')),
  ));
}

const currentClub = () => state.content.branches.find((b) => b.slug === state.club);

// ---------- экраны

function priceTable(rows, columns, section) {
  return h('div', { class: 'table-wrap' }, h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, 'Зал'), columns.map(([, label]) => h('th', {}, `${label}, ₸`)))),
    h('tbody', {}, rows.map((row) => h('tr', {},
      h('td', {}, row.name, row.hz ? h('small', {}, row.hz) : null),
      columns.map(([key]) => h('td', {}, input(row.prices, key, section, { numeric: true }))),
    ))),
  ));
}

function viewPrices() {
  const club = currentClub();
  return [
    h('div', { class: 'head' }, h('h2', {}, 'Цены'), clubPills()),
    h('p', { class: 'muted' }, `Цены в тенге за одно место. После сохранения дата прайса на сайте обновится сама. Сейчас на сайте: ${state.content.site.pricesUpdated}.`),
    club.needsReview ? h('p', { class: 'notice' }, `Нужно проверить: ${club.needsReview}`) : null,
    h('section', { class: 'card' }, h('h3', {}, `Залы · Pacman ${club.name}`), priceTable(club.zones, PRICE_COLUMNS, 'branches')),
    club.consoles.length ? h('section', { class: 'card' }, h('h3', {}, 'PlayStation 5'), priceTable(club.consoles, PRICE_COLUMNS.slice(0, 3), 'branches')) : null,
  ];
}

function zoneCard(club, zone, index) {
  const monitors = h('textarea', { rows: 2, placeholder: 'Каждый монитор с новой строки' });
  monitors.value = (zone.specs.monitor || []).join('\n');
  monitors.addEventListener('input', () => { zone.specs.monitor = monitors.value.split('\n').map((s) => s.trim()).filter(Boolean); touch('branches'); });
  return h('section', { class: 'card' },
    h('div', { class: 'card__head' }, h('h3', {}, zone.name || 'Новый зал'), tools(club.zones, index, 'branches', 'Удалить зал')),
    pair('Название зала', zone, 'name', 'branches'),
    h('div', { class: 'grid' }, field('Герцовка, например «280–420 Гц»', input(zone, 'hz', 'branches')), field('Сколько ПК (можно не указывать)', input(zone, 'pcs', 'branches', { numeric: true }))),
    field('Мониторы', monitors),
    h('div', { class: 'grid' }, SPEC_FIELDS.map(([key, label]) => field(label, input(zone.specs, key, 'branches')))),
  );
}

function viewClubs() {
  const club = currentClub();
  if (!club.geo) club.geo = {};
  if (!club.rating) club.rating = {};
  return [
    h('div', { class: 'head' }, h('h2', {}, 'Клубы'), clubPills()),
    h('section', { class: 'card' },
      h('h3', {}, 'Адрес и контакты'),
      h('div', { class: 'grid' }, field('Название клуба', input(club, 'name', 'branches')), field('Цвет клуба', input(club, 'accent', 'branches', { type: 'color' }))),
      pair('Адрес', club, 'address', 'branches'),
      pair('Уточнение: этаж, вход', club, 'addressNote', 'branches'),
      pair('Район', club, 'district', 'branches'),
      pair('Режим работы', club, 'hours', 'branches'),
      h('div', { class: 'grid' },
        field('WhatsApp: 11 цифр без плюса', input(club, 'whatsapp', 'branches', { placeholder: '77001234567' })),
        field('Телефон для звонка', input(club, 'phone', 'branches', { placeholder: '+77001234567' })),
        field('Почта (необязательно)', input(club, 'email', 'branches', { type: 'email' })),
      ),
      checkbox('Скрыть клуб с сайта', club, 'hidden', 'branches'),
    ),
    h('section', { class: 'card' },
      h('h3', {}, '2ГИС'),
      h('p', { class: 'muted' }, `Рейтинг переписывается вручную из карточки клуба в 2ГИС. Последнее обновление: ${state.content.site.ratingsUpdated || 'не указано'}.`),
      h('div', { class: 'grid' },
        field('Рейтинг, например 4.8', input(club.rating, 'value', 'branches', { numeric: true })),
        field('Число оценок', input(club.rating, 'count', 'branches', { numeric: true })),
        field('Число отзывов', input(club.rating, 'reviews', 'branches', { numeric: true })),
        field('Номер карточки в 2ГИС', input(club, 'gisFirmId', 'branches')),
        field('Широта', input(club.geo, 'lat', 'branches', { numeric: true })),
        field('Долгота', input(club.geo, 'lon', 'branches', { numeric: true })),
      ),
      field('Заметка «проверить» (видна только в админке)', input(club, 'needsReview', 'branches', { multiline: true, rows: 2 })),
    ),
    h('div', { class: 'head' }, h('h2', {}, 'Залы и железо'),
      h('button', { class: 'btn', type: 'button', onclick: () => {
        const name = prompt('Название нового зала');
        if (!name) return;
        club.zones.push({ id: makeId(name, club.zones.map((z) => z.id), 'zone'), name, hz: '', pcs: null, specs: { monitor: [], ram: '32 ГБ' }, prices: {} });
        touch('branches');
        render();
      } }, '+ Добавить зал')),
    club.zones.map((zone, i) => zoneCard(club, zone, i)),
    h('div', { class: 'head' }, h('h2', {}, 'Приставки'),
      h('button', { class: 'btn', type: 'button', onclick: () => {
        const name = prompt('Название, например «PS5 · VIP»', 'PlayStation 5');
        if (!name) return;
        club.consoles.push({ id: makeId(name, club.consoles.map((c) => c.id), 'ps5'), name, prices: {} });
        touch('branches');
        render();
      } }, '+ Добавить приставку')),
    club.consoles.map((item, i) => h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h3', {}, item.name), tools(club.consoles, i, 'branches', 'Удалить приставку')),
      pair('Название', item, 'name', 'branches'),
      h('p', { class: 'muted' }, 'Цены приставок меняются на вкладке «Цены».'),
    )),
  ];
}

// --- фото

async function photoGrid(scope, id, { single = false } = {}) {
  const box = h('div', {});
  const base = `/photos/${scope}/${id}`;

  async function load(list) {
    const photos = list ?? (await api('GET', base)).data.photos ?? [];
    const status = h('p', { class: 'muted' });
    const picker = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: !single, hidden: true });
    picker.addEventListener('change', async () => {
      const files = [...picker.files];
      let latest = photos;
      for (const [i, file] of files.entries()) {
        status.textContent = `Загружается ${i + 1} из ${files.length}…`;
        const result = await api('POST', base, file, { raw: true });
        if (!result.ok) { alert(`${file.name}: ${result.data.error || 'не удалось загрузить'}`); break; }
        latest = result.data.photos;
      }
      watchBuild();
      load(latest);
    });
    const act = async (method, path, body) => {
      const result = await api(method, base + path, body);
      if (!result.ok) return alert(result.data.error || 'Не получилось');
      watchBuild();
      load(result.data.photos);
    };
    const order = (from, to) => {
      const names = photos.map((p) => p.name);
      names.splice(to, 0, names.splice(from, 1)[0]);
      act('PUT', '/order', { names });
    };

    box.replaceChildren(
      h('div', { class: 'photos' }, photos.map((photo, i) => h('div', { class: 'photo' },
        h('img', { src: `/admin/api${base}/${encodeURIComponent(photo.name)}/thumb`, alt: '', loading: 'lazy' }),
        i === 0 && !single ? h('span', { class: 'photo__cover' }, 'Обложка') : null,
        h('div', { class: 'photo__tools' },
          single ? null : h('button', { class: 'btn btn--sm', type: 'button', title: 'Левее', disabled: i === 0, onclick: () => order(i, i - 1) }, '←'),
          single ? null : h('button', { class: 'btn btn--sm', type: 'button', title: 'Правее', disabled: i === photos.length - 1, onclick: () => order(i, i + 1) }, '→'),
          single || i === 0 ? null : h('button', { class: 'btn btn--sm', type: 'button', title: 'Сделать обложкой', onclick: () => order(i, 0) }, '★'),
          h('button', { class: 'btn btn--sm btn--danger', type: 'button', onclick: () => confirm('Удалить фото?') && act('DELETE', `/${encodeURIComponent(photo.name)}`) }, 'Удалить'),
        ),
      ))),
      h('div', { class: 'head' },
        single && photos.length ? h('span', {}) : h('button', { class: 'btn', type: 'button', onclick: () => picker.click() }, single ? 'Загрузить афишу' : '+ Загрузить фото'),
        status,
      ),
      picker,
    );
  }
  await load();
  return box;
}

async function viewPhotos() {
  const club = currentClub();
  return [
    h('div', { class: 'head' }, h('h2', {}, 'Фото клубов'), clubPills()),
    h('p', { class: 'muted' }, 'Первое фото — обложка клуба на главной и картинка в превью ссылки. Фото публикуются сразу после загрузки, кнопка «Сохранить» для них не нужна. Подойдут JPEG, PNG и WebP до 20 МБ, большие уменьшаются сами.'),
    h('section', { class: 'card' }, h('h3', {}, `Pacman ${club.name}`), await photoGrid('clubs', club.slug)),
  ];
}

// --- акции

function viewPromos() {
  const promos = state.content.site.promos;
  return [
    h('div', { class: 'head' }, h('h2', {}, 'Акции'),
      h('button', { class: 'btn', type: 'button', onclick: () => {
        const title = prompt('Название акции');
        if (!title) return;
        promos.push({ id: makeId(title, promos.map((p) => p.id), 'promo'), title, color: '#FFF200' });
        touch('site');
        render();
      } }, '+ Добавить акцию')),
    h('p', { class: 'muted' }, 'Справа на карточке акции показывается либо цена с единицей («300 ₸/час»), либо плашка («+1 час»). Если указана цена, плашка не используется.'),
    promos.map((promo, i) => h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h3', {}, promo.title || 'Акция'), tools(promos, i, 'site', 'Удалить акцию')),
      pair('Название', promo, 'title', 'site'),
      pair('Для кого', promo, 'audience', 'site'),
      h('div', { class: 'grid' }, field('Цена, ₸ (можно не указывать)', input(promo, 'price', 'site', { numeric: true })), field('Цвет', input(promo, 'color', 'site', { type: 'color' }))),
      pair('Единица цены, например «₸/час»', promo, 'unit', 'site'),
      pair('Плашка, например «+1 час»', promo, 'badge', 'site'),
      pair('Условия', promo, 'note', 'site', { multiline: true }),
      checkbox('Скрыть акцию с сайта', promo, 'hidden', 'site'),
    )),
  ];
}

// --- события

async function viewEvents() {
  const events = state.content.events;
  const branches = state.content.branches;
  const savedIds = new Set((state.saved.events || []).map((e) => e.id));
  const cards = [];
  for (const [i, event] of events.entries()) {
    const branchSelect = h('select', {}, h('option', { value: '' }, 'Все клубы'), branches.map((b) => h('option', { value: b.slug }, `Pacman ${b.name}`)));
    branchSelect.value = event.branch || '';
    branchSelect.addEventListener('change', () => { if (branchSelect.value) event.branch = branchSelect.value; else delete event.branch; touch('events'); });
    cards.push(h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h3', {}, event.title || 'Событие'), tools(events, i, 'events', 'Удалить событие')),
      pair('Название', event, 'title', 'events'),
      h('div', { class: 'grid' },
        field('Дата начала', input(event, 'date', 'events', { type: 'date' })),
        field('Дата окончания (если больше одного дня)', input(event, 'dateEnd', 'events', { type: 'date' })),
        field('Время начала', input(event, 'time', 'events', { type: 'time' })),
        field('Клуб', branchSelect),
      ),
      pair('Описание', event, 'description', 'events', { multiline: true }),
      pair('Призовой фонд', event, 'prize', 'events'),
      field('Ссылка «Подробнее»: пост в Instagram или регламент', input(event, 'link', 'events', { type: 'url', placeholder: 'https://' })),
      checkbox('Скрыть событие с сайта', event, 'hidden', 'events'),
      h('h3', {}, 'Афиша'),
      savedIds.has(event.id) ? await photoGrid('events', event.id, { single: true }) : h('p', { class: 'muted' }, 'Сначала сохраните событие, потом можно будет загрузить афишу.'),
    ));
  }
  return [
    h('div', { class: 'head' }, h('h2', {}, 'Турниры и события'),
      h('button', { class: 'btn', type: 'button', onclick: () => {
        const title = prompt('Название события');
        if (!title) return;
        const date = new Date().toISOString().slice(0, 10);
        events.unshift({ id: makeId(`${date}-${title}`, events.map((e) => e.id), 'event'), title, date });
        touch('events');
        render();
      } }, '+ Добавить событие')),
    h('p', { class: 'muted' }, 'Раздел появляется на сайте, когда есть хотя бы одно предстоящее событие. Прошедшие события скрываются сами на следующий день после окончания.'),
    events.length ? cards : h('p', { class: 'notice' }, 'Событий пока нет: раздел на сайте скрыт.'),
  ];
}

// --- общее

function stringList(title, list, section, addLabel) {
  return h('section', { class: 'card' },
    h('div', { class: 'card__head' }, h('h3', {}, title), h('button', { class: 'btn btn--sm', type: 'button', onclick: () => { list.push(''); touch(section); render(); } }, addLabel)),
    list.map((text, i) => {
      const area = h('textarea', { rows: 2 });
      area.value = text;
      area.addEventListener('input', () => { list[i] = area.value; touch(section); });
      return h('div', { class: 'card__head' }, h('div', { style: 'flex:1;min-width:220px' }, area), tools(list, i, section, 'Удалить пункт'));
    }),
  );
}

function viewGeneral() {
  const site = state.content.site;
  site.rules_kk ??= [];
  return [
    h('h2', {}, 'Общее'),
    h('section', { class: 'card' },
      h('h3', {}, 'Сеть и соцсети'),
      h('div', { class: 'grid' }, field('Название сети', input(site, 'brand', 'site')), field('Слоган (в подвале сайта)', input(site, 'tagline', 'site'))),
      pair('Город', site, 'city', 'site'),
      h('div', { class: 'grid' }, field('Ссылка на Instagram', input(site, 'instagram', 'site', { type: 'url' })), field('Имя в Instagram', input(site, 'instagramHandle', 'site')), field('Дата обновления рейтингов 2ГИС', input(site, 'ratingsUpdated', 'site', { type: 'date' }))),
    ),
    h('section', { class: 'card' },
      h('h3', {}, 'Пакеты'),
      h('p', { class: 'muted' }, 'Названия и часы действия пакетов едины для всех клубов. Цены пакетов меняются на вкладке «Цены».'),
      site.packages.map((pack) => h('div', {},
        pair(`Пакет «${pack.name}»`, pack, 'name', 'site'),
        h('div', { class: 'grid' }, field('Начало', input(pack, 'from', 'site', { type: 'time' })), field('Конец', input(pack, 'to', 'site', { type: 'time' }))),
      )),
      pair('Примечание под прайсом', site, 'packageNote', 'site', { multiline: true, rows: 2 }),
    ),
    h('div', { class: 'head' }, h('h2', {}, 'Удобства'),
      h('button', { class: 'btn', type: 'button', onclick: () => { site.features.push({ title: '', text: '' }); touch('site'); render(); } }, '+ Добавить удобство')),
    site.features.map((feature, i) => h('section', { class: 'card' },
      h('div', { class: 'card__head' }, h('h3', {}, feature.title || 'Удобство'), tools(site.features, i, 'site', 'Удалить')),
      pair('Заголовок', feature, 'title', 'site'),
      pair('Описание', feature, 'text', 'site', { multiline: true, rows: 2 }),
    )),
    stringList('Правила посещения', site.rules, 'site', '+ Пункт'),
    stringList('Правила посещения · қазақша', site.rules_kk, 'site', '+ Пункт'),
  ];
}

const VIEWS = { prices: viewPrices, clubs: viewClubs, photos: viewPhotos, promos: viewPromos, events: viewEvents, general: viewGeneral };

let renderToken = 0;
async function render() {
  const token = ++renderToken;
  $('tabs').replaceChildren(...TABS.map(([id, label]) => h('button', { type: 'button', 'aria-selected': String(id === state.tab), onclick: () => { state.tab = id; render(); } }, label)));
  const scroll = window.scrollY;
  const nodes = await VIEWS[state.tab]();
  if (token !== renderToken) return;
  $('view').replaceChildren(...nodes.flat().filter(Boolean));
  window.scrollTo(0, scroll);
}

// ---------- сохранение и публикация

function showDialog(title, body) {
  const dialog = $('dialog');
  dialog.replaceChildren(h('h2', {}, title), body, h('button', { class: 'btn btn--primary', type: 'button', onclick: () => dialog.close() }, 'Понятно'));
  dialog.showModal();
}

async function save() {
  $('save').disabled = true;
  const problems = [];
  for (const name of [...state.dirty]) {
    const result = await api('PUT', `/content/${name}`, state.content[name]);
    if (result.ok) {
      state.content[name] = result.data.data;
      state.saved[name] = structuredClone(result.data.data);
      if (name !== 'site' && !state.dirty.has('site')) state.content.site = result.data.site;
      if (name !== 'site') state.saved.site = structuredClone(result.data.site);
      state.dirty.delete(name);
      setBuild(result.data.build);
    } else {
      problems.push(...(result.data.errors || [result.data.error || 'Не удалось сохранить']));
    }
  }
  syncSavebar();
  if (problems.length) showDialog('Не всё сохранилось', h('ul', {}, problems.map((text) => h('li', {}, text))));
  else watchBuild();
  render();
}

function discard() {
  if (!confirm('Отменить все несохранённые изменения?')) return;
  state.content = structuredClone(state.saved);
  state.dirty.clear();
  syncSavebar();
  render();
}

const clock = (ts) => new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

function setBuild(build) {
  state.build = build;
  const el = $('build-status');
  el.dataset.state = build.status;
  el.textContent = build.status === 'building' ? 'Публикуется…' : build.status === 'error' ? 'Ошибка публикации' : build.finishedAt ? `Опубликовано в ${clock(build.finishedAt)}` : 'Сайт опубликован';
}

let buildTimer = null;
function watchBuild() {
  clearTimeout(buildTimer);
  const poll = async () => {
    const result = await api('GET', '/build');
    if (!result.ok) return;
    setBuild(result.data);
    if (result.data.status === 'building' || result.data.pending) buildTimer = setTimeout(poll, 1500);
  };
  buildTimer = setTimeout(poll, 400);
}

// ---------- вход

function showLogin() {
  $('app').hidden = true;
  $('login').hidden = false;
  $('password').focus();
}

async function start() {
  const result = await api('GET', '/content');
  if (!result.ok) return showLogin();
  state.saved = { branches: result.data.branches, site: result.data.site, events: result.data.events };
  state.content = structuredClone(state.saved);
  state.club = state.content.branches[0].slug;
  setBuild(result.data.build);
  $('login').hidden = true;
  $('app').hidden = false;
  syncSavebar();
  render();
  if (result.data.build.status === 'building') watchBuild();
}

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = await api('POST', '/login', { password: $('password').value });
  $('login-error').textContent = result.ok ? '' : result.data.error || 'Не удалось войти';
  if (result.ok) {
    $('password').value = '';
    start();
  }
});

$('logout').addEventListener('click', async () => {
  if (state.dirty.size && !confirm('Есть несохранённые изменения. Выйти без сохранения?')) return;
  await api('POST', '/logout', {});
  state.dirty.clear();
  showLogin();
});

$('save').addEventListener('click', save);
$('discard').addEventListener('click', discard);
$('build-status').addEventListener('click', () => {
  const build = state.build;
  if (build?.status === 'error') {
    showDialog('Публикация не удалась', h('div', {}, h('p', {}, 'Посетители видят прежнюю версию сайта. Покажите этот текст разработчику:'), h('pre', {}, build.error || '')));
  } else if (confirm('Собрать и опубликовать сайт заново?')) {
    api('POST', '/build', {}).then((result) => { if (result.ok) { setBuild(result.data); watchBuild(); } });
  }
});

window.addEventListener('beforeunload', (event) => {
  if (state.dirty.size) event.preventDefault();
});

start();
