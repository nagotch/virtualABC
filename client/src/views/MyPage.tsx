import { useEffect, useState } from 'react';
import { api, type RatingInfo, type User } from '../api';

const ratingColor = (r: number): string => {
  if (r >= 2800) return '#ff0000';
  if (r >= 2400) return '#ff8000';
  if (r >= 2000) return '#c0c000';
  if (r >= 1600) return '#0000ff';
  if (r >= 1200) return '#00c0c0';
  if (r >= 800) return '#008000';
  if (r >= 400) return '#804000';
  return '#808080';
};

const TRAQ_ICON = (name: string) =>
  `https://q.trap.jp/api/v3/public/icon/${encodeURIComponent(name)}`;

export default function MyPage({
  user,
  onUserChange,
}: {
  user: User;
  onUserChange: (u: User) => void;
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
    if (!rating.exists) return <span className="badge unset">ユーザーが見つかりません</span>;
    if (rating.rating === null) return <span className="badge unset">レート無し（未参加）</span>;
    return (
      <span className="value" style={{ color: ratingColor(rating.rating) }}>
        {rating.rating}
      </span>
    );
  };

  return (
    <div className="card">
      <h1>マイページ</h1>

      <div className="field">
        <span className="label">traQ ID</span>
        <span className="value user-id">
          <img className="avatar" src={TRAQ_ICON(user.traqId)} alt="" width={28} height={28} />
          @{user.traqId}
        </span>
      </div>

      <div className="field">
        <span className="label">AtCoder ID</span>
        <span className={`badge${registered ? '' : ' unset'}`}>
          {user.atcoderId ?? '未登録'}
        </span>
      </div>

      {registered && (
        <div className="field">
          <span className="label">現在のレート</span>
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
    </div>
  );
}
