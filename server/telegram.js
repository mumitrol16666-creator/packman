/** Отправка сообщения в Telegram. Без токена или чата ничего не шлёт и возвращает { dryRun: true }. */
export async function sendTelegram({ token, chat, html, fetchImpl = fetch }) {
  if (!token || !chat) return { ok: false, dryRun: true };
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: html, parse_mode: 'HTML', disable_web_page_preview: true }),
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(`Telegram: ${result.description || response.status}`);
  return { ok: true };
}
