import { useState } from 'react';
import { ratingColor, RATING_BAND_MINS, type RatingHistoryPoint } from '../api';

// SVGの内部座標系（CSSで横幅100%に伸縮）。
const W = 720;
const H = 360;
const PAD = { l: 46, r: 16, t: 16, b: 30 };
const X0 = PAD.l;
const X1 = W - PAD.r;
const Y0 = PAD.t;
const Y1 = H - PAD.b;

const RATING_LINE = '#8a8a8a';
const PERF_LINE = '#9a9a9a';

const fmtDay = (iso: string, withYear: boolean): string => {
  const d = new Date(iso);
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  return withYear ? `${d.getFullYear()}/${md}` : md;
};

const fmtFull = (iso: string): string =>
  new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

export default function RatingChart({ history }: { history: RatingHistoryPoint[] }) {
  const [showRating, setShowRating] = useState(true);
  const [showPerf, setShowPerf] = useState(true);
  const [hover, setHover] = useState<number | null>(null);

  if (history.length === 0) {
    return <p className="section-empty">まだRated参加の記録がありません。</p>;
  }

  const times = history.map((p) => new Date(p.date).getTime());
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const tRange = tMax - tMin;
  const spanYear = tRange > 365 * 24 * 3600 * 1000;

  // y範囲: 表示中の系列の値から、400刻みにスナップして決める。
  const vals: number[] = [];
  if (showRating) vals.push(...history.map((p) => p.rating));
  if (showPerf) vals.push(...history.map((p) => p.perf));
  const hasSeries = vals.length > 0;
  const vMin = hasSeries ? Math.min(...vals) : 0;
  const vMax = hasSeries ? Math.max(...vals) : 400;
  const yMin = Math.max(0, Math.floor(vMin / 400) * 400);
  let yMax = Math.ceil((vMax + 1) / 400) * 400;
  if (yMax <= yMin) yMax = yMin + 400;

  const x = (t: number): number =>
    tRange === 0 ? (X0 + X1) / 2 : X0 + ((t - tMin) / tRange) * (X1 - X0);
  const y = (v: number): number => Y1 - ((v - yMin) / (yMax - yMin)) * (Y1 - Y0);

  // 背景のレート帯（AtCoder風の色帯）
  const bands: { lo: number; hi: number; color: string }[] = [];
  for (let k = 0; k < RATING_BAND_MINS.length; k++) {
    const bMin = RATING_BAND_MINS[k];
    const bMax = k + 1 < RATING_BAND_MINS.length ? RATING_BAND_MINS[k + 1] : yMax;
    const lo = Math.max(bMin, yMin);
    const hi = Math.min(bMax, yMax);
    if (hi <= lo) continue;
    bands.push({ lo, hi, color: ratingColor(bMin + 1) });
  }

  // y軸目盛り（帯の境界値）
  const yTicks = RATING_BAND_MINS.filter((m) => m >= yMin && m <= yMax);
  if (yTicks[yTicks.length - 1] !== yMax) yTicks.push(yMax);

  // x軸目盛り（時間で等間隔に最大5本）
  const tickCount = Math.min(5, history.length);
  const xTicks: number[] = [];
  if (tRange === 0) xTicks.push(tMin);
  else for (let i = 0; i < tickCount; i++) xTicks.push(tMin + (tRange * i) / (tickCount - 1));

  const polyline = (key: 'rating' | 'perf'): string =>
    history.map((p, i) => `${x(times[i])},${y(p[key])}`).join(' ');

  const hp = hover !== null ? history[hover] : null;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <ToggleChip on={showRating} color={RATING_LINE} label="レート" onClick={() => setShowRating((v) => !v)} />
        <ToggleChip on={showPerf} color={PERF_LINE} label="perf" dashed onClick={() => setShowPerf((v) => !v)} />
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', touchAction: 'none' }} role="img" aria-label="レート推移グラフ">
        {/* 背景のレート帯 */}
        {bands.map((b, i) => (
          <rect key={i} x={X0} y={y(b.hi)} width={X1 - X0} height={y(b.lo) - y(b.hi)} fill={b.color} opacity={0.13} />
        ))}

        {/* y軸グリッド＋ラベル */}
        {yTicks.map((v) => (
          <g key={`y${v}`}>
            <line x1={X0} y1={y(v)} x2={X1} y2={y(v)} stroke="currentColor" opacity={0.15} />
            <text x={X0 - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="currentColor" opacity={0.7}>{v}</text>
          </g>
        ))}

        {/* x軸ラベル */}
        {xTicks.map((t, i) => (
          <text key={`x${i}`} x={x(t)} y={Y1 + 18} textAnchor="middle" fontSize={11} fill="currentColor" opacity={0.7}>
            {fmtDay(new Date(t).toISOString(), spanYear)}
          </text>
        ))}
        {/* 軸枠 */}
        <line x1={X0} y1={Y1} x2={X1} y2={Y1} stroke="currentColor" opacity={0.35} />
        <line x1={X0} y1={Y0} x2={X0} y2={Y1} stroke="currentColor" opacity={0.35} />

        {/* perf系列 */}
        {showPerf && history.length > 1 && (
          <polyline points={polyline('perf')} fill="none" stroke={PERF_LINE} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.8} />
        )}
        {/* rating系列 */}
        {showRating && history.length > 1 && (
          <polyline points={polyline('rating')} fill="none" stroke={RATING_LINE} strokeWidth={2} />
        )}

        {/* 点（帯色） */}
        {showPerf && history.map((p, i) => (
          <circle key={`pp${i}`} cx={x(times[i])} cy={y(p.perf)} r={3} fill="none" stroke={ratingColor(p.perf)} strokeWidth={2} />
        ))}
        {showRating && history.map((p, i) => (
          <circle key={`rp${i}`} cx={x(times[i])} cy={y(p.rating)} r={3.5} fill={ratingColor(p.rating)} />
        ))}

        {/* ホバー判定（広めの透明円）＋ツールチップ */}
        {history.map((p, i) => {
          const anchorY = Math.min(
            showRating ? y(p.rating) : Y1,
            showPerf ? y(p.perf) : Y1,
          );
          return (
            <circle
              key={`hit${i}`}
              cx={x(times[i])}
              cy={anchorY}
              r={12}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
            />
          );
        })}

        {hp && (() => {
          const cx = x(times[hover as number]);
          const anchorY = Math.min(
            showRating ? y(hp.rating) : Y1,
            showPerf ? y(hp.perf) : Y1,
          );
          const boxW = 168;
          const boxH = 64;
          const bx = Math.min(Math.max(cx - boxW / 2, X0), X1 - boxW);
          const below = anchorY - boxH - 10 < Y0;
          const by = below ? anchorY + 12 : anchorY - boxH - 10;
          const title = hp.title.length > 22 ? `${hp.title.slice(0, 21)}…` : hp.title;
          return (
            <g pointerEvents="none">
              <line x1={cx} y1={Y0} x2={cx} y2={Y1} stroke="currentColor" opacity={0.25} />
              <rect x={bx} y={by} width={boxW} height={boxH} rx={6}
                fill="var(--card-bg, #1e1e1e)" stroke="currentColor" strokeOpacity={0.3} />
              <text x={bx + 10} y={by + 17} fontSize={11} fill="currentColor" fontWeight={700}>{title}</text>
              <text x={bx + 10} y={by + 33} fontSize={10.5} fill="currentColor" opacity={0.75}>{fmtFull(hp.date)}</text>
              <text x={bx + 10} y={by + 50} fontSize={12} fill="currentColor">
                <tspan>rating </tspan>
                <tspan fill={ratingColor(hp.rating)} fontWeight={700}>{hp.rating}</tspan>
                <tspan>　perf </tspan>
                <tspan fill={ratingColor(hp.perf)} fontWeight={700}>{hp.perf}</tspan>
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

function ToggleChip({
  on, color, label, dashed, onClick,
}: { on: boolean; color: string; label: string; dashed?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn btn-ghost btn-inline"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: on ? 1 : 0.4 }}
      aria-pressed={on}
    >
      <svg width={22} height={10} aria-hidden>
        <line x1={1} y1={5} x2={21} y2={5} stroke={color} strokeWidth={2}
          strokeDasharray={dashed ? '4 3' : undefined} />
      </svg>
      {label}
    </button>
  );
}
