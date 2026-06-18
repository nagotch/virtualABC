import { useEffect, useState } from 'react';

function App() {
  const [serverStatus, setServerStatus] = useState<'checking' | 'ok' | 'error'>('checking');

  useEffect(() => {
    fetch('http://localhost:3000/api/health')
      .then((r) => (r.ok ? setServerStatus('ok') : setServerStatus('error')))
      .catch(() => setServerStatus('error'));
  }, []);

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Virtual ABC</h1>
      <p>traP内部バーチャルABCアプリ</p>
      <p>
        サーバー:{' '}
        {serverStatus === 'checking' && '確認中...'}
        {serverStatus === 'ok' && '✅ 接続OK'}
        {serverStatus === 'error' && '❌ 接続失敗（サーバーが起動しているか確認してください）'}
      </p>
    </div>
  );
}

export default App;
