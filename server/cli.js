#!/usr/bin/env node
// node server/cli.js demo                         — три отчёта на тестовых данных
// node server/cli.js report daily [--date=YYYY-MM-DD] [--send]
// node server/cli.js report weekly|monthly [--send]
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { seedDemo } from './demo.js';
import { dailyReport, monthlyReport, weeklyReport } from './report.js';
import { sendTelegram } from './telegram.js';
import { addDays, localParts, previousMonth, weekStart } from './time.js';

const [command, kind] = process.argv.slice(2);
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const config = loadConfig();
const plain = (html) => html.replace(/<[^>]+>/g, '');

if (command === 'demo') {
  const db = openDb(':memory:');
  const today = localParts(Date.now(), config.timezone).day;
  seedDemo(db, addDays(today, -1));
  const month = previousMonth(today);
  for (const text of [
    dailyReport(db, addDays(today, -1), config.siteName),
    weeklyReport(db, addDays(weekStart(today), -7), config.siteName),
    monthlyReport(db, month.from, month.to, config.siteName),
  ]) console.log(`${plain(text)}\n\n${'─'.repeat(48)}\n`);
} else if (command === 'report' && ['daily', 'weekly', 'monthly'].includes(kind)) {
  const db = openDb(config.dbPath);
  const today = flags.date || localParts(Date.now(), config.timezone).day;
  const month = previousMonth(today);
  const html =
    kind === 'daily' ? dailyReport(db, flags.date || addDays(today, -1), config.siteName)
    : kind === 'weekly' ? weeklyReport(db, addDays(weekStart(today), -7), config.siteName)
    : monthlyReport(db, month.from, month.to, config.siteName);
  console.log(plain(html));
  if ('send' in flags) {
    const result = await sendTelegram({ token: config.botToken, chat: config.reportChat, html });
    console.log(result.dryRun ? '\nНе отправлено: задай TG_BOT_TOKEN и TG_REPORT_CHAT_ID.' : '\nОтправлено в Telegram.');
  }
} else {
  console.log('Команды: demo | report daily|weekly|monthly [--date=YYYY-MM-DD] [--send]');
  process.exitCode = 1;
}
