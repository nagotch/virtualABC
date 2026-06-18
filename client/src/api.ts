export const API = 'http://localhost:3000';

export type User = {
  traqId: string;
  atcoderId: string | null;
};

export type RatingInfo = {
  atcoderId: string;
  exists: boolean;
  rating: number | null;
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
};

export type ContestSummary = {
  id: string;
  title: string;
  mode: 'random' | 'color';
  created_by: string;
  created_at: string;
  start_at: string | null;
  duration_minutes: number | null;
  problem_count: number;
};

export type ContestDetail = {
  contest: Omit<ContestSummary, 'problem_count'>;
  problems: Problem[];
};

// 色の定義（表示用）
export const COLOR_DEFS: { key: ColorKey; label: string; hex: string }[] = [
  { key: 'grey',   label: '灰', hex: '#808080' },
  { key: 'brown',  label: '茶', hex: '#804000' },
  { key: 'green',  label: '緑', hex: '#008000' },
  { key: 'cyan',   label: '水', hex: '#00c0c0' },
  { key: 'blue',   label: '青', hex: '#0000ff' },
  { key: 'yellow', label: '黄', hex: '#c0c000' },
  { key: 'orange', label: '橙', hex: '#ff8000' },
  { key: 'red',    label: '赤', hex: '#ff0000' },
];

export const colorHex = (key: ColorKey | null): string =>
  COLOR_DEFS.find((c) => c.key === key)?.hex ?? '#808080';

export const colorLabel = (key: ColorKey | null): string =>
  COLOR_DEFS.find((c) => c.key === key)?.label ?? '?';

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
    mode: 'random' | 'color';
    count?: number;
    colorSpec?: Partial<Record<ColorKey, number>>;
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
  logout(): Promise<Response> {
    return fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include' });
  },
};
