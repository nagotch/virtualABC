import { Database } from 'bun:sqlite';
import { mkdirSync } from 'fs';

mkdirSync('data', { recursive: true });

const db = new Database('data/virtualABC.db', { create: true });
db.run('PRAGMA journal_mode = WAL');

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    traq_id    TEXT PRIMARY KEY,
    atcoder_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS contests (
    id               TEXT PRIMARY KEY,
    atcoder_contest  TEXT NOT NULL,
    start_time       TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    status           TEXT NOT NULL DEFAULT 'active',
    created_by       TEXT NOT NULL,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS participants (
    contest_id  TEXT NOT NULL,
    traq_id     TEXT NOT NULL,
    atcoder_id  TEXT NOT NULL,
    PRIMARY KEY (contest_id, traq_id)
  )
`);

export default db;
