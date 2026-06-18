export const API = 'http://localhost:3000';

export type User = {
  traqId: string;
  atcoderId: string | null;
};

export type RatingInfo = {
  rating: number | null; // virtualABC 独自レート
  contests: number;      // レート算出に使った（終了済み参加）コンテスト数
};

export type ColorKey =
  | 'grey' | 'brown' | 'green' | 'cyan'
  | 'blue' | 'yellow' | 'orange' | 'red';

export type Problem = {
  idx: number;
  problem_id: string;
  atcoder_contest: string;
  problem_index: string;
  title: string;
  difficulty: number | null;
  color: ColorKey | null;
  url: string;
  points: number;
};

export type Participant = { traq_id: string; atcoder_id: string };

export type ProblemResult = {
  solved: boolean;
  penalties: number;
  acTimeSeconds: number | null;
};

export type StandingRow = {
  rank: number;
  traqId: string;
  atcoderId: string;
  score: number;
  penaltySeconds: number;
  perf: number | null;
  problems: Record<string, ProblemResult>;
};

export type Standings = {
  contest: { id: string; title: string; start_at: string | null; duration_minutes: number | null };
  problems: { problem_id: string; problem_index: string; points: number; difficulty: number | null }[];
  rows: StandingRow[];
};

export type ContestMode = 'random' | 'color' | 'manual';

export const modeLabel = (m: ContestMode | string): string =>
  m === 'random' ? 'ランダム' : m === 'color' ? '色指定' : m === 'manual' ? '手動' : m;

export type ContestSummary = {
  id: string;
  title: string;
  mode: ContestMode;
  created_by: string;
  created_at: string;
  start_at: string | null;
  duration_minutes: number | null;
  problem_count: number;
};

export type ContestDetail = {
  contest: Omit<ContestSummary, 'problem_count'>;
  problems: Problem[];
  participants: Participant[];
  canViewProblems: boolean;
};

// AtCoderのレート帯色。light=従来色 / dark=暗背景でも見やすい明るめの色。
type Band = { key: ColorKey; label: string; min: number; light: string; dark: string };
const BANDS: Band[] = [
  { key: 'grey',   label: '灰', min: 0,    light: '#808080', dark: '#b9b9b9' },
  { key: 'brown',  label: '茶', min: 400,  light: '#804000', dark: '#cd8b48' },
  { key: 'green',  label: '緑', min: 800,  light: '#008000', dark: '#5cc85c' },
  { key: 'cyan',   label: '水', min: 1200, light: '#00c0c0', dark: '#36d6d6' },
  { key: 'blue',   label: '青', min: 1600, light: '#0000ff', dark: '#7d93ff' },
  { key: 'yellow', label: '黄', min: 2000, light: '#c0c000', dark: '#dede3a' },
  { key: 'orange', label: '橙', min: 2400, light: '#ff8000', dark: '#ffa64d' },
  { key: 'red',    label: '赤', min: 2800, light: '#ff0000', dark: '#ff5b5b' },
];

export const COLOR_DEFS: { key: ColorKey; label: string }[] =
  BANDS.map(({ key, label }) => ({ key, label }));

const isDark = (): boolean =>
  typeof document !== 'undefined' &&
  document.documentElement.getAttribute('data-theme') === 'dark';

// 色キーに対応する表示色（テーマ対応）
export const colorHex = (key: ColorKey | null): string => {
  const b = BANDS.find((c) => c.key === key) ?? BANDS[0];
  return isDark() ? b.dark : b.light;
};

export const colorLabel = (key: ColorKey | null): string =>
  BANDS.find((c) => c.key === key)?.label ?? '?';

// レート/難易度の数値に対応する表示色（テーマ対応）
export const ratingColor = (value: number): string => {
  let b = BANDS[0];
  for (const x of BANDS) if (value >= x.min) b = x;
  return isDark() ? b.dark : b.light;
};

// ISO日時をJST表記に
export const fmtDateTime = (iso: string | null): string => {
  if (!iso) return '日時未設定';
  return new Date(iso).toLocaleString('ja-JP', {
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    weekday: 'short',
  });
};

// 開始＋実施時間から終了時刻のISOを求める
export const endIso = (startIso: string | null, minutes: number | null): string | null => {
  if (!startIso || !minutes) return null;
  return new Date(new Date(startIso).getTime() + minutes * 60_000).toISOString();
};

// 秒数を H:MM:SS / M:SS 表記に
export const fmtDuration = (sec: number): string => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

export type ContestStatus = 'ongoing' | 'upcoming' | 'finished';

// 現在時刻からコンテストの開催状態を判定する
export const contestStatus = (
  startAt: string | null,
  durationMinutes: number | null,
  now: number = Date.now(),
): ContestStatus => {
  if (!startAt) return 'finished'; // 日時未設定の旧データは終了扱い
  const start = new Date(startAt).getTime();
  const end = start + (durationMinutes ?? 0) * 60_000;
  if (now < start) return 'upcoming';
  if (now < end) return 'ongoing';
  return 'finished';
};

export const api = {
  async me(): Promise<User | null> {
    const res = await fetch(`${API}/api/auth/me`, { credentials: 'include' });
    const { user } = await res.json() as { user: User | null };
    return user;
  },
  async rating(): Promise<RatingInfo | null> {
    const res = await fetch(`${API}/api/users/rating`, { credentials: 'include' });
    if (!res.ok) return null;
    return res.json() as Promise<RatingInfo>;
  },
  async register(atcoderId: string): Promise<boolean> {
    const res = await fetch(`${API}/api/users/register`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ atcoderId }),
    });
    return res.ok;
  },
  async listContests(): Promise<ContestSummary[]> {
    const res = await fetch(`${API}/api/contests`, { credentials: 'include' });
    const { contests } = await res.json() as { contests: ContestSummary[] };
    return contests;
  },
  async getContest(id: string): Promise<ContestDetail | null> {
    const res = await fetch(`${API}/api/contests/${id}`, { credentials: 'include' });
    if (!res.ok) return null;
    return res.json() as Promise<ContestDetail>;
  },
  async createContest(body: {
    title?: string;
    mode: ContestMode;
    count?: number;
    colorSpec?: Partial<Record<ColorKey, number>>;
    urls?: string[];
    startAt: string;
    durationMinutes: number;
  }): Promise<{ id: string } | { error: string }> {
    const res = await fetch(`${API}/api/contests`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json() as Promise<{ id: string } | { error: string }>;
  },
  async deleteContest(id: string): Promise<{ ok: true } | { error: string }> {
    const res = await fetch(`${API}/api/contests/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return res.json() as Promise<{ ok: true } | { error: string }>;
  },
  async joinContest(id: string): Promise<{ ok: true } | { error: string }> {
    const res = await fetch(`${API}/api/contests/${id}/join`, {
      method: 'POST', credentials: 'include',
    });
    return res.json() as Promise<{ ok: true } | { error: string }>;
  },
  async leaveContest(id: string): Promise<{ ok: true } | { error: string }> {
    const res = await fetch(`${API}/api/contests/${id}/leave`, {
      method: 'POST', credentials: 'include',
    });
    return res.json() as Promise<{ ok: true } | { error: string }>;
  },
  async standings(id: string): Promise<Standings | null> {
    const res = await fetch(`${API}/api/contests/${id}/standings`, { credentials: 'include' });
    if (!res.ok) return null;
    return res.json() as Promise<Standings>;
  },
  logout(): Promise<Response> {
    return fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include' });
  },
};
