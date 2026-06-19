# nagotch_virtual

過去の AtCoder 問題で作るバーチャルコンテストに参加し、**独自レート**を競う traP 内ツールです。

- 過去 ABC からランダム／難易度（色）指定／手動で問題セットを生成してコンテストを開催
- 参加者の提出を AtCoder Problems から取り込み、リアルタイムの**予測順位表**と、終了後の**確定順位表・確定レート**を算出
- traQ アカウントでログイン（OAuth2）。コンテスト作成・開始前リマインド・結果を traQ に通知
- 全ユーザーのレートランキング、レート推移グラフ、コンテスト成績をプロフィールで閲覧

---

## 目次

- [全体構成](#全体構成)
- [技術スタック](#技術スタック)
- [ディレクトリ構成](#ディレクトリ構成)
- [データモデル](#データモデル)
- [主要な仕組み](#主要な仕組み)
  - [認証（traQ OAuth2 + PKCE）](#認証traq-oauth2--pkce)
  - [問題セットの生成](#問題セットの生成)
  - [提出の取り込みと不正防止](#提出の取り込みと不正防止)
  - [順位表とパフォーマンス推定](#順位表とパフォーマンス推定)
  - [独自レーティング](#独自レーティング)
  - [定期実行（ポーラー / スケジューラ）](#定期実行ポーラー--スケジューラ)
  - [traQ 通知](#traq-通知)
  - [ユーザースクリプト](#ユーザースクリプト)
- [開発環境のセットアップ](#開発環境のセットアップ)
- [環境変数](#環境変数)
- [デプロイ（NeoShowcase）](#デプロイneoshowcase)

---

## 全体構成

```
┌──────────────┐      OAuth2 / API (同一オリジン)      ┌───────────────────────────┐
│  ブラウザ     │ ───────────────────────────────────▶ │  Bun + Hono サーバー       │
│  (React SPA) │ ◀─────────────────────────────────── │  /api/*                    │
└──────────────┘            JSON / Cookie              │                            │
       ▲                                                │  ・REST API                │
       │ data-nvr-installed 検出                        │  ・ポーラー(3分毎)          │
┌──────────────┐   提出報告 (予測用)                     │  ・スケジューラ(5分毎)      │
│ Tampermonkey │ ──────────────────────────────────▶  │                            │
│ userscript   │   POST /api/submissions               └────────┬─────────┬─────────┘
└──────────────┘                                                 │         │
       ▲ 自分の提出だけ報告                                         │         │
       │                                                ┌─────────▼──┐  ┌───▼────────┐
┌──────────────┐  確定データの取得 (権威)                 │  MariaDB   │  │  traQ Bot  │
│ AtCoder      │ ◀────────────────────────────────────  │ (mysql2)   │  │ (通知)      │
│ Problems API │                                         └────────────┘  └────────────┘
└──────────────┘
```

本番では NeoShowcase の **Path Overlay** によりフロント（静的配信 `/`）とバックエンド（`/api`）が同一オリジンになるため、ブラウザからは CORS なしで API を叩けます。

---

## 技術スタック

| 層 | 採用技術 |
|----|----------|
| ランタイム | [Bun](https://bun.sh/) |
| バックエンド | [Hono](https://hono.dev/)（REST API + 静的配信） |
| DB | MariaDB / MySQL（`mysql2/promise`、プール接続） |
| フロントエンド | React 19 + Vite + TypeScript（ハッシュルーティングの SPA） |
| 認証 | traQ OAuth2（Authorization Code + PKCE / S256） |
| 通知 | traQ Bot（`traq-bot-ts`） |
| 提出報告 | Tampermonkey ユーザースクリプト |
| 外部データ | [AtCoder Problems API](https://github.com/kenkoooo/AtCoderProblems) |

---

## ディレクトリ構成

```
.
├── server/                  # Bun + Hono バックエンド
│   ├── index.ts             #   エントリ。ルート登録、DB初期化、ポーラー/スケジューラ起動
│   ├── db.ts                #   MariaDB接続プール、スキーマ定義、マイグレーション
│   ├── auth.ts              #   traQ OAuth2 / PKCE ヘルパ
│   ├── admin.ts             #   管理者判定（ADMIN_TRAQ_IDS）
│   ├── atcoder.ts           #   AtCoder Problems データ取得・キャッシュ、問題セット生成、提出取得
│   ├── rating.ts            #   独自レーティング計算
│   ├── contests-core.ts     #   コンテスト実体の生成（手動/定期で共有）
│   ├── poller.ts            #   提出の定期取り込み（確定データ source='api'）
│   ├── scheduler.ts         #   定期コンテストの自動生成
│   ├── notify.ts            #   traQ通知の共通処理 + コンテスト作成通知
│   ├── reminder.ts          #   開始前リマインド通知
│   ├── standings-notify.ts  #   終了後の確定順位表通知
│   └── routes/              #   APIルート (auth/users/contests/submissions/recurring/ranking)
│
├── client/                  # React + Vite フロントエンド
│   └── src/
│       ├── App.tsx          #   ハッシュルーター、ヘッダー、テーマ
│       ├── api.ts           #   APIクライアント
│       ├── views/           #   各画面 (MyPage / ContestList / ContestDetail /
│       │                    #            CreateContest / RecurringContests /
│       │                    #            Ranking / Standings / RatingChart / Guide)
│       ├── components/      #   ClockWidget（残り時間/時計）, DifficultyCircle
│       └── useUserscriptInstalled.ts  # スクリプト導入検出フック
│
├── userscript/              # Tampermonkey 提出報告スクリプト（配信元）
│   ├── vabc-reporter.user.js
│   └── README.md
│
├── bot/                     # traQ Bot 起動用
├── .env.example             # 環境変数のひな形
└── package.json             # ルート（サーバー）の依存とdevスクリプト
```

ビルド時に `userscript/vabc-reporter.user.js` を `client/public/` にコピーするため、本番では
`https://<host>/vabc-reporter.user.js` で配信されます（ワンクリックインストール用）。

---

## データモデル

MariaDB のテーブル（`server/db.ts` の `initDb()` で `CREATE TABLE IF NOT EXISTS` + 列追加マイグレーション）。

| テーブル | 役割 | 主なカラム |
|----------|------|-----------|
| `users` | traQ ⇔ AtCoder ID の対応 | `traq_id`(PK), `atcoder_id`, `allow_mention` |
| `sessions` | ログインセッション | `id`(PK), `traq_id` |
| `contests` | コンテスト実体 | `id`(PK), `title`, `mode`, `start_at`(ISO/UTC), `duration_minutes`, `rated`, `recurring_id`, `standings_notified`, `reminder_sent` |
| `contest_problems` | コンテストの問題セット | `(contest_id, idx)`(PK), `problem_id`, `difficulty`, `color`, `points` |
| `participants` | 参加者 | `(contest_id, traq_id)`(PK), `atcoder_id`, `rated` |
| `recurring_contests` | 定期開催の設定 | `id`(PK), `freq`, `weekday`, `hour`, `minute`, `mode`, `count`, `color_spec`, `enabled` |
| `reported_submissions` | 取り込んだ提出 | `submission_id`(PK), `atcoder_id`, `problem_id`, `result`, `epoch_second`, **`source`** |

> 時刻はサーバー内部・DB ともに **UTC（ISO8601）** で保持し、定期開催の時刻指定だけ **JST** で解釈します（`scheduler.ts`）。

---

## 主要な仕組み

### 認証（traQ OAuth2 + PKCE）

- `/api/auth/login` で `code_verifier`/`state` を生成（メモリに 10 分間保持）し、traQ の認可エンドポイントへリダイレクト。
- `/api/auth/callback` で `code` をトークン交換し、ユーザー情報（traQ ID）を取得してセッションを発行。`session` Cookie（`httpOnly` / `SameSite=Lax` / 1 週間）。
- `/api/auth/me` がログインユーザー（`traqId` / `atcoderId` / `isAdmin` / `allowMention`）を返す。フロントは未ログインなら `/api/auth/login` へ飛ばす。

### 問題セットの生成

`server/atcoder.ts` が AtCoder Problems の 3 つの JSON を取得（6 時間メモリキャッシュ）し、3 方式で問題セットを作ります。

- **contest-problem.json** … コンテスト ⇔ 問題の対応（index の権威）
- **problems.json** … 問題タイトル
- **problem-models.json** … 推定難易度（difficulty）

| 方式 | 説明 |
|------|------|
| `random` | 過去 ABC から、A は A・B は B…と**同じインデックス**の問題をスロットごとにランダム選出（本番 ABC に近い難易度カーブ） |
| `color` | 色（難易度帯）ごとに指定数を選出。例: `{ cyan: 2, green: 1 }` |
| `manual` | 問題 URL もしくは `ABC331/D` 形式のリストから生成 |

難易度は 400 未満で負になり得るため、表示用に `400 / exp((400-d)/400)` で正の値に補正（AtCoder 公式フロントと同式）。

### 提出の取り込みと不正防止

このサービスの肝は **「予測」と「確定」を分離した信頼モデル**です。`reported_submissions.source` で区別します。

| `source` | 取り込み元 | 信頼度 | 用途 |
|----------|-----------|--------|------|
| `'api'` | AtCoder Problems API をサーバーがポーリング | **権威（確定）** | 確定順位表・確定レート・ランキング |
| `'script'` | ユーザースクリプトからの自己申告 | 予測のみ | 開催中のリアルタイム予測順位表 |

- スクリプト報告（`POST /api/submissions`）は **`source='script'`** で保存。受理条件は「**最終ジャッジ結果**であること」かつ「**開催中コンテストの対象問題 × 開催時間内**」のみ。
- ポーラーが取得した確定データは `REPLACE` で **`source='api'`** を書き込み、スクリプト報告（予測）を**常に上書き**します。`ON DUPLICATE KEY UPDATE` 側も `IF(source='api', …)` で api を保護。
- ユーザースクリプトは **自分の提出ページでだけ**ボタンを出す（ログイン中ハンドル == 提出者ハンドルを検証）。
- 結論として、**報告を偽っても確定結果（api 由来）には一切影響しない**設計です。

### 順位表とパフォーマンス推定

`computeStandings(contestId, mode)`（`server/routes/contests.ts`）が順位表を構築します。`mode` は `official`（api のみ）/ `predicted`（全件）。

- スコア = 解いた問題の配点合計、同点はペナルティ（誤答時間）で順序付け。
- 各参加者の**パフォーマンス**を、問題難易度と正誤から最尤推定（`solveProb(x,d)=1/(1+10^((d-x)/400))` のロジスティックモデルで対数尤度を最大化）。スコアに応じた微補正あり。
- 0 完（perf 推定不可）は、レーティング計算上 **perf=0** として扱います。

### 独自レーティング

`server/rating.ts`。AtCoder Rating System ver.1.00 の集計式をベースに、**少ない参加回数で安定する**よう調整しています。

- 直近重み付けの**減衰比率 `RATIO`** を AtCoder 公式の `0.9` から **`0.6`** に変更。直近 perf を重く見ることで補正項 `f(n)` が早く小さくなり、**5〜6 回で安定**します（参考: `f(5)≈97`, `f(6)≈57`。公式 0.9 では `f(6)≈289` で約 20 回必要）。
- それ以外（`g(x)=2^(x/800)`、`f(n)` の形、1200 スケール、400 未満の正値補正）は公式準拠。
- perf 履歴は最新が先頭。1 件も無ければレート無し（フロントでは便宜上 0 表示）。
- ランキング・確定レートは **`official`（api のみ）** の perf 履歴から算出します。

### 定期実行（ポーラー / スケジューラ）

サーバー起動時に 2 つのループを開始します。

**ポーラー（`poller.ts`、3 分毎 / 起動 15 秒後に初回）**
1. 「開催中〜終了後 24 時間」のコンテストについて、参加者の提出を AtCoder Problems から取得（レート制限配慮で参加者ごと 1 秒スリープ）。
2. 対象問題 × 開催時間内の提出を `source='api'` で取り込み、対象ユーザーの順位表キャッシュを無効化。
3. 同ループ内で **開始前リマインド**（`reminder.ts`）と **終了後の確定順位表通知**（`standings-notify.ts`）も実行。

**スケジューラ（`scheduler.ts`、5 分毎 / 起動 20 秒後に初回）**
- `recurring_contests` の各設定について、**開始の 24 時間前（前日）**になったらその回の実体を自動生成。`recurring_id + start_at` で冪等（重複生成しない）。時刻は JST 基準。

### traQ 通知

`notify.ts` の `postNotification()` を経由して `TRAQ_NOTIFY_CHANNEL_ID` のチャンネルに投稿（Bot トークン）。

| 通知 | タイミング | メンション |
|------|-----------|-----------|
| コンテスト作成 | 作成時 | 作成者を `:@id:`（スタンプ表示・通知なし） |
| 開始前リマインド | 開始 30 分前 | `allow_mention=1` の参加者のみ `@id`、それ以外は名前のみ |
| 確定順位表 | 終了 30 分後（Markdown 表） | `:@id:`（アイコンのみ・通知なし） |

参加者は**マイページのチェックボックス**でリマインド時の @メンション可否を選べます。デプロイ直後に過去分の通知が一斉に飛ばないよう、`standings_notified` / `reminder_sent` フラグは初回マイグレーションで既存コンテストを送信済み扱いにします。

### ユーザースクリプト

`userscript/vabc-reporter.user.js`（Tampermonkey）。

- 既定の接続先は本番 `https://nagotch-virtual.trap.show`。`@connect` に本番ホストと `localhost` を明示しているため、オリジン間の確認ダイアログは出ません。
- `@downloadURL`/`@updateURL` を本番配信 URL に設定 → バージョンが上がると **自動更新**。
- AtCoder の**自分の提出詳細ページ**でだけボタンを表示し、`GM_xmlhttpRequest` で `POST /api/submissions`。
- アプリのドメイン上では `<html data-nvr-installed="VERSION">` を立て、フロント（`useUserscriptInstalled`）が MutationObserver で導入状態を検出。

> 旧版（v3.0 以前）は `@updateURL` が無く接続先が `localhost` 固定だったため自動更新されません。古い版が入っている場合は、ヘッダーの「📥 スクリプト」または `https://nagotch-virtual.trap.show/vabc-reporter.user.js` から**入れ直して**ください。

---

## 開発環境のセットアップ

前提: [Bun](https://bun.sh/) と、ローカルまたは到達可能な MariaDB / MySQL。

```bash
# 依存インストール
bun install
(cd client && bun install)

# 環境変数
cp .env.example .env   # 値を埋める（下記参照）

# DB（ローカル例。スキーマはサーバー起動時に自動作成される）
#   DB名は既定で nagotch_virtual

# 起動（別ターミナルで）
bun run dev:server     # http://localhost:3000  (API + ポーラー/スケジューラ)
bun run dev:client     # http://localhost:5173  (Vite, /api は :3000 を参照)
bun run dev:bot        # traQ Bot（通知を使う場合）
```

- フロントの開発サーバー（:5173）からは別オリジンの :3000 を叩くため、`APP_URL` を CORS 許可元として使います。
- 本番ビルド: `cd client && bun run build`（ユーザースクリプトのコピー → `tsc -b` → `vite build`）。

## 環境変数

`.env.example` を参照。主なもの:

| 変数 | 説明 |
|------|------|
| `PORT` | サーバーのポート（既定 3000） |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | ローカル DB 接続。本番は NeoShowcase が `NS_MARIADB_*` を自動注入するため不要 |
| `TRAQ_CLIENT_ID` / `TRAQ_CLIENT_SECRET` | traQ OAuth2 クライアント |
| `TRAQ_REDIRECT_URI` | 認証コールバック URL。traQ 側の許可リダイレクトにも同じ値を登録 |
| `APP_URL` | フロントの URL（認証後の戻り先・CORS 許可元・通知リンク） |
| `ADMIN_TRAQ_IDS` | レート変動ありコンテストを作成できる管理者（カンマ区切り） |
| `TOKEN` / `BOT_NAME` / `TRAQ_NOTIFY_CHANNEL_ID` | traQ Bot トークン・名前・通知先チャンネル ID |

> `.env` は Git 管理外です。シークレット（`TRAQ_CLIENT_SECRET` / `TOKEN` / DB パスワード）はコミットしないでください。

## デプロイ（NeoShowcase）

- **Path Overlay**: フロント（Static を `/`）とバックエンド（Runtime を `/api`）を**同一オリジン**に配置。Strip Path Prefix は **OFF**。
- DB 接続情報は `NS_MARIADB_*` 環境変数で注入される（`db.ts` がフォールバックで参照）。ファイルシステムは再起動で揮発するため、永続データは MariaDB に置く。
- メモリ制限が小さい（180MiB 程度）ため、DB 接続プールは控えめ（`connectionLimit: 5`）。
- DB の確認には Adminer を利用。
