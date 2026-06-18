import { useState } from 'react';
import { api, COLOR_DEFS, type ColorKey } from '../api';

type Mode = 'random' | 'color';

export default function CreateContest() {
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<Mode>('random');
  const [count, setCount] = useState(6);
  const [colorSpec, setColorSpec] = useState<Record<ColorKey, number>>({
    grey: 0, brown: 0, green: 0, cyan: 0, blue: 0, yellow: 0, orange: 0, red: 0,
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const colorTotal = Object.values(colorSpec).reduce((a, b) => a + b, 0);

  const setColor = (key: ColorKey, n: number) =>
    setColorSpec((s) => ({ ...s, [key]: Math.max(0, n) }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const body =
      mode === 'random'
        ? { title, mode, count }
        : { title, mode, colorSpec };
    const res = await api.createContest(body);
    setSubmitting(false);
    if ('id' in res) {
      window.location.hash = `#/contests/${res.id}`;
    } else {
      setError(res.error ?? '作成に失敗しました');
    }
  };

  return (
    <div className="card card-wide">
      <h1>コンテストを作成</h1>

      <form onSubmit={handleSubmit}>
        <label htmlFor="title">タイトル（任意）</label>
        <input
          id="title"
          type="text"
          className="text-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: traP水曜バチャ"
        />

        <label style={{ marginTop: 20 }}>出題方式</label>
        <div className="seg">
          <button
            type="button"
            className={`seg-btn${mode === 'random' ? ' active' : ''}`}
            onClick={() => setMode('random')}
          >
            過去問からランダム
          </button>
          <button
            type="button"
            className={`seg-btn${mode === 'color' ? ' active' : ''}`}
            onClick={() => setMode('color')}
          >
            色（難易度）で指定
          </button>
        </div>

        {mode === 'random' ? (
          <div className="mode-panel">
            <label htmlFor="count">問題数</label>
            <input
              id="count"
              type="number"
              min={1}
              max={12}
              className="text-input"
              value={count}
              onChange={(e) => setCount(Math.min(12, Math.max(1, Number(e.target.value) || 1)))}
            />
            <p className="hint">過去のABCから {count} 問をランダムに抽出します（最大12問）。</p>
          </div>
        ) : (
          <div className="mode-panel">
            <p className="hint">色ごとに出題数を指定します（合計 {colorTotal} 問 / 最大12問）。</p>
            <div className="color-grid">
              {COLOR_DEFS.map((c) => (
                <div className="color-row" key={c.key}>
                  <span className="color-dot" style={{ background: c.hex }} />
                  <span className="color-name">{c.label}</span>
                  <input
                    type="number"
                    min={0}
                    max={12}
                    className="text-input color-input"
                    value={colorSpec[c.key]}
                    onChange={(e) => setColor(c.key, Number(e.target.value) || 0)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p className="msg error">{error}</p>}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting || (mode === 'color' && colorTotal === 0)}
        >
          {submitting ? '生成中...' : 'コンテストを作成'}
        </button>
      </form>
    </div>
  );
}
