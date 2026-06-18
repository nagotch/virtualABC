import { useState } from 'react';
import { api, COLOR_DEFS, type ColorKey, type ContestMode } from '../api';

type Mode = ContestMode;

// datetime-local の初期値（ローカル時刻、1時間後を分単位で丸め）
const defaultStart = (): string => {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function CreateContest() {
  const [title, setTitle] = useState('');
  const [startAt, setStartAt] = useState(defaultStart);
  const [duration, setDuration] = useState(100);
  const [mode, setMode] = useState<Mode>('random');
  const [count, setCount] = useState(6);
  const [colorSpec, setColorSpec] = useState<Record<ColorKey, number>>({
    grey: 0, brown: 0, green: 0, cyan: 0, blue: 0, yellow: 0, orange: 0, red: 0,
  });
  const [manualText, setManualText] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const colorTotal = Object.values(colorSpec).reduce((a, b) => a + b, 0);
  const manualLines = manualText.split('\n').map((s) => s.trim()).filter(Boolean);

  const setColor = (key: ColorKey, n: number) =>
    setColorSpec((s) => ({ ...s, [key]: Math.max(0, n) }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!startAt) { setError('開始日時を指定してください'); return; }
    setSubmitting(true);
    // datetime-local はローカル時刻。ISO(UTC)に変換して送る
    const startIso = new Date(startAt).toISOString();
    const common = { title, startAt: startIso, durationMinutes: duration };
    const body =
      mode === 'random'
        ? { ...common, mode, count }
        : mode === 'color'
          ? { ...common, mode, colorSpec }
          : { ...common, mode, urls: manualLines };
    const res = await api.createContest(body);
    setSubmitting(false);
    if ('id' in res) {
      window.location.hash = `#/contests/${res.id}`;
    } else {
      setError(res.error ?? '作成に失敗しました');
    }
  };

  return (
    <div className="card">
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

        <div className="row-2">
          <div>
            <label htmlFor="startAt">開始日時</label>
            <input
              id="startAt"
              type="datetime-local"
              className="text-input"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="duration">実施時間（分）</label>
            <input
              id="duration"
              type="number"
              min={1}
              max={1440}
              className="text-input"
              value={duration}
              onChange={(e) => setDuration(Math.min(1440, Math.max(1, Number(e.target.value) || 1)))}
            />
          </div>
        </div>

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
          <button
            type="button"
            className={`seg-btn${mode === 'manual' ? ' active' : ''}`}
            onClick={() => setMode('manual')}
          >
            手動で指定
          </button>
        </div>

        {mode === 'manual' ? (
          <div className="mode-panel">
            <label htmlFor="manual">問題を1行に1つ（最大12問）</label>
            <textarea
              id="manual"
              className="text-input"
              rows={6}
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder={'例（URL または ABC331/D 形式）:\nhttps://atcoder.jp/contests/abc300/tasks/abc300_a\nABC331/D\nabc250 e'}
            />
            <p className="hint">
              現在 {manualLines.length} 問。問題URL、または「ABC331/D」のように指定できます。
            </p>
          </div>
        ) : mode === 'random' ? (
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
          disabled={
            submitting ||
            (mode === 'color' && colorTotal === 0) ||
            (mode === 'manual' && manualLines.length === 0)
          }
        >
          {submitting ? '生成中...' : 'コンテストを作成'}
        </button>
      </form>
    </div>
  );
}
