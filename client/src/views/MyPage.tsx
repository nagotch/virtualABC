import { useEffect, useMemo, useState } from 'react';
import {
  api, fmtDateTime, ratingColor,
  type ContestHistoryRow, type RatingHistoryPoint, type RatingInfo, type User,
} from '../api';
import RatingChart from './RatingChart';

const TRAQ_ICON = (name: string) =>
  `https://q.trap.jp/api/v3/public/icon/${encodeURIComponent(name)}`;

type Tab = 'profile' | 'history';

export default function MyPage({
  user,
  onUserChange,
  onLogout,
}: {
  user: User;
  onUserChange: (u: User) => void;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<Tab>('profile');
  const [atcoderId, setAtcoderId] = useState('');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<RatingInfo | null>(null);
  const [history, setHistory] = useState<ContestHistoryRow[] | null>(null);
  const [editing, setEditing] = useState(false);

  const load = async () => {
    const [r, h] = await Promise.all([api.rating(), api.contestHistory()]);
    setRating(r);
    setHistory(h);
  };

  useEffect(() => {
    if (user.atcoderId) load();
  }, [user.atcoderId]);

  // グラフ用: Rated参加でレートが付いた行のみ、古い順に整列。
  const chartPoints = useMemo<RatingHistoryPoint[]>(() => {
    if (!history) return [];
    return history
      .filter((r) => r.rated && r.newRating !== null)
      .map((r) => ({
        contestId: r.contestId, title: r.title, date: r.date,
        perf: r.perf, rating: r.newRating as number,
      }))
      .reverse();
  }, [history]);

  const handleMentionToggle = async (allow: boolean) => {
    if (await api.setMention(allow)) {
      onUserChange({ ...user, allowMention: allow });
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await api.register(atcoderId)) {
      setMessage('登録しました！');
      setEditing(false);
      setAtcoderId('');
      const fresh = await api.me();
      if (fresh) onUserChange(fresh);
    } else {
      setMessage('登録に失敗しました');
    }
  };

  const registered = !!user.atcoderId;

  const renderRating = () => {
    if (!rating) return <span className="badge unset">確認中...</span>;

    // 予測レートが確定と異なるとき（AtCoder反映待ちの暫定値）だけ併記する。
    const showPredicted =
      rating.predictedRating !== null &&
      (rating.predictedRating !== rating.rating || rating.predictedContests !== rating.contests);
    const predictedNote = showPredicted && (
      <div className="rating-sub" style={{ marginTop: 4 }}>
        予測:{' '}
        <span style={{ color: ratingColor(rating.predictedRating as number), fontWeight: 700 }}>
          {rating.predictedRating}
        </span>{' '}
        （{rating.predictedContests}回・AtCoder反映待ち）
      </div>
    );

    // レートが未確定（Rated参加なし）の場合は 0 として表示する。
    const val = rating.rating ?? 0;
    return (
      <span className="value" style={{ color: ratingColor(val) }}>
        {val}
        <span className="rating-sub"> （{rating.contests}回）</span>
        {predictedNote}
      </span>
    );
  };

  return (
    <div className="card card-wide">
      <div className="card-head">
        <h1>プロフィール</h1>
      </div>

      <div className="profile-tabs">
        <button
          type="button"
          className={`tab-btn${tab === 'profile' ? ' active' : ''}`}
          onClick={() => setTab('profile')}
        >
          プロフィール
        </button>
        <button
          type="button"
          className={`tab-btn${tab === 'history' ? ' active' : ''}`}
          onClick={() => setTab('history')}
        >
          コンテスト成績
        </button>
      </div>

      {tab === 'profile' ? (
        <>
          <div className="profile-cols">
            {/* 左: プロフィール */}
            <div className="profile-left">
              <div className="profile-id">
                <img
                  className="profile-avatar"
                  src={TRAQ_ICON(user.traqId)}
                  alt={`@${user.traqId}`}
                  width={96}
                  height={96}
                />
                <div className="profile-name">@{user.traqId}</div>
              </div>

              <div className="field">
                <span className="label">AtCoder ID</span>
                <span className={`badge${registered ? '' : ' unset'}`}>
                  {user.atcoderId ?? '未登録'}
                </span>
              </div>

              {registered && (
                <div className="field">
                  <span className="label">レート（独自）</span>
                  {renderRating()}
                </div>
              )}

              {registered && (
                <label className="checkbox-row" style={{ marginTop: 14 }}>
                  <input
                    type="checkbox"
                    checked={user.allowMention}
                    onChange={(e) => handleMentionToggle(e.target.checked)}
                  />
                  コンテスト開始前リマインドで @メンションを許可する
                </label>
              )}

              {(!registered || editing) && (
                <form onSubmit={handleRegister}>
                  <label htmlFor="atcoderId">{registered ? 'AtCoder IDを変更' : 'AtCoder IDを登録'}</label>
                  <input
                    id="atcoderId"
                    type="text"
                    className="text-input"
                    value={atcoderId}
                    onChange={(e) => setAtcoderId(e.target.value)}
                    placeholder="例: chokudai"
                  />
                  <button type="submit" className="btn btn-primary">
                    {registered ? '変更する' : '登録する'}
                  </button>
                </form>
              )}

              {message && <p className="msg">{message}</p>}

              {registered && !editing && (
                <button className="btn btn-ghost" onClick={() => { setEditing(true); setMessage(''); }}>
                  AtCoder IDを変更
                </button>
              )}

              <button onClick={onLogout} className="btn btn-ghost">ログアウト</button>
            </div>

            {/* 右: レート推移グラフ */}
            <div className="profile-right">
              <h2 className="section-title">📈 レート推移</h2>
              {!registered ? (
                <p className="section-empty">AtCoder IDを登録すると表示されます。</p>
              ) : history === null ? (
                <p className="section-empty">読み込み中...</p>
              ) : (
                <>
                  <p className="hint" style={{ marginTop: 0 }}>
                    Rated参加した確定済みコンテストのみ。レートとperfを切り替えて表示できます。
                  </p>
                  <RatingChart history={chartPoints} />
                </>
              )}
            </div>
          </div>

          {registered && (
            <div className="token-section">
              <h2 className="section-title">📝 リアルタイム順位表の使い方</h2>
              <p className="hint">
                ユーザースクリプト(Tampermonkey)を入れると、開催中コンテストの問題の<strong>提出詳細ページ</strong>に
                「nagotch_virtualに報告」ボタンが表示されます。押すと結果が<strong>予測順位</strong>に即時反映されます（設定不要・ログイン中のAtCoder IDを自動取得）。
              </p>
              <p className="hint">
                ※ スクリプト報告はあくまで<strong>予測</strong>です。<strong>確定順位・確定レート</strong>はコンテスト終了後に
                AtCoder Problems の公式データで集計し直されるため、報告を偽っても確定結果には反映されません。
              </p>
            </div>
          )}
        </>
      ) : (
        <HistoryTable rows={history} registered={registered} />
      )}
    </div>
  );
}

function HistoryTable({ rows, registered }: { rows: ContestHistoryRow[] | null; registered: boolean }) {
  if (!registered) return <p className="section-empty">AtCoder IDを登録すると表示されます。</p>;
  if (rows === null) return <p className="section-empty">読み込み中...</p>;
  if (rows.length === 0) return <p className="section-empty">まだ参加した終了済みコンテストがありません。</p>;

  return (
    <div className="table-scroll">
      <table className="history-table">
        <thead>
          <tr>
            <th>日付</th>
            <th className="ht-title">コンテスト</th>
            <th>順位</th>
            <th>perf</th>
            <th>レート</th>
            <th>差分</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.contestId}>
              <td>{fmtDateTime(r.date)}</td>
              <td className="ht-title">
                <a className="pt-link" href={`#/contests/${r.contestId}`}>{r.title}</a>
                {!r.rated && <span className="muted-badge">Open</span>}
              </td>
              <td>{r.rank} / {r.participantCount}</td>
              <td style={{ color: ratingColor(r.perf), fontWeight: 700 }}>{r.perf}</td>
              <td>
                {r.newRating === null
                  ? <span className="rating-sub">-</span>
                  : <span style={{ color: ratingColor(r.newRating), fontWeight: 700 }}>{r.newRating}</span>}
              </td>
              <td>
                {r.diff === null ? (
                  <span className="rating-sub">-</span>
                ) : (
                  <span className={r.diff > 0 ? 'ht-up' : r.diff < 0 ? 'ht-down' : ''}>
                    {r.diff > 0 ? `+${r.diff}` : r.diff}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
