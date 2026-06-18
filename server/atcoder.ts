// AtCoder Problems API のデータ取得・キャッシュと問題セット生成
//
// データソース:
// - contest-problem.json : コンテストと問題の対応（権威ある index 情報）
// - problems.json        : 問題のタイトル(name)
// - problem-models.json  : 推定難易度(difficulty)
//
// 注意: problems.json は問題idが再利用コンテスト(ADT等)に再割当てされ
// contest_id/problem_index が元のABCとずれることがあるため、コンテスト所属と
// indexの判定には必ず contest-problem.json を使う。

const BASE = 'https://kenkoooo.com/atcoder/resources';
const UA = 'virtualABC/0.1 (traP internal tool)';

type ContestProblem = {
  contest_id: string;
  problem_id: string;
  problem_index: string;
};
type ProblemMeta = { id: string; name: string; title: string };
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
let cpCache: Cache<ContestProblem[]> | null = null;
let metaCache: Cache<Map<string, ProblemMeta>> | null = null;
let modelsCache: Cache<ModelMap> | null = null;

const fetchJson = async <T>(path: string): Promise<T> => {
  const res = await fetch(`${BASE}/${path}`, {
    headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip' },
  });
  if (!res.ok) throw new Error(`AtCoder Problems fetch failed: ${path} ${res.status}`);
  return res.json() as Promise<T>;
};

const getContestProblems = async (): Promise<ContestProblem[]> => {
  if (cpCache && Date.now() - cpCache.fetchedAt < TTL) return cpCache.data;
  const data = await fetchJson<ContestProblem[]>('contest-problem.json');
  cpCache = { data, fetchedAt: Date.now() };
  return data;
};

const getMeta = async (): Promise<Map<string, ProblemMeta>> => {
  if (metaCache && Date.now() - metaCache.fetchedAt < TTL) return metaCache.data;
  const arr = await fetchJson<ProblemMeta[]>('problems.json');
  const map = new Map(arr.map((p) => [p.id, p]));
  metaCache = { data: map, fetchedAt: Date.now() };
  return map;
};

const getModels = async (): Promise<ModelMap> => {
  if (modelsCache && Date.now() - modelsCache.fetchedAt < TTL) return modelsCache.data;
  const data = await fetchJson<ModelMap>('problem-models.json');
  modelsCache = { data, fetchedAt: Date.now() };
  return data;
};

// 出題対象の正規化された問題（ABCのみ）
export type EnrichedProblem = {
  problem_id: string;
  contest_id: string;
  problem_index: string;
  name: string;
  difficulty: number | null; // 生のdifficulty
};

const isAbc = (contestId: string): boolean => /^abc\d+$/.test(contestId);

const getAbcProblems = async (): Promise<EnrichedProblem[]> => {
  const [cps, meta, models] = await Promise.all([
    getContestProblems(), getMeta(), getModels(),
  ]);
  return cps
    .filter((cp) => isAbc(cp.contest_id))
    .map((cp) => ({
      problem_id: cp.problem_id,
      contest_id: cp.contest_id,
      problem_index: cp.problem_index,
      name: meta.get(cp.problem_id)?.name ?? cp.problem_id,
      difficulty: models[cp.problem_id]?.difficulty ?? null,
    }));
};

// AtCoder Problems の難易度補正。生のdifficultyは400未満で負になり得るため、
// 表示上は 400/exp((400-d)/400) で 0 に漸近する正の値へ補正する（公式フロントと同じ式）。
export const correctDifficulty = (raw: number): number => {
  if (raw >= 400) return Math.round(raw);
  return Math.round(400 / Math.exp((400 - raw) / 400));
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
  difficulty: number | null; // 補正済み
  color: ColorKey | null;
  url: string;
};

const toGenerated = (p: EnrichedProblem): GeneratedProblem => {
  const diff = p.difficulty === null ? null : correctDifficulty(p.difficulty);
  return {
    id: p.problem_id,
    contest_id: p.contest_id,
    problem_index: p.problem_index,
    title: p.name,
    difficulty: diff,
    color: diff === null ? null : colorOf(diff),
    url: `https://atcoder.jp/contests/${p.contest_id}/tasks/${p.problem_id}`,
  };
};

// 方式1: 過去ABCから問題ごとにランダム。
// A問題はA問題から、B問題はB問題から…と、各スロットを同じ問題インデックスの
// 問題からランダムに選ぶ（本番ABCに近い難易度カーブになる）。
export const generateRandom = async (count: number): Promise<GeneratedProblem[]> => {
  const pool = await getAbcProblems();
  const byIndex = new Map<string, EnrichedProblem[]>();
  for (const p of pool) {
    const key = p.problem_index.toUpperCase();
    (byIndex.get(key) ?? byIndex.set(key, []).get(key)!).push(p);
  }

  const result: GeneratedProblem[] = [];
  for (let i = 0; i < count; i++) {
    const letter = String.fromCharCode(65 + i); // A, B, C, ...
    const candidates = byIndex.get(letter);
    if (!candidates || candidates.length === 0) continue;
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
  return result.sort(
    (a, b) => (a.difficulty ?? Infinity) - (b.difficulty ?? Infinity),
  );
};

// AtCoderの問題URLから contest_id と problem_id を取り出す
const parseAtcoderUrl = (
  url: string,
): { contest_id: string; problem_id: string } | null => {
  const m = url.match(/atcoder\.jp\/contests\/([^/]+)\/tasks\/([^/?#\s]+)/);
  if (!m) return null;
  return { contest_id: m[1], problem_id: m[2] };
};

// ショートハンド "ABC331/D" / "abc331 d" / "abc331-d" を contest_id と index に
const parseShorthand = (
  spec: string,
): { contest_id: string; problem_index: string } | null => {
  const m = spec.match(/^([A-Za-z]+\d+)\s*[/_\- ]\s*([A-Za-z0-9]+)$/);
  if (!m) return null;
  return { contest_id: m[1].toLowerCase(), problem_index: m[2].toUpperCase() };
};

// problem_id から index を推定（"abc300_a" → "A"）。contest-problemに無い時のfallback
const deriveIndex = (problemId: string): string => {
  const seg = problemId.split('_').pop() ?? problemId;
  return seg.toUpperCase();
};

// ---- 提出取得（順位表用） ----
export type Submission = {
  id: number;
  epoch_second: number;
  problem_id: string;
  contest_id: string;
  user_id: string;
  result: string; // "AC", "WA", "TLE", ...
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 指定ユーザーの fromSecond 以降の提出を取得（500件ごとにページング）
export const fetchUserSubmissions = async (
  user: string,
  fromSecond: number,
): Promise<Submission[]> => {
  const all: Submission[] = [];
  let from = fromSecond;
  for (let page = 0; page < 20; page++) {
    const res = await fetch(
      `https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions?user=${encodeURIComponent(user)}&from_second=${from}`,
      {
        headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip' },
        signal: AbortSignal.timeout(15000), // ハング防止
      },
    );
    if (!res.ok) {
      if (res.status === 404) return all; // 存在しないユーザー
      throw new Error(`submissions fetch failed: ${res.status}`);
    }
    const batch = await res.json() as Submission[];
    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 500) break;
    from = batch[batch.length - 1].epoch_second + 1;
    await sleep(300); // レート制限への配慮
  }
  return all;
};

// 方式3: 手動。問題URLまたは "ABC331/D" 形式のリストから問題セットを作る。
// 解釈できなかった行は結果に含めない（呼び出し側で件数チェック可能）。
export const generateManual = async (specs: string[]): Promise<GeneratedProblem[]> => {
  const [cps, meta, models] = await Promise.all([
    getContestProblems(), getMeta(), getModels(),
  ]);
  // contest_id/index → ContestProblem（ショートハンド用）
  const byCI = new Map<string, ContestProblem>();
  // contest_id/problem_id → index（URLのindex確定用）
  const byCP = new Map<string, string>();
  for (const cp of cps) {
    byCI.set(`${cp.contest_id.toLowerCase()}/${cp.problem_index.toUpperCase()}`, cp);
    byCP.set(`${cp.contest_id}/${cp.problem_id}`, cp.problem_index);
  }

  const build = (problemId: string, contestId: string, index: string): GeneratedProblem => {
    const raw = models[problemId]?.difficulty ?? null;
    const diff = raw === null ? null : correctDifficulty(raw);
    return {
      id: problemId,
      contest_id: contestId,
      problem_index: index,
      title: meta.get(problemId)?.name ?? problemId,
      difficulty: diff,
      color: diff === null ? null : colorOf(diff),
      url: `https://atcoder.jp/contests/${contestId}/tasks/${problemId}`,
    };
  };

  const result: GeneratedProblem[] = [];
  for (const raw of specs) {
    const spec = raw.trim();
    const url = parseAtcoderUrl(spec);
    if (url) {
      const index = byCP.get(`${url.contest_id}/${url.problem_id}`) ?? deriveIndex(url.problem_id);
      result.push(build(url.problem_id, url.contest_id, index));
      continue;
    }
    const sh = parseShorthand(spec);
    if (sh) {
      const cp = byCI.get(`${sh.contest_id}/${sh.problem_index}`);
      if (cp) result.push(build(cp.problem_id, cp.contest_id, cp.problem_index));
      continue;
    }
    // どちらにも当てはまらない行はスキップ
  }
  return result;
};
