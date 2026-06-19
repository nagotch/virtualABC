const TAMPERMONKEY_URL = 'https://www.tampermonkey.net/';
const USERSCRIPT_URL = 'https://nagotch-virtual.trap.show/vabc-reporter.user.js';
const ATCODER_REGISTER_URL = 'https://atcoder.jp/register';

const extLink = (href: string, text: string) => (
  <a className="pt-link" href={href} target="_blank" rel="noreferrer">{text}</a>
);

export default function Guide() {
  return (
    <div className="card card-wide">
      <div className="card-head">
        <h1>🎮 遊び方</h1>
      </div>
      <p className="hint">
        nagotch_virtual は、過去のAtCoder問題で作るバーチャルコンテストに参加して、独自レートを競うサービスです。
        下の手順ではじめましょう。
      </p>

      <p className="hint" style={{ marginTop: 12 }}>
        📌 <strong>ユーザースクリプト（手順2・3）は任意です。</strong>
        入れなくても遊べます。提出は AtCoder Problems から自動で取り込まれ、順位表・レートに反映されます
        （反映には少し時間がかかります）。スクリプトを入れると、コンテスト中にボタンひとつで
        「予測順位」へ<strong>即時反映</strong>できて便利になります。
      </p>

      <ol className="guide-steps">
        <li className="guide-step">
          <span className="guide-num">1</span>
          <div className="guide-body">
            <h3>AtCoderアカウントを登録</h3>
            <p className="hint">
              まだの人は {extLink(ATCODER_REGISTER_URL, 'AtCoderの登録ページ')} からアカウントを作成します。
              そのあと、<strong>マイページで自分のAtCoder IDを登録</strong>してください（コンテスト参加に必須）。
            </p>
            <a className="btn btn-ghost btn-inline" href="#/">マイページでAtCoder IDを登録</a>
          </div>
        </li>

        <li className="guide-step">
          <span className="guide-num">2</span>
          <div className="guide-body">
            <h3>Tampermonkey（拡張機能）を入れる<span className="guide-optional">任意</span></h3>
            <p className="hint">
              ユーザースクリプトを動かすための拡張機能です。入っていない場合は
              {' '}{extLink(TAMPERMONKEY_URL, 'Tampermonkey 公式サイト')} からお使いのブラウザに追加します。
              （Chrome / Edge / Firefox / Safari など対応）
            </p>
          </div>
        </li>

        <li className="guide-step">
          <span className="guide-num">3</span>
          <div className="guide-body">
            <h3>ユーザースクリプトを入れる<span className="guide-optional">任意</span></h3>
            <p className="hint">
              ヘッダーの「📥 スクリプト」または下のリンクをクリックすると、Tampermonkey のインストール画面が開きます。
              「インストール」を押すだけでOK（接続先は設定済み・自分の提出だけ報告します）。
            </p>
            <a className="btn btn-primary btn-inline" href={USERSCRIPT_URL} target="_blank" rel="noreferrer">
              ▶ ユーザースクリプトをインストール
            </a>
          </div>
        </li>

        <li className="guide-step">
          <span className="guide-num">4</span>
          <div className="guide-body">
            <h3>コンテストに出場する</h3>
            <p className="hint">
              「コンテスト」から開催中・予定のコンテストに<strong>参加</strong>し、AtCoder で問題を解いて提出します。
              提出結果は AtCoder Problems から<strong>自動で取り込まれて順位表・レートに反映</strong>されます。
              スクリプトを入れている場合は、<strong>提出詳細ページの左下に出るボタン</strong>を押すと「予測順位」へ即時反映できます。
            </p>
            <a className="btn btn-ghost btn-inline" href="#/contests">コンテスト一覧へ</a>
          </div>
        </li>
      </ol>

      <div className="token-section">
        <h2 className="section-title">💡 知っておくと良いこと</h2>
        <ul className="guide-notes">
          <li>
            <strong>予測順位と確定順位</strong>：コンテスト中はスクリプト報告による「予測順位」です。終了後に
            AtCoder Problems の公式データで「<strong>確定順位・確定レート</strong>」に集計し直されます
            （報告を偽っても確定結果には影響しません）。
          </li>
          <li>
            <strong>Rated / オープン参加</strong>：Ratedコンテストで「Rated参加」するとレートが変動します。
            「オープン参加」はレート変動なしで力試しに使えます。
          </li>
          <li>
            <strong>独自レート</strong>：5〜6回参加するとレートが安定します。マイページでレート推移グラフ・コンテスト成績、
            <a className="pt-link" href="#/ranking">ランキング</a>で全体順位が見られます。
          </li>
          <li>
            <strong>残り時間タイマー</strong>：コンテストページでは右下に残り時間、それ以外では現在時刻が表示されます。
          </li>
          <li>
            <strong>traQ通知</strong>：コンテスト作成・開始前リマインド・結果がtraQに通知されます。
            リマインドで@メンションを受け取るかはマイページのチェックボックスで設定できます。
          </li>
          <li>
            <strong>スクリプトの接続先</strong>：通常は変更不要です。変えたい場合は Tampermonkey のメニュー
            「nagotch_virtual: サーバーURLを設定」から変更できます。
          </li>
        </ul>
      </div>
    </div>
  );
}
