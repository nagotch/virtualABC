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

// 開催日時・実施時間カラムを追加（旧版から移行）
const curCols = db
  .query<{ name: string }, []>("PRAGMA table_info(contests)")
  .all()
  .map((r) => r.name);
if (!curCols.includes('start_at')) {
  db.run("ALTER TABLE contests ADD COLUMN start_at TEXT");          // ISO8601 (UTC)
}
if (!curCols.includes('duration_minutes')) {
  db.run("ALTER TABLE contests ADD COLUMN duration_minutes INTEGER");
}

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
    points          INTEGER NOT NULL DEFAULT 100, -- 配点（順位表用）
    PRIMARY KEY (contest_id, idx)
  )
`);

// points カラム追加（旧版から移行。既存行は (idx+1)*100 で埋める）
const cpCols = db
  .query<{ name: string }, []>("PRAGMA table_info(contest_problems)")
  .all()
  .map((r) => r.name);
if (!cpCols.includes('points')) {
  db.run("ALTER TABLE contest_problems ADD COLUMN points INTEGER NOT NULL DEFAULT 100");
  db.run("UPDATE contest_problems SET points = (idx + 1) * 100");
}

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

// ユーザースクリプトからの提出報告に使うトークン（ユーザーごと）
const userCols = db
  .query<{ name: string }, []>("PRAGMA table_info(users)")
  .all()
  .map((r) => r.name);
if (!userCols.includes('api_token')) {
  db.run("ALTER TABLE users ADD COLUMN api_token TEXT");
}

// ユーザースクリプトが報告したAtCoder提出（リアルタイム順位表用）
db.run(`
  CREATE TABLE IF NOT EXISTS reported_submissions (
    submission_id INTEGER PRIMARY KEY,   -- AtCoderの提出ID（冪等性のためPK）
    atcoder_id    TEXT NOT NULL,
    problem_id    TEXT NOT NULL,
    result        TEXT NOT NULL,         -- AC, WA, ...
    epoch_second  INTEGER NOT NULL,      -- 提出時刻(unix)
    reported_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);
db.run('CREATE INDEX IF NOT EXISTS idx_reported_atcoder ON reported_submissions (atcoder_id, epoch_second)');

export default db;
