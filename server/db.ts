import { Database } from 'bun:sqlite';
import { mkdirSync } from 'fs';

mkdirSync('data', { recursive: true });

const db = new Database('data/nagotch_virtual.db', { create: true });
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
// 定期コンテストから自動生成された回はその設定IDを持つ（重複生成防止・紐付け用）
if (!curCols.includes('recurring_id')) {
  db.run("ALTER TABLE contests ADD COLUMN recurring_id TEXT");
}
// レート変動の有無。adminのみ rated=1 のコンテストを作成できる。
// 既存データは従来どおりレート対象として扱うため 1 で埋める。
if (!curCols.includes('rated')) {
  db.run("ALTER TABLE contests ADD COLUMN rated INTEGER NOT NULL DEFAULT 1");
}

// 定期開催の設定（毎日 / 毎週）。スケジューラが開始の前日に各回を生成する。
db.run(`
  CREATE TABLE IF NOT EXISTS recurring_contests (
    id               TEXT PRIMARY KEY,
    title            TEXT NOT NULL,         -- ベースタイトル（生成時に日付を付与）
    freq             TEXT NOT NULL,         -- 'daily' | 'weekly'
    weekday          INTEGER,               -- 0=日..6=土 (weeklyのみ, JST基準)
    hour             INTEGER NOT NULL,      -- 開始時刻 時 0-23 (JST)
    minute           INTEGER NOT NULL,      -- 開始時刻 分 0-59 (JST)
    duration_minutes INTEGER NOT NULL,
    mode             TEXT NOT NULL,         -- 'random' | 'color'
    count            INTEGER,               -- random用 問題数
    color_spec       TEXT,                  -- color用 JSON ({"cyan":2,...})
    rated            INTEGER NOT NULL DEFAULT 0, -- レート変動（adminのみ1可）
    enabled          INTEGER NOT NULL DEFAULT 1,
    created_by       TEXT NOT NULL,         -- traq_id
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
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
    rated       INTEGER NOT NULL DEFAULT 1,  -- 参加者ごとのレート対象フラグ（本家のRated/Open参加に相当）
    PRIMARY KEY (contest_id, traq_id)
  )
`);
// rated カラム追加（旧版から移行。既存行は従来どおりレート対象として 1 で埋める）
const partCols = db
  .query<{ name: string }, []>("PRAGMA table_info(participants)")
  .all()
  .map((r) => r.name);
if (!partCols.includes('rated')) {
  db.run("ALTER TABLE participants ADD COLUMN rated INTEGER NOT NULL DEFAULT 1");
}

db.run(`
  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    traq_id    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

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
