import { useEffect, useState } from 'react';
import { api, endIso, fmtDateTime, modeLabel, type ContestDetail as Detail } from '../api';
import DifficultyCircle from '../components/DifficultyCircle';
import Standings from './Standings';

export default function ContestDetail({ id, meId }: { id: string; meId: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [standingsKey, setStandingsKey] = useState(0);

  const reload = async () => {
    const d = await api.getContest(id);
    if (d) setData(d);
    else setNotFound(true);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [id]);

  const handleJoin = async () => {
    setJoining(true);
    setError('');
    const res = await api.joinContest(id);
    setJoining(false);
    if ('ok' in res) {
      await reload();
      setStandingsKey((k) => k + 1);
    } else if (res.error === 'atcoder id not registered') {
      setError('参加するにはマイページでAtCoder IDを登録してください');
    } else {
      setError('参加に失敗しました');
    }
  };

  const handleLeave = async () => {
    setJoining(true);
    await api.leaveContest(id);
    setJoining(false);
    await reload();
    setStandingsKey((k) => k + 1);
  };

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
  const joined = data.participants.some((p) => p.traq_id === meId);

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
        作成: @{data.contest.created_by} ・ {modeLabel(data.contest.mode)} ・ 参加 {data.participants.length}人
      </p>

      <div className="join-row">
        {joined ? (
          <>
            <span className="joined-badge">✓ 参加中</span>
            <button className="btn btn-ghost btn-inline" onClick={handleLeave} disabled={joining}>
              参加取消
            </button>
          </>
        ) : (
          <button className="btn btn-primary btn-inline" onClick={handleJoin} disabled={joining}>
            {joining ? '処理中...' : 'このコンテストに参加'}
          </button>
        )}
      </div>

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

      <Standings key={standingsKey} contestId={id} />

      {isOwner && (
        <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
          {deleting ? '削除中...' : 'このコンテストを削除'}
        </button>
      )}
    </div>
  );
}
