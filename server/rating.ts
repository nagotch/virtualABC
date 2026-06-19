// nagotch_virtual 独自レーティング
// AtCoder Rating System ver.1.00 の集計式をベースにしつつ、少ない参加回数で安定するよう
// 直近重み付けの減衰比率を調整している。
//
// AtCoder公式は比率0.9で、補正 f(n) が小さくなるまで約20回かかる。
// ここでは比率を 0.6 に下げ、直近のperfを重く見ることで 5〜6回で f(n) が十分小さくなる
//   （参考: f(6)≈57, f(5)≈97。AtCoder(0.9)では f(6)≈289）。
// 比率以外（g, f(n)の形, 1200スケール, 400未満の補正）は公式に準拠。
const RATIO = 0.6;

// g(x) = 2^(x/800) … 良い perf により大きな重みを与える
const g = (x: number): number => 2 ** (x / 800);
const gInv = (y: number): number => 800 * Math.log2(y);

// f(n): 参加回数による補正（f(1)=1200, n→∞ で 0 に収束）
//   F(n) = sqrt(Σ_{i=1}^{n} RATIO^{2i}) / Σ_{i=1}^{n} RATIO^i
const F = (n: number): number => {
  let sSq = 0; // Σ RATIO^{2i}
  let s = 0;   // Σ RATIO^i
  for (let i = 1; i <= n; i++) {
    sSq += RATIO ** (2 * i);
    s += RATIO ** i;
  }
  return Math.sqrt(sSq) / s;
};
// F(∞) = sqrt(R^2/(1-R^2)) / (R/(1-R))
const F_INF = Math.sqrt((RATIO ** 2) / (1 - RATIO ** 2)) / (RATIO / (1 - RATIO));
const F_1 = F(1); // = 1（RATIOによらず）
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
    const w = RATIO ** (i + 1); // i=0(最新) → RATIO^1
    num += g(perfs[i]) * w;
    den += w;
  }
  const aggregated = gInv(num / den);
  const raw = aggregated - f(k); // 加重平均 − f(n)
  return Math.round(positivize(raw));
};
