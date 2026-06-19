# nagotch_virtual ユーザースクリプト

AtCoder の提出詳細ページから、開催中の nagotch_virtual コンテストへ提出結果を報告するための Tampermonkey 用ユーザースクリプトです。リアルタイム（予測）順位表に反映されます。

## インストール（かんたん・1クリック）

1. ブラウザに [Tampermonkey](https://www.tampermonkey.net/) を入れる
2. 下のリンクをクリックすると、Tampermonkey のインストール画面が開きます

   **▶ [vabc-reporter.user.js をインストール](https://nagotch-virtual.trap.show/vabc-reporter.user.js)**

   （URL: `https://nagotch-virtual.trap.show/vabc-reporter.user.js`）
3. 「インストール」を押す

> `.user.js` で終わる URL を開くと、Tampermonkey が自動でインストール画面を表示します。
> 以降は `@version` が上がると Tampermonkey が自動更新します（`@updateURL`/`@downloadURL` 設定済み）。

## サーバーURLの設定

既定の接続先は本番サーバー **`https://nagotch-virtual.trap.show`** です（インストール後そのまま使えます）。

変更したい場合は、Tampermonkey の拡張アイコン → **「nagotch_virtual: サーバーURLを設定」** から
いつでも上書きできます（コード編集不要。ローカル開発なら `http://localhost:3000` 等）。

- 初回は接続先ホストに対して Tampermonkey が通信許可を一度確認します

## 使い方

1. AtCoder で、開催中の nagotch_virtual コンテスト対象問題に提出する
2. その提出の**提出詳細ページ**（`/contests/.../submissions/12345`）を開く
3. 左下に **「nagotch_virtualに報告」** ボタンが出るので押す

## 仕様・不正防止

- **自分の提出のときだけ**ボタンが出ます（ログイン中ハンドル == 提出者ハンドルを検証）。他人の提出は報告できません
- 自動報告はしません（押したときだけ送信）
- 報告は**予測順位用**です。**確定順位・確定レートは AtCoder Problems の公式データ**（`source='api'`）からのみ集計されるため、報告を偽っても確定結果には反映されません
- サーバー側でも、開催中コンテストの対象問題かつ開催時間内の報告のみ受け付けます
