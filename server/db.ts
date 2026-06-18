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

// 旧スキーマ（atcoder_contest列を持つ）から移行。コンテストデータはまだ
// 本番利用していないため、古い定義の場合は作り直す。
const contestCols = db
  .query<{ name: string }, []>("PRAGMA table_info(contests)")
  .all()
  .map((r) => r.name);
if (contestCols.includes('atcoder_contest')) {
  db.run('DROP TABLE IF EXISTS contests');
  db.run('DROP TABLE IF EXISTS contest_problems');
}

db.run(`
  CREATE TABLE IF NOT EXISTS contests (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    mode        TEXT NOT NULL,            -- 'random' | 'color'
    created_by  TEXT NOT NULL,            -- traq_id
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS contest_problems (
    contest_id      TEXT NOT NULL,
    idx             INTEGER NOT NULL,     -- 表示順 (0始まり)
    problem_id      TEXT NOT NULL,        -- 例: abc300_a
    atcoder_contest TEXT NOT NULL,        -- 例: abc300
    problem_index   TEXT NOT NULL,        -- 例: A
    title           TEXT NOT NULL,
    difficulty      INTEGER,              -- 推定難易度 (null可)
    color           TEXT,                 -- 色キー (null可)
    url             TEXT NOT NULL,
    PRIMARY KEY (contest_id, idx)
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

db.run(`
  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    traq_id    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

export default db;
