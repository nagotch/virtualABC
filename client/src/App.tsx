import { useEffect, useState } from 'react';

type User = {
  traqId: string;
  atcoderId: string | null;
};

const API = 'http://localhost:3000';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [atcoderId, setAtcoderId] = useState('');
  const [message, setMessage] = useState('');

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

  // ログイン確認中、または未ログインでOAuthへリダイレクト中
  if (loading || !user) return <p>読み込み中...</p>;

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '480px' }}>
      <h1>Virtual ABC</h1>

      <p>ログイン中: <strong>@{user.traqId}</strong></p>
      <p>AtCoder ID: <strong>{user.atcoderId ?? '未登録'}</strong></p>

      <form onSubmit={handleRegister} style={{ marginTop: '1rem' }}>
        <label>
          AtCoder IDを登録
          <br />
          <input
            value={atcoderId}
            onChange={(e) => setAtcoderId(e.target.value)}
            placeholder="例: chokudai"
            style={{ marginTop: '0.5rem', padding: '0.4rem', width: '100%' }}
          />
        </label>
        <button type="submit" style={{ marginTop: '0.5rem' }}>登録</button>
      </form>

      {message && <p>{message}</p>}

      <button onClick={handleLogout} style={{ marginTop: '1rem' }}>ログアウト</button>
    </div>
  );
}

export default App;
