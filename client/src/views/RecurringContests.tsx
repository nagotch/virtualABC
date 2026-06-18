import { useEffect, useState } from 'react';
import {
  api,
  COLOR_DEFS,
  colorHex,
  recurrenceLabel,
  WEEKDAY_LABELS,
  modeLabel,
  type ColorKey,
  type RecurrenceFreq,
  type RecurringContest,
  type RecurringMode,
  type User,
} from '../api';

export default function RecurringContests({ user }: { user: User }) {
  const [list, setList] = useState<RecurringContest[] | null>(null);

  // フォーム状態
  const [title, setTitle] = useState('');
  const [freq, setFreq] = useState<RecurrenceFreq>('weekly');
  const [weekday, setWeekday] = useState(3); // 既定: 水曜
  const [time, setTime] = useState('21:00');
  const [duration, setDuration] = useState(100);
  const [mode, setMode] = useState<RecurringMode>('random');
  const [count, setCount] = useState(6);
  const [colorSpec, setColorSpec] = useState<Record<ColorKey, number>>({
    grey: 0, brown: 0, green: 0, cyan: 0, blue: 0, yellow: 0, orange: 0, red: 0,
  });
  const [rated, setRated] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const colorTotal = Object.values(colorSpec).reduce((a, b) => a + b, 0);
  const setColor = (key: ColorKey, n: number) =>
    setColorSpec((s) => ({ ...s, [key]: Math.max(0, n) }));

  const reload = () => api.listRecurring().then(setList).catch(() => setList([]));
  useEffect(() => { reload(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const [h, m] = time.split(':').map(Number);
    if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) {
      setError('開始時刻を指定してください');
      return;
    }
    setSubmitting(true);
    const common = {
      title,
      freq,
      hour: h,
      minute: m,
      durationMinutes: duration,
      rated: user.isAdmin && rated,
    };
    const body =
      mode === 'random'
        ? { ...common, ...(freq === 'weekly' ? { weekday } : {}), mode, count }
        : { ...common, ...(freq === 'weekly' ? { weekday } : {}), mode, colorSpec };
    const res = await api.createRecurring(body);
    setSubmitting(false);
    if ('id' in res) {
      setTitle('');
      reload();
    } else {
      setError(res.error ?? '作成に失敗しました');
    }
  };

  const toggle = async (r: RecurringContest) => {
    await api.toggleRecurring(r.id, r.enabled !== 1);
    reload();
  };

  const remove = async (r: RecurringContest) => {
    if (!confirm(`「${r.title}」の定期開催を削除しますか？（生成済みのコンテストは残ります）`)) return;
    await api.deleteRecurring(r.id);
    reload();
  };

  const specSummary = (r: RecurringContest): string => {
    if (r.mode === 'random') return `ランダム ${r.count ?? '?'}問`;
    try {
      const spec = JSON.parse(r.color_spec ?? '{}') as Partial<Record<ColorKey, number>>;
      const parts = COLOR_DEFS
        .filter((c) => (spec[c.key] ?? 0) > 0)
        .map((c) => `${c.label}${spec[c.key]}`);
      return `色指定 ${parts.join('・')}`;
    } catch {
      return modeLabel(r.mode);
    }
  };

  return (
    <div className="card card-wide">
      <div className="card-head">
        <h1>定期開催</h1>
      </div>
      <p className="hint">
        毎日・毎週の決まった時刻にコンテストを自動で開きます。各回は開始の前日に問題が生成されます。
      </p>

      <section className="contest-section">
        <h2 className="section-title">
          設定中 <span className="section-count">{list?.length ?? 0}</span>
        </h2>
        {list === null ? (
          <p className="section-empty">読み込み中...</p>
        ) : list.length === 0 ? (
          <p className="section-empty">まだ定期開催の設定がありません。</p>
        ) : (
          <ul className="contest-list">
            {list.map((r) => {
              const mine = r.created_by === user.traqId;
              return (
                <li key={r.id} className={r.enabled !== 1 ? 'recurring-disabled' : undefined}>
                  <div className="recurring-item">
                    <div className="recurring-main">
                      <span className="contest-title">
                        {r.title}
                        {r.rated === 1 && <span className="rated-badge">Rated</span>}
                        {r.enabled !== 1 && <span className="muted-badge">停止中</span>}
                      </span>
                      <span className="contest-meta">
                        🗓 {recurrenceLabel(r)} ・ {r.duration_minutes}分 ・ {specSummary(r)}
                      </span>
                      <span className="contest-meta">@{r.created_by}</span>
                    </div>
                    {mine && (
                      <div className="recurring-actions">
                        <button type="button" className="btn btn-inline" onClick={() => toggle(r)}>
                          {r.enabled === 1 ? '停止' : '再開'}
                        </button>
                        <button type="button" className="btn btn-inline btn-danger" onClick={() => remove(r)}>
                          削除
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="contest-section">
        <h2 className="section-title">新しい定期開催を追加</h2>
        <form onSubmit={handleSubmit}>
          <label htmlFor="r-title">タイトル（任意）</label>
          <input
            id="r-title"
            type="text"
            className="text-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: traP水曜バチャ"
          />

          <label style={{ marginTop: 16 }}>繰り返し</label>
          <div className="seg">
            <button
              type="button"
              className={`seg-btn${freq === 'weekly' ? ' active' : ''}`}
              onClick={() => setFreq('weekly')}
            >
              毎週
            </button>
            <button
              type="button"
              className={`seg-btn${freq === 'daily' ? ' active' : ''}`}
              onClick={() => setFreq('daily')}
            >
              毎日
            </button>
          </div>

          <div className="row-2" style={{ marginTop: 12 }}>
            {freq === 'weekly' && (
              <div>
                <label htmlFor="r-weekday">曜日</label>
                <select
                  id="r-weekday"
                  className="text-input"
                  value={weekday}
                  onChange={(e) => setWeekday(Number(e.target.value))}
                >
                  {WEEKDAY_LABELS.map((label, i) => (
                    <option key={i} value={i}>{label}曜</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label htmlFor="r-time">開始時刻</label>
              <input
                id="r-time"
                type="time"
                className="text-input"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="r-duration">実施時間（分）</label>
              <input
                id="r-duration"
                type="number"
                min={1}
                max={1440}
                className="text-input"
                value={duration}
                onChange={(e) => setDuration(Math.min(1440, Math.max(1, Number(e.target.value) || 1)))}
              />
            </div>
          </div>

          {user.isAdmin && (
            <label className="checkbox-row" style={{ marginTop: 16 }}>
              <input
                type="checkbox"
                checked={rated}
                onChange={(e) => setRated(e.target.checked)}
              />
              <span>レート変動させる（admin専用）</span>
            </label>
          )}

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
              <label htmlFor="r-count">問題数</label>
              <input
                id="r-count"
                type="number"
                min={1}
                max={12}
                className="text-input"
                value={count}
                onChange={(e) => setCount(Math.min(12, Math.max(1, Number(e.target.value) || 1)))}
              />
              <p className="hint">毎回、過去のABCから {count} 問をランダムに抽出します（最大12問）。</p>
            </div>
          ) : (
            <div className="mode-panel">
              <p className="hint">色ごとに出題数を指定します（合計 {colorTotal} 問 / 最大12問）。</p>
              <div className="color-grid">
                {COLOR_DEFS.map((c) => (
                  <div className="color-row" key={c.key}>
                    <span className="color-dot" style={{ background: colorHex(c.key) }} />
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
            {submitting ? '追加中...' : '定期開催を追加'}
          </button>
        </form>
      </section>
    </div>
  );
}
