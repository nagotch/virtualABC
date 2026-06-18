import { useEffect, useState } from 'react';
import './App.css';

type User = {
  traqId: string;
  atcoderId: string | null;
};

type RatingInfo = {
  atcoderId: string;
  exists: boolean;
  rating: number | null;
};

type Theme = 'light' | 'dark';

const API = 'http://localhost:3000';
const TRAQ_ICON = (name: string) =>
  `https://q.trap.jp/api/v3/public/icon/${encodeURIComponent(name)}`;

const getInitialTheme = (): Theme => {
  const saved = localStorage.getItem('theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
};

// AtCoderのレート帯ごとの色
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

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [atcoderId, setAtcoderId] = useState('');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<RatingInfo | null>(null);
  const [editing, setEditing] = useState(false);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () =>
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  const fetchRating = async () => {
    try {
      const res = await fetch(`${API}/api/users/rating`, { credentials: 'include' });
      if (!res.ok) { setRating(null); return; }
      setRating(await res.json() as RatingInfo);
    } catch (e) {
      console.error('fetchRating failed:', e);
      setRating(null);
    }
  };

  const fetchMe = async () => {
    try {
      const res = await fetch(`${API}/api/auth/me`, { credentials: 'include' });
      const { user } = await res.json() as { user: User | null };
      if (!user) {
        // 未ログインなら自動でtraQ OAuthへ
        window.location.href = `${API}/api/auth/login`;
        return;
      }
      setUser(user);
      if (user.atcoderId) fetchRating();
    } catch (e) {
      console.error('fetchMe failed:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMe(); }, []);

  const handleLogout = async () => {
    await fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    window.location.href = `${API}/api/auth/login`;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch(`${API}/api/users/register`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ atcoderId }),
    });
    if (res.ok) {
      setMessage('登録しました！');
      setEditing(false);
      setAtcoderId('');
      await fetchMe();
    } else {
      setMessage('登録に失敗しました');
    }
  };

  const themeToggle = (
    <button
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label="テーマ切り替え"
      title={theme === 'dark' ? 'ライトモードへ' : 'ダークモードへ'}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );

  // レーティング表示用の中身
  const renderRating = () => {
    if (!rating) return <span className="badge unset">確認中...</span>;
    if (!rating.exists) {
      return <span className="badge unset">ユーザーが見つかりません</span>;
    }
    if (rating.rating === null) {
      return <span className="badge unset">レート無し（未参加）</span>;
    }
    return (
      <span className="value" style={{ color: ratingColor(rating.rating) }}>
        {rating.rating}
      </span>
    );
  };

  const registered = !!user?.atcoderId;

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="logo">vABC</span>
          <strong style={{ color: 'var(--text-h)' }}>Virtual ABC</strong>
        </div>
        {themeToggle}
      </header>

      {loading || !user ? (
        <div className="loading">読み込み中...</div>
      ) : (
        <main className="main">
          <div className="card">
            <h1>マイページ</h1>

            <div className="field">
              <span className="label">traQ ID</span>
              <span className="value user-id">
                <img
                  className="avatar"
                  src={TRAQ_ICON(user.traqId)}
                  alt=""
                  width={28}
                  height={28}
                />
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
                <label htmlFor="atcoderId">
                  {registered ? 'AtCoder IDを変更' : 'AtCoder IDを登録'}
                </label>
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
              <button
                className="btn btn-ghost"
                onClick={() => { setEditing(true); setMessage(''); }}
              >
                AtCoder IDを変更
              </button>
            )}

            <button onClick={handleLogout} className="btn btn-ghost">
              ログアウト
            </button>
          </div>
        </main>
      )}
    </>
  );
}

export default App;
