import { dailyReport, monthlyReport, weeklyReport } from './report.js';
import { hasEventsBefore } from './stats.js';
import { addDays, localParts, monthStart, previousMonth, weekStart } from './time.js';

/**
 * Какие отчёты пора отправить. Учитывается только последний завершённый период каждого вида,
 * поэтому после простоя сервер не заваливает канал старыми отчётами.
 */
export function dueReports(now, timezone, reportHour, isSent) {
  const { day, hour } = localParts(now, timezone);
  const due = [];

  const yesterday = addDays(day, -1);
  if (hour >= reportHour && !isSent('daily', yesterday)) due.push({ kind: 'daily', period: yesterday });

  // недельный отчёт уходит в понедельник; если сервер в этот момент лежал — в первый же час после запуска
  const lastWeek = addDays(weekStart(day), -7);
  const mondayPassed = day > weekStart(day) || hour >= reportHour;
  if (mondayPassed && !isSent('weekly', lastWeek)) due.push({ kind: 'weekly', period: lastWeek });

  const lastMonth = previousMonth(day);
  const firstPassed = day > monthStart(day) || hour >= reportHour;
  if (firstPassed && !isSent('monthly', lastMonth.from.slice(0, 7))) due.push({ kind: 'monthly', period: lastMonth.from.slice(0, 7), ...lastMonth });

  return due;
}

export function buildReport(db, item, siteName) {
  if (item.kind === 'daily') return dailyReport(db, item.period, siteName);
  if (item.kind === 'weekly') return weeklyReport(db, item.period, siteName);
  return monthlyReport(db, item.from, item.to, siteName);
}

function periodEnd(item) {
  if (item.kind === 'daily') return item.period;
  if (item.kind === 'weekly') return addDays(item.period, 6);
  return item.to;
}

/** Один проход планировщика: отправляет то, что пора, и запоминает отправленное. Возвращает список отправленного. */
export async function runScheduler({ db, config, send, now = Date.now() }) {
  const sentStmt = db.prepare('SELECT 1 AS x FROM reports_sent WHERE kind = ? AND period = ?');
  const markStmt = db.prepare('INSERT OR REPLACE INTO reports_sent (kind, period, sent_at) VALUES (?, ?, ?)');
  const isSent = (kind, period) => Boolean(sentStmt.get(kind, period));
  const done = [];

  for (const item of dueReports(now, config.timezone, config.reportHour, isSent)) {
    // счётчик поставили позже, чем закончился период: отчёт был бы пустым и бессмысленным
    if (!hasEventsBefore(db, periodEnd(item))) {
      markStmt.run(item.kind, item.period, now);
      continue;
    }
    const result = await send(buildReport(db, item, config.siteName));
    if (result.dryRun) continue;
    markStmt.run(item.kind, item.period, now);
    done.push(item);
  }
  return done;
}
