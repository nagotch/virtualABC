// データ永続化は MariaDB（mysql2）を使う。
// NeoShowcase はファイルシステムが再起動で揮発するため、SQLite ではデータが消える。
// MariaDB の接続情報は NeoShowcase が NS_MARIADB_* 環境変数で注入する。
// ローカル開発では DB_* もしくは 127.0.0.1 のMariaDBにフォールバックする。

import mysql from 'mysql2/promise';
import type { Pool, PoolConnection } from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';

const pool: Pool = mysql.createPool({
  host:     process.env.NS_MARIADB_HOSTNAME ?? process.env.DB_HOST ?? '127.0.0.1',
  port:     Number(process.env.NS_MARIADB_PORT ?? process.env.DB_PORT ?? 3306),
  user:     process.env.NS_MARIADB_USER ?? process.env.DB_USER ?? 'root',
  password: process.env.NS_MARIADB_PASSWORD ?? process.env.DB_PASSWORD ?? '',
  database: process.env.NS_MARIADB_DATABASE ?? process.env.DB_NAME ?? 'nagotch_virtual',
  waitForConnections: true,
  connectionLimit: 5,          // 180MiBメモリ制限のため接続数は控えめに
  charset: 'utf8mb4',
});

// 1行取得（無ければ undefined）
export async function dbGet<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return (rows[0] as T | undefined) ?? undefined;
}

// 全行取得
export async function dbAll<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return rows as unknown as T[];
}

// 書き込み（INSERT / UPDATE / DELETE / REPLACE）
export async function dbRun(sql: string, params: unknown[] = []): Promise<void> {
  await pool.query(sql, params);
}

// トランザクション。コールバック内で受け取った接続でクエリを発行する。
export async function dbTx<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// スキーマ作成。MariaDB は再起動で揮発しないが、初回は空なので毎回 IF NOT EXISTS で用意する。
// SQLite と違いマイグレーション用の PRAGMA 分岐は不要（最終スキーマを直接定義する）。
export async function initDb(): Promise<void> {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      traq_id       VARCHAR(64) PRIMARY KEY,
      atcoder_id    VARCHAR(64) NOT NULL,
      allow_mention TINYINT NOT NULL DEFAULT 0,       -- リマインドで@メンションを許可するか
      created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS contests (
      id               VARCHAR(32) PRIMARY KEY,
      title            VARCHAR(255) NOT NULL,
      mode             VARCHAR(16) NOT NULL,          -- 'random' | 'color' | 'manual'
      created_by       VARCHAR(64) NOT NULL,          -- traq_id
      created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      start_at         VARCHAR(32),                   -- ISO8601 (UTC)
      duration_minutes INT,
      recurring_id     VARCHAR(32),                   -- 定期生成元の設定ID
      rated            TINYINT NOT NULL DEFAULT 1,    -- レート変動（adminのみ1可）
      standings_notified TINYINT NOT NULL DEFAULT 0,  -- 終了後の順位表通知済みフラグ
      reminder_sent    TINYINT NOT NULL DEFAULT 0     -- 開始前リマインド送信済みフラグ
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS recurring_contests (
      id               VARCHAR(32) PRIMARY KEY,
      title            VARCHAR(255) NOT NULL,
      freq             VARCHAR(16) NOT NULL,          -- 'daily' | 'weekly'
      weekday          INT,                           -- 0=日..6=土 (weeklyのみ, JST基準)
      hour             INT NOT NULL,                  -- 開始時刻 時 0-23 (JST)
      minute           INT NOT NULL,                  -- 開始時刻 分 0-59 (JST)
      duration_minutes INT NOT NULL,
      mode             VARCHAR(16) NOT NULL,          -- 'random' | 'color'
      \`count\`          INT,                           -- random用 問題数
      color_spec       TEXT,                          -- color用 JSON
      rated            TINYINT NOT NULL DEFAULT 0,
      enabled          TINYINT NOT NULL DEFAULT 1,
      created_by       VARCHAR(64) NOT NULL,
      created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS contest_problems (
      contest_id      VARCHAR(32) NOT NULL,
      idx             INT NOT NULL,                  -- 表示順 (0始まり)
      problem_id      VARCHAR(64) NOT NULL,          -- 例: abc300_a
      atcoder_contest VARCHAR(32) NOT NULL,          -- 例: abc300
      problem_index   VARCHAR(8) NOT NULL,           -- 例: A
      title           VARCHAR(255) NOT NULL,
      difficulty      INT,                           -- 推定難易度 (null可)
      color           VARCHAR(16),                   -- 色キー (null可)
      url             VARCHAR(255) NOT NULL,
      points          INT NOT NULL DEFAULT 100,      -- 配点（順位表用）
      PRIMARY KEY (contest_id, idx)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS participants (
      contest_id  VARCHAR(32) NOT NULL,
      traq_id     VARCHAR(64) NOT NULL,
      atcoder_id  VARCHAR(64) NOT NULL,
      rated       TINYINT NOT NULL DEFAULT 1,        -- 参加者ごとのレート対象フラグ
      PRIMARY KEY (contest_id, traq_id)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS sessions (
      id         VARCHAR(64) PRIMARY KEY,
      traq_id    VARCHAR(64) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS reported_submissions (
      submission_id BIGINT PRIMARY KEY,              -- AtCoderの提出ID（冪等性のためPK）
      atcoder_id    VARCHAR(64) NOT NULL,
      problem_id    VARCHAR(64) NOT NULL,
      result        VARCHAR(16) NOT NULL,            -- AC, WA, ...
      epoch_second  BIGINT NOT NULL,                 -- 提出時刻(unix)
      source        VARCHAR(8) NOT NULL DEFAULT 'script', -- 'api'(信頼) | 'script'(予測用)
      reported_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_reported_atcoder (atcoder_id, epoch_second)
    )
  `);

  // 既存DB（source列が無い旧スキーマ）へのマイグレーション。
  // 既存行はソース不明のため、信頼できない 'script' 扱いにする（不正対策）。
  // 'api'(AtCoder Problems由来) はポーラーが再取得した時点で上書きされる。
  await dbRun(`
    ALTER TABLE reported_submissions
      ADD COLUMN IF NOT EXISTS source VARCHAR(8) NOT NULL DEFAULT 'script'
  `);

  // contests に「順位表通知済み」フラグを追加（既存DB移行）。
  // 列の追加が初回のときだけ、既に終了済みのコンテストを通知済み扱いにして、
  // デプロイ直後に過去コンテストの結果通知が一斉に飛ぶのを防ぐ。
  const hasNotifiedCol = await dbGet<{ x: number }>(
    `SELECT 1 AS x FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'contests'
        AND column_name = 'standings_notified'`,
  );
  await dbRun(`
    ALTER TABLE contests
      ADD COLUMN IF NOT EXISTS standings_notified TINYINT NOT NULL DEFAULT 0
  `);
  if (!hasNotifiedCol) {
    const rows = await dbAll<{ id: string; start_at: string | null; duration_minutes: number | null }>(
      'SELECT id, start_at, duration_minutes FROM contests',
    );
    const now = Date.now();
    for (const r of rows) {
      const end = r.start_at ? new Date(r.start_at).getTime() + (r.duration_minutes ?? 0) * 60_000 : 0;
      if (!r.start_at || now >= end) {
        await dbRun('UPDATE contests SET standings_notified = 1 WHERE id = ?', [r.id]);
      }
    }
  }

  // users に @メンション許可フラグを追加（既存DB移行。既定0でOK）。
  await dbRun(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS allow_mention TINYINT NOT NULL DEFAULT 0
  `);

  // contests に開始前リマインド送信済みフラグを追加（既存DB移行）。
  // 初回追加時のみ、既に開始済みのコンテストは送信済み扱いにして、
  // デプロイ直後に開始前リマインドが過去分へ飛ぶのを防ぐ。
  const hasReminderCol = await dbGet<{ x: number }>(
    `SELECT 1 AS x FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'contests'
        AND column_name = 'reminder_sent'`,
  );
  await dbRun(`
    ALTER TABLE contests
      ADD COLUMN IF NOT EXISTS reminder_sent TINYINT NOT NULL DEFAULT 0
  `);
  if (!hasReminderCol) {
    const rows = await dbAll<{ id: string; start_at: string | null }>(
      'SELECT id, start_at FROM contests',
    );
    const now = Date.now();
    for (const r of rows) {
      const start = r.start_at ? new Date(r.start_at).getTime() : 0;
      if (!r.start_at || now >= start) {
        await dbRun('UPDATE contests SET reminder_sent = 1 WHERE id = ?', [r.id]);
      }
    }
  }
}

export { pool };
