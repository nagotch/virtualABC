// 管理者（admin）判定。レート変動ありのコンテストを作成できるのは admin のみ。
// 既定で @nagotch を admin とする。環境変数 ADMIN_TRAQ_IDS（カンマ区切り）で上書き可。

const ADMIN_IDS = new Set(
  (process.env.ADMIN_TRAQ_IDS ?? 'nagotch')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

export const isAdmin = (traqId: string | null | undefined): boolean =>
  !!traqId && ADMIN_IDS.has(traqId);
