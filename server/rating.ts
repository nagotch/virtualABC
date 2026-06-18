// virtualABC 独自レーティング
// AtCoder Rating System ver.1.00 のレート集計式に基づく。
// 各コンテストの performance（難易度＋時間から推定した perf）の履歴から算出する。

// g(x) = 2^(x/800) … 良い perf により大きな重みを与える
const g = (x: number): number => 2 ** (x / 800);
const gInv = (y: number): number => 800 * Math.log2(y);

// f(n): 参加回数による補正（f(1)=1200, n→∞ で 0 に収束）
//   F(n) = sqrt(Σ_{i=1}^{n} 0.81^i) / Σ_{i=1}^{n} 0.9^i
const F = (n: number): number => {
  let s81 = 0;
  let s9 = 0;
  for (let i = 1; i <= n; i++) {
    s81 += 0.81 ** i;
    s9 += 0.9 ** i;
  }
  return Math.sqrt(s81) / s9;
};
// F(∞) = sqrt(0.81/0.19) / (0.9/0.1)
const F_INF = Math.sqrt(0.81 / 0.19) / (0.9 / 0.1);
const F_1 = F(1); // = 1
const f = (n: number): number => ((F(n) - F_INF) / (F_1 - F_INF)) * 1200;

// レートが400未満のとき、負にならないよう正の値へ補正（AtCoder表示と同じ式）
const positivize = (r: number): number =>
  r >= 400 ? r : 400 / Math.exp((400 - r) / 400);

// perfs: performance の履歴。perfs[0] が最新、末尾が最古。
// 1件も無ければ null（レート無し）。
export const computeRating = (perfs: number[]): number | null => {
  const k = perfs.length;
  if (k === 0) return null;

  let num = 0;
  let den = 0;
  for (let i = 0; i < k; i++) {
    const w = 0.9 ** (i + 1); // i=0(最新) → 0.9^1
    num += g(perfs[i]) * w;
    den += w;
  }
  const aggregated = gInv(num / den); // 式(8)
  const raw = aggregated - f(k);        // サマリ: 加重平均 − f(n)
  return Math.round(positivize(raw));
};
