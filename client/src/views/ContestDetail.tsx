import { useEffect, useState } from 'react';
import { api, endIso, fmtDateTime, modeLabel, type ContestDetail as Detail } from '../api';
import DifficultyCircle from '../components/DifficultyCircle';

export default function ContestDetail({ id, meId }: { id: string; meId: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getContest(id).then((d) => {
      if (d) setData(d);
      else setNotFound(true);
    });
  }, [id]);

  const handleDelete = async () => {
    if (!confirm('このコンテストを削除しますか？この操作は取り消せません。')) return;
    setDeleting(true);
    setError('');
    const res = await api.deleteContest(id);
    if ('ok' in res) {
      window.location.hash = '#/contests';
    } else {
      setError(res.error === 'forbidden' ? '作成者のみ削除できます' : '削除に失敗しました');
      setDeleting(false);
    }
  };

  if (notFound) {
    return (
      <div className="card">
        <h1>コンテストが見つかりません</h1>
        <a className="btn btn-ghost" href="#/contests">一覧へ戻る</a>
      </div>
    );
  }

  if (!data) return <div className="card"><p className="msg">読み込み中...</p></div>;

  const isOwner = data.contest.created_by === meId;

  return (
    <div className="card card-wide">
      <div className="card-head">
        <h1>{data.contest.title}</h1>
        <a className="btn btn-ghost btn-inline" href="#/contests">一覧</a>
      </div>
      <p className="hint">
        🗓 {fmtDateTime(data.contest.start_at)} 〜 {fmtDateTime(endIso(data.contest.start_at, data.contest.duration_minutes))}
        （{data.contest.duration_minutes ?? '?'}分）
      </p>
      <p className="hint">
        作成: @{data.contest.created_by} ・ {modeLabel(data.contest.mode)}
      </p>

      <table className="problem-table">
        <thead>
          <tr>
            <th>#</th>
            <th>問題</th>
            <th>難易度</th>
          </tr>
        </thead>
        <tbody>
          {data.problems.map((p, i) => (
            <tr key={p.problem_id}>
              <td className="pt-idx">{String.fromCharCode(65 + i)}</td>
              <td>
                <a href={p.url} target="_blank" rel="noreferrer" className="pt-link">
                  {p.title}
                </a>
                <span className="pt-src">{p.atcoder_contest} {p.problem_index}</span>
              </td>
              <td>
                <span className="diff-cell">
                  <DifficultyCircle difficulty={p.difficulty} />
                  <span className={`diff-value${p.difficulty === null ? ' unknown' : ''}`}>
                    {p.difficulty === null ? '不明' : p.difficulty}
                  </span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {error && <p className="msg error">{error}</p>}

      {isOwner && (
        <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
          {deleting ? '削除中...' : 'このコンテストを削除'}
        </button>
      )}
    </div>
  );
}
