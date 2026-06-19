import { useEffect, useState } from 'react';
import { api, ratingColor, type RankingRow } from '../api';

const TRAQ_ICON = (name: string) =>
  `https://q.trap.jp/api/v3/public/icon/${encodeURIComponent(name)}`;

export default function Ranking() {
  const [rows, setRows] = useState<RankingRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = async () => {
    setFailed(false);
    try {
      setRows(await api.ranking());
    } catch (e) {
      console.error('ranking load failed:', e);
      setFailed(true);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="card card-wide">
      <div className="card-head">
        <h1>🏆 レートランキング</h1>
        <button className="btn btn-ghost btn-inline" onClick={load}>更新</button>
      </div>
      <p className="hint">全ユーザーの確定レート（AtCoder Problems のデータに基づく）順位表です。</p>

      {failed ? (
        <p className="section-empty">ランキングを取得できませんでした。</p>
      ) : rows === null ? (
        <p className="msg">読み込み中...</p>
      ) : rows.length === 0 ? (
        <p className="section-empty">まだユーザーがいません。</p>
      ) : (
        <div className="table-scroll">
          <table className="history-table">
            <thead>
              <tr>
                <th>順位</th>
                <th className="ht-title">ユーザー</th>
                <th>AtCoder ID</th>
                <th>レート</th>
                <th>参加回数</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.traqId}>
                  <td>{r.rank}</td>
                  <td className="ht-title">
                    <span className="user-id">
                      <img className="avatar" src={TRAQ_ICON(r.traqId)} alt="" width={22} height={22} />
                      @{r.traqId}
                    </span>
                  </td>
                  <td>{r.atcoderId}</td>
                  <td style={{ color: ratingColor(r.rating), fontWeight: 700 }}>{r.rating}</td>
                  <td>{r.contests}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
