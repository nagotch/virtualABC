// AtCoder Problems 風の難易度サークル。
// 色帯（400刻み）の中での位置を、円の下からの塗り具合で表現する。
import { ratingColor } from '../api';

export default function DifficultyCircle({
  difficulty,
}: {
  difficulty: number | null;
}) {
  if (difficulty === null) {
    return <span className="diff-circle diff-circle--unknown" title="難易度不明" />;
  }
  // 帯内での塗り割合（400刻み）
  const ratio = Math.min(1, Math.max(0, (difficulty - Math.floor(difficulty / 400) * 400) / 400));
  const hex = ratingColor(difficulty); // テーマ対応の帯色
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
