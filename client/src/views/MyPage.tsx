import { useEffect, useState } from 'react';
import { api, ratingColor, type RatingInfo, type User } from '../api';

const TRAQ_ICON = (name: string) =>
  `https://q.trap.jp/api/v3/public/icon/${encodeURIComponent(name)}`;

export default function MyPage({
  user,
  onUserChange,
  onLogout,
}: {
  user: User;
  onUserChange: (u: User) => void;
  onLogout: () => void;
}) {
  const [atcoderId, setAtcoderId] = useState('');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<RatingInfo | null>(null);
  const [editing, setEditing] = useState(false);

  const loadRating = async () => {
    setRating(await api.rating());
  };

  useEffect(() => {
    if (user.atcoderId) loadRating();
  }, [user.atcoderId]);

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
    if (rating.rating === null) return <span className="badge unset">未参加（レート無し）</span>;
    return (
      <span className="value" style={{ color: ratingColor(rating.rating) }}>
        {rating.rating}
        <span className="rating-sub"> （{rating.contests}回）</span>
      </span>
    );
  };

  return (
    <div className="card">
      <div className="mypage-head">
        <h1>マイページ</h1>
        <img
          className="avatar avatar-sm"
          src={TRAQ_ICON(user.traqId)}
          alt={`@${user.traqId}`}
          title={`@${user.traqId}`}
          width={36}
          height={36}
        />
      </div>

      <div className="field">
        <span className="label">traQ ID</span>
        <span className="value">@{user.traqId}</span>
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

      {registered && (
        <div className="token-section">
          <h2 className="section-title">📝 リアルタイム順位表の使い方</h2>
          <p className="hint">
            ユーザースクリプト(Tampermonkey)を入れると、開催中コンテストの問題の<strong>提出詳細ページ</strong>に
            「virtualABCに報告」ボタンが表示されます。押すと結果が順位表に反映されます（設定不要・ログイン中のAtCoder IDを自動取得）。
          </p>
        </div>
      )}

      <button onClick={onLogout} className="btn btn-ghost">ログアウト</button>
    </div>
  );
}
