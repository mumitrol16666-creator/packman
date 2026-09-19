import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,
    ts INTEGER NOT NULL,
    day TEXT NOT NULL,
    hour INTEGER NOT NULL,
    event TEXT NOT NULL,
    path TEXT NOT NULL,
    visitor TEXT NOT NULL,
    session TEXT NOT NULL,
    device TEXT,
    source TEXT,
    campaign TEXT,
    branch TEXT,
    zone TEXT,
    section TEXT,
    value INTEGER,
    code TEXT
  );
  CREATE INDEX IF NOT EXISTS events_day_event ON events (day, event);
  CREATE INDEX IF NOT EXISTS events_session ON events (session);
  CREATE TABLE IF NOT EXISTS reports_sent (
    kind TEXT NOT NULL,
    period TEXT NOT NULL,
    sent_at INTEGER NOT NULL,
    PRIMARY KEY (kind, period)
  );
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;');
  db.exec(SCHEMA);
  return db;
}

/** Секрет для обезличивания посетителей создаётся при первом запуске и живёт в базе, в .env его держать не нужно. */
export function visitorSecret(db) {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'visitor_secret'").get();
  if (row) return row.value;
  const value = randomBytes(32).toString('hex');
  db.prepare("INSERT INTO meta (key, value) VALUES ('visitor_secret', ?)").run(value);
  return value;
}

const INSERT = `INSERT INTO events (ts, day, hour, event, path, visitor, session, device, source, campaign, branch, zone, section, value, code)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export function insertEvent(db, e) {
  db.prepare(INSERT).run(e.ts, e.day, e.hour, e.event, e.path, e.visitor, e.session, e.device, e.source, e.campaign, e.branch, e.zone, e.section, e.value, e.code);
}
