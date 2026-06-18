// AtCoder Problems API のデータ取得・キャッシュと問題セット生成

const BASE = 'https://kenkoooo.com/atcoder/resources';
const UA = 'virtualABC/0.1 (traP internal tool)';

export type Problem = {
  id: string;          // 問題ID 例: abc300_a
  contest_id: string;  // コンテストID 例: abc300
  problem_index: string; // 問題インデックス 例: A
  name: string;
  title: string;
};

type ProblemModel = { difficulty?: number };
type ModelMap = Record<string, ProblemModel>;

// AtCoderのレート帯（difficultyベース）
export const COLORS = [
  { key: 'grey',   label: '灰', min: -Infinity, max: 399 },
  { key: 'brown',  label: '茶', min: 400,  max: 799 },
  { key: 'green',  label: '緑', min: 800,  max: 1199 },
  { key: 'cyan',   label: '水', min: 1200, max: 1599 },
  { key: 'blue',   label: '青', min: 1600, max: 1999 },
  { key: 'yellow', label: '黄', min: 2000, max: 2399 },
  { key: 'orange', label: '橙', min: 2400, max: 2799 },
  { key: 'red',    label: '赤', min: 2800, max: Infinity },
] as const;

export type ColorKey = (typeof COLORS)[number]['key'];

// ---- キャッシュ（メモリ） ----
type Cache<T> = { data: T; fetchedAt: number };
const TTL = 6 * 60 * 60 * 1000; // 6時間
let problemsCache: Cache<Problem[]> | null = null;
let modelsCache: Cache<ModelMap> | null = null;

const fetchJson = async <T>(path: string): Promise<T> => {
  const res = await fetch(`${BASE}/${path}`, {
    headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip' },
  });
  if (!res.ok) throw new Error(`AtCoder Problems fetch failed: ${path} ${res.status}`);
  return res.json() as Promise<T>;
};

const getProblems = async (): Promise<Problem[]> => {
  if (problemsCache && Date.now() - problemsCache.fetchedAt < TTL) {
    return problemsCache.data;
  }
  const data = await fetchJson<Problem[]>('problems.json');
  problemsCache = { data, fetchedAt: Date.now() };
  return data;
};

const getModels = async (): Promise<ModelMap> => {
  if (modelsCache && Date.now() - modelsCache.fetchedAt < TTL) {
    return modelsCache.data;
  }
  const data = await fetchJson<ModelMap>('problem-models.json');
  modelsCache = { data, fetchedAt: Date.now() };
  return data;
};

// 出題対象の問題（ABCのみ）。difficulty を付与して返す。
export type EnrichedProblem = Problem & { difficulty: number | null };

const getAbcProblems = async (): Promise<EnrichedProblem[]> => {
  const [problems, models] = await Promise.all([getProblems(), getModels()]);
  return problems
    .filter((p) => p.contest_id.startsWith('abc'))
    .map((p) => ({
      ...p,
      difficulty: models[p.id]?.difficulty ?? null,
    }));
};

const colorOf = (difficulty: number): ColorKey => {
  for (const c of COLORS) {
    if (difficulty >= c.min && difficulty <= c.max) return c.key;
  }
  return 'red';
};

// 配列からランダムにn個（重複なし）取り出す
const sample = <T>(arr: T[], n: number): T[] => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
};

export type GeneratedProblem = {
  id: string;
  contest_id: string;
  problem_index: string;
  title: string;
  difficulty: number | null;
  color: ColorKey | null;
  url: string;
};

const toGenerated = (p: EnrichedProblem): GeneratedProblem => ({
  id: p.id,
  contest_id: p.contest_id,
  problem_index: p.problem_index,
  title: p.title,
  difficulty: p.difficulty,
  color: p.difficulty === null ? null : colorOf(p.difficulty),
  url: `https://atcoder.jp/contests/${p.contest_id}/tasks/${p.id}`,
});

// 方式1: 過去ABCから問題ごとにランダム。
// A問題はA問題から、B問題はB問題から…と、各スロットを同じ問題インデックスの
// 問題からランダムに選ぶ（本番ABCに近い難易度カーブになる）。
export const generateRandom = async (count: number): Promise<GeneratedProblem[]> => {
  const pool = await getAbcProblems();
  // 問題インデックス(A,B,C…)ごとにグループ化
  const byIndex = new Map<string, EnrichedProblem[]>();
  for (const p of pool) {
    const key = p.problem_index.toUpperCase();
    (byIndex.get(key) ?? byIndex.set(key, []).get(key)!).push(p);
  }

  const result: GeneratedProblem[] = [];
  for (let i = 0; i < count; i++) {
    const letter = String.fromCharCode(65 + i); // A, B, C, ...
    const candidates = byIndex.get(letter);
    if (!candidates || candidates.length === 0) continue; // その位置の問題が無ければスキップ
    result.push(...sample(candidates, 1).map(toGenerated));
  }
  return result;
};

// 方式2: 色ごとに指定数。spec例: { cyan: 2, green: 1 }
export const generateByColor = async (
  spec: Partial<Record<ColorKey, number>>,
): Promise<GeneratedProblem[]> => {
  const pool = (await getAbcProblems()).filter((p) => p.difficulty !== null);
  const result: GeneratedProblem[] = [];
  for (const { key } of COLORS) {
    const count = spec[key] ?? 0;
    if (count <= 0) continue;
    const candidates = pool.filter((p) => colorOf(p.difficulty as number) === key);
    result.push(...sample(candidates, count).map(toGenerated));
  }
  // 難易度順に並べる（未設定は末尾）
  return result.sort(
    (a, b) => (a.difficulty ?? Infinity) - (b.difficulty ?? Infinity),
  );
};
