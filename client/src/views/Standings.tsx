import { useEffect, useState } from 'react';
import { api, fmtDuration, type Standings as StandingsData } from '../api';

const TRAQ_ICON = (name: string) =>
  `https://q.trap.jp/api/v3/public/icon/${encodeURIComponent(name)}`;

// AtCoderのレート帯色
const perfColor = (r: number): string => {
  if (r >= 2800) return '#ff0000';
  if (r >= 2400) return '#ff8000';
  if (r >= 2000) return '#c0c000';
  if (r >= 1600) return '#0000ff';
  if (r >= 1200) return '#00c0c0';
  if (r >= 800) return '#008000';
  if (r >= 400) return '#804000';
  return '#808080';
};

export default function Standings({ contestId }: { contestId: string }) {
  const [data, setData] = useState<StandingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await api.standings(contestId);
      if (res) setData(res);
      else setFailed(true);
    } catch (e) {
      console.error('standings load failed:', e);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [contestId]);

  if (loading && !data) return <p className="msg">順位表を集計中...</p>;
  if (failed && !data) {
    return (
      <div className="standings-wrap">
        <p className="section-empty">順位表を取得できませんでした。</p>
        <button className="btn btn-ghost btn-inline" onClick={load}>再試行</button>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="standings-wrap">
      <div className="standings-head">
        <h2 className="section-title" style={{ margin: 0 }}>🏆 順位表</h2>
        <button className="btn btn-ghost btn-inline" onClick={load} disabled={loading}>
          {loading ? '更新中...' : '更新'}
        </button>
      </div>

      <p className="hint" style={{ marginBottom: 12 }}>
        ※ 提出詳細ページでユーザースクリプトの「報告」ボタンを押すと反映されます。反映されない場合は「更新」を押してください。
      </p>

      {data.rows.length === 0 ? (
        <p className="section-empty">参加者がいません。「参加」すると順位表に表示されます。</p>
      ) : (
        <div className="table-scroll">
          <table className="standings-table">
            <thead>
              <tr>
                <th className="st-rank-h">順位</th>
                <th className="st-user">参加者</th>
                <th className="st-total-h">得点</th>
                {data.problems.map((p, i) => (
                  <th key={p.problem_id} className="st-prob-h">
                    <span className="st-prob-letter">{String.fromCharCode(65 + i)}</span>
                    <span className="st-prob-pts">{p.points}</span>
                  </th>
                ))}
                <th className="st-perf-h">perf</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.traqId}>
                  <td className="st-rank">{r.rank}</td>
                  <td className="st-user">
                    <span className="user-id">
                      <img className="avatar" src={TRAQ_ICON(r.traqId)} alt="" width={22} height={22} />
                      @{r.traqId}
                    </span>
                  </td>
                  <td className="st-total">
                    <span className="st-total-score">{r.score}</span>
                    <span className="st-total-time">{r.score > 0 ? fmtDuration(r.penaltySeconds) : '-'}</span>
                  </td>
                  {data.problems.map((p) => {
                    const res = r.problems[p.problem_id];
                    if (!res || (!res.solved && res.penalties === 0)) {
                      return <td key={p.problem_id} className="st-cell" />;
                    }
                    if (res.solved) {
                      return (
                        <td key={p.problem_id} className="st-cell st-ac">
                          <span className="st-cell-score">
                            {p.points}
                            {res.penalties > 0 && <span className="st-pen"> ({res.penalties})</span>}
                          </span>
                          <span className="st-cell-time">{fmtDuration(res.acTimeSeconds ?? 0)}</span>
                        </td>
                      );
                    }
                    return (
                      <td key={p.problem_id} className="st-cell st-wa">
                        <span className="st-cell-score">({res.penalties})</span>
                      </td>
                    );
                  })}
                  <td className="st-perf">
                    {r.perf === null ? '-' : (
                      <span style={{ color: perfColor(r.perf), fontWeight: 700 }}>{r.perf}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
