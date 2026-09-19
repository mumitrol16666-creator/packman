// Обезличенная статистика сайта. Адрес приёма событий задаётся в .env (PUBLIC_TRACK_URL);
// без него события никуда не уходят. Куки не используются, имена и телефоны не собираются.
const endpoint = import.meta.env?.PUBLIC_TRACK_URL;
const metrikaId = Number(import.meta.env?.PUBLIC_METRIKA_ID) || null;

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'];

function store(kind) {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Свои посещения (админы, разработчик) исключаются ссылкой ?internal=1, вернуть обратно — ?internal=0. */
function isInternal() {
  const flag = new URLSearchParams(location.search).get('internal');
  const local = store('local');
  if (flag === '1') local?.setItem('pm_internal', '1');
  if (flag === '0') local?.removeItem('pm_internal');
  return local?.getItem('pm_internal') === '1';
}

/** Идентификатор живёт только до закрытия вкладки и нужен, чтобы отличать визиты друг от друга. */
function sessionId() {
  const session = store('session');
  let id = session?.getItem('pm_sid');
  if (!id) {
    id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    session?.setItem('pm_sid', id);
  }
  return id;
}

/** Метки рекламы запоминаются на визит, чтобы заявка с третьей страницы знала свой источник. */
function attribution() {
  const session = store('session');
  const saved = JSON.parse(session?.getItem('pm_utm') || 'null');
  if (saved) return saved;
  const params = new URLSearchParams(location.search);
  const utm = {};
  for (const key of UTM_KEYS) if (params.get(key)) utm[key.replace('utm_', '')] = params.get(key).slice(0, 60);
  let referrer = null;
  try {
    const host = document.referrer ? new URL(document.referrer).hostname : '';
    if (host && host !== location.hostname) referrer = host;
  } catch {}
  const result = { ...utm, referrer };
  session?.setItem('pm_utm', JSON.stringify(result));
  return result;
}

function device() {
  const w = window.innerWidth;
  return w < 768 ? 'mobile' : w < 1100 ? 'tablet' : 'desktop';
}

export function track(event, props = {}) {
  if (metrikaId && event !== 'pageview' && event !== 'engaged' && event !== 'section_view') {
    window.ym?.(metrikaId, 'reachGoal', event, props);
  }
  if (!endpoint || isInternal()) return;
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const body = JSON.stringify({
    event,
    path: location.pathname.slice(base.length) || '/',
    session: sessionId(),
    device: device(),
    lang: document.documentElement.lang || 'ru',
    ...attribution(),
    ...props,
  });
  try {
    // text/plain не требует предварительного CORS-запроса, сервер разбирает тело как JSON
    if (!navigator.sendBeacon?.(endpoint, new Blob([body], { type: 'text/plain' }))) {
      fetch(endpoint, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } });
    }
  } catch {}
}

/** Клики по элементам с data-track уходят как события; data-branch и data-zone — как свойства. */
export function trackClicks() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest?.('[data-track]');
    if (!el || el.id === 'bk-send') return;
    track(el.dataset.track, { branch: el.dataset.branch ?? null, zone: el.dataset.zone ?? null });
  });
}

/** Какие разделы человек реально увидел: событие уходит один раз на раздел за визит. */
export function trackSections() {
  if (!('IntersectionObserver' in window)) return;
  const seen = new Set();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || seen.has(entry.target.id)) continue;
        seen.add(entry.target.id);
        track('section_view', { section: entry.target.id });
      }
    },
    { threshold: 0.25 },
  );
  document.querySelectorAll('section[id]').forEach((section) => observer.observe(section));
}

/** Время, пока вкладка была на экране. Отправляется, когда человек уходит со страницы или сворачивает её. */
export function trackEngagement() {
  let visibleSince = document.visibilityState === 'visible' ? Date.now() : null;
  let total = 0;
  const flush = () => {
    if (visibleSince) total += Date.now() - visibleSince;
    visibleSince = null;
    if (total >= 1000) track('engaged', { ms: Math.min(total, 30 * 60 * 1000) });
    total = 0;
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
    else visibleSince = Date.now();
  });
  window.addEventListener('pagehide', flush);
}
