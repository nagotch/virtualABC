import { useEffect, useState } from 'react';
import { api, fmtDuration, type Standings as StandingsData } from '../api';

const TRAQ_ICON = (name: string) =>
  `https://q.trap.jp/api/v3/public/icon/${encodeURIComponent(name)}`;

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
        ※ ユーザースクリプト(Tampermonkey)を入れた参加者の提出がリアルタイムで反映されます。反映されない場合は「更新」を押してください。
      </p>

      {data.rows.length === 0 ? (
        <p className="section-empty">参加者がいません。「参加」すると順位表に表示されます。</p>
      ) : (
        <div className="table-scroll">
          <table className="standings-table">
            <thead>
              <tr>
                <th>順位</th>
                <th className="st-user">参加者</th>
                <th>得点</th>
                <th>時間</th>
                {data.problems.map((p) => (
                  <th key={p.problem_id} title={`${p.points}点`}>{p.problem_index}</th>
                ))}
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
                  <td className="st-score">{r.score}</td>
                  <td className="st-time">{r.score > 0 ? fmtDuration(r.penaltySeconds) : '-'}</td>
                  {data.problems.map((p) => {
                    const res = r.problems[p.problem_id];
                    if (!res || (!res.solved && res.penalties === 0)) {
                      return <td key={p.problem_id} className="st-cell">-</td>;
                    }
                    if (res.solved) {
                      return (
                        <td key={p.problem_id} className="st-cell st-ac">
                          {fmtDuration(res.acTimeSeconds ?? 0)}
                          {res.penalties > 0 && <span className="st-pen">({res.penalties})</span>}
                        </td>
                      );
                    }
                    return (
                      <td key={p.problem_id} className="st-cell st-wa">
                        ({res.penalties})
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
