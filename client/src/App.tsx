import { useEffect, useState } from 'react';
import './App.css';
import { API, api, type User } from './api';
import MyPage from './views/MyPage';
import ContestList from './views/ContestList';
import CreateContest from './views/CreateContest';
import ContestDetail from './views/ContestDetail';
import RecurringContests from './views/RecurringContests';
import ClockWidget from './components/ClockWidget';
import { useUserscriptInstalled } from './useUserscriptInstalled';

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
  const scriptInstalled = useUserscriptInstalled();

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
    if (path === '/' || path === '') return <MyPage user={user} onUserChange={setUser} onLogout={handleLogout} />;
    if (path === '/contests') return <ContestList />;
    if (path === '/contests/new') return <CreateContest user={user} />;
    if (path === '/recurring') return <RecurringContests user={user} />;
    const m = path.match(/^\/contests\/(.+)$/);
    if (m) return <ContestDetail id={m[1]} meId={user.traqId} />;
    return <MyPage user={user} onUserChange={setUser} onLogout={handleLogout} />;
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
            <span className="logo">nv</span>
            <strong>nagotch_virtual</strong>
          </a>
        </div>

        {user && (
          <nav className="nav">
            {navLink('#/contests', 'コンテスト')}
            {navLink('#/recurring', '定期開催')}
            {!scriptInstalled && (
              <a
                className="nav-link"
                href="https://nagotch-virtual.trap.show/vabc-reporter.user.js"
                target="_blank"
                rel="noreferrer"
                title="提出報告用ユーザースクリプト（Tampermonkey）をインストール"
              >
                📥 スクリプト
              </a>
            )}
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
            <a
              href="#/"
              className={`nav-avatar${(route.replace(/^#/, '') || '/') === '/' ? ' active' : ''}`}
              title={`マイページ (@${user.traqId})`}
            >
              <img
                src={`https://q.trap.jp/api/v3/public/icon/${encodeURIComponent(user.traqId)}`}
                alt={`@${user.traqId}`}
                width={36}
                height={36}
              />
            </a>
          )}
        </div>
      </header>

      {loading || !user ? (
        <div className="loading">読み込み中...</div>
      ) : (
        <main className="main">{renderRoute()}</main>
      )}

      {user && <ClockWidget />}
    </>
  );
}

export default App;
