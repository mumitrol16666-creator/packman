// Адрес приёма событий задаётся в .env (PUBLIC_TRACK_URL). Пока бэкенда нет — события никуда не уходят.
const endpoint = import.meta.env?.PUBLIC_TRACK_URL;

export function track(event, props = {}) {
  if (!endpoint) return;
  const body = JSON.stringify({ event, props, path: location.pathname, ts: Date.now() });
  try {
    if (!navigator.sendBeacon?.(endpoint, new Blob([body], { type: 'application/json' }))) {
      fetch(endpoint, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } });
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
