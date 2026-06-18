// AtCoder Problems 風の難易度サークル。
// 色帯（400刻み）の中での位置を、円の下からの塗り具合で表現する。

const BANDS = [
  { min: 0,    hex: '#808080' }, // 灰
  { min: 400,  hex: '#804000' }, // 茶
  { min: 800,  hex: '#008000' }, // 緑
  { min: 1200, hex: '#00c0c0' }, // 水
  { min: 1600, hex: '#0000ff' }, // 青
  { min: 2000, hex: '#c0c000' }, // 黄
  { min: 2400, hex: '#ff8000' }, // 橙
  { min: 2800, hex: '#ff0000' }, // 赤
];

// difficulty から「帯の色」と「帯内での塗り割合(0..1)」を求める
const circleStyle = (difficulty: number): { hex: string; ratio: number } => {
  // 一番下の帯を初期値に
  let band = BANDS[0];
  for (const b of BANDS) {
    if (difficulty >= b.min) band = b;
  }
  const ratio = Math.min(1, Math.max(0, (difficulty - band.min) / 400));
  return { hex: band.hex, ratio };
};

export default function DifficultyCircle({
  difficulty,
}: {
  difficulty: number | null;
}) {
  if (difficulty === null) {
    return <span className="diff-circle diff-circle--unknown" title="難易度不明" />;
  }
  const { hex, ratio } = circleStyle(difficulty);
  const pct = Math.round(ratio * 100);
  return (
    <span
      className="diff-circle"
      title={`difficulty: ${difficulty}`}
      style={{
        borderColor: hex,
        background: `linear-gradient(to top, ${hex} ${pct}%, transparent ${pct}%)`,
      }}
    />
  );
}
