import { useEffect, useState } from 'react';
import './App.css';
import { API, api, type User } from './api';
import MyPage from './views/MyPage';
import ContestList from './views/ContestList';
import CreateContest from './views/CreateContest';
import ContestDetail from './views/ContestDetail';

type Theme = 'light' | 'dark';

const getInitialTheme = (): Theme => {
  const saved = localStorage.getItem('theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

// 簡易ハッシュルーター
const useHashRoute = (): string => {
  const [hash, setHash] = useState(() => window.location.hash || '#/');
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
};

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const route = useHashRoute();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  useEffect(() => {
    api.me()
      .then((u) => {
        if (!u) {
          window.location.href = `${API}/api/auth/login`;
          return;
        }
        setUser(u);
      })
      .catch((e) => console.error('me failed:', e))
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    await api.logout();
    window.location.href = `${API}/api/auth/login`;
  };

  const renderRoute = () => {
    if (!user) return null;
    const path = route.replace(/^#/, '');
    if (path === '/' || path === '') return <MyPage user={user} onUserChange={setUser} />;
    if (path === '/contests') return <ContestList />;
    if (path === '/contests/new') return <CreateContest />;
    const m = path.match(/^\/contests\/(.+)$/);
    if (m) return <ContestDetail id={m[1]} meId={user.traqId} />;
    return <MyPage user={user} onUserChange={setUser} />;
  };

  const navLink = (href: string, label: string) => {
    const path = route.replace(/^#/, '') || '/';
    const active =
      href === '#/'
        ? path === '/'
        : path.startsWith(href.replace(/^#/, ''));
    return (
      <a href={href} className={`nav-link${active ? ' active' : ''}`}>{label}</a>
    );
  };

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <a href="#/" className="brand-link">
            <span className="logo">vABC</span>
            <strong>Virtual ABC</strong>
          </a>
        </div>

        {user && (
          <nav className="nav">
            {navLink('#/', 'マイページ')}
            {navLink('#/contests', 'コンテスト')}
          </nav>
        )}

        <div className="topbar-right">
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label="テーマ切り替え"
            title={theme === 'dark' ? 'ライトモードへ' : 'ダークモードへ'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          {user && (
            <button className="btn btn-ghost btn-inline" onClick={handleLogout}>
              ログアウト
            </button>
          )}
        </div>
      </header>

      {loading || !user ? (
        <div className="loading">読み込み中...</div>
      ) : (
        <main className="main">{renderRoute()}</main>
      )}
    </>
  );
}

export default App;
