import { useEffect, useState } from 'react';
import './App.css';

type User = {
  traqId: string;
  atcoderId: string | null;
};

type Theme = 'light' | 'dark';

const API = 'http://localhost:3000';

const getInitialTheme = (): Theme => {
  const saved = localStorage.getItem('theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
};

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [atcoderId, setAtcoderId] = useState('');
  const [message, setMessage] = useState('');
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () =>
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

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
      fetchMe();
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
              <span className="value">@{user.traqId}</span>
            </div>
            <div className="field">
              <span className="label">AtCoder ID</span>
              <span className={`badge${user.atcoderId ? '' : ' unset'}`}>
                {user.atcoderId ?? '未登録'}
              </span>
            </div>

            <form onSubmit={handleRegister}>
              <label htmlFor="atcoderId">AtCoder IDを登録</label>
              <input
                id="atcoderId"
                type="text"
                className="text-input"
                value={atcoderId}
                onChange={(e) => setAtcoderId(e.target.value)}
                placeholder="例: chokudai"
              />
              <button type="submit" className="btn btn-primary">
                登録する
              </button>
            </form>

            {message && <p className="msg">{message}</p>}

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
