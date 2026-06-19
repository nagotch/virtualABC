// traQ BOT を使ったコンテスト通知
import { Api } from 'traq-bot-ts';

const TOKEN = process.env.TOKEN;
const CHANNEL_ID = process.env.TRAQ_NOTIFY_CHANNEL_ID;
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173';

const api = new Api({
  securityWorker: (token) => ({ headers: { Authorization: `Bearer ${token}` } }),
});
if (TOKEN) api.setSecurityData(TOKEN);

// 日時をJST表記に
const fmtJst = (iso: string): string =>
  new Date(iso).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    weekday: 'short',
  });

// 任意の本文を通知チャンネルへ投稿する。
// 投稿成功、または設定が無くスキップした場合は true（呼び出し側で「処理済み」扱い可）。
// 実際の投稿失敗のみ false を返す（呼び出し側で再試行できる）。
export const postNotification = async (content: string): Promise<boolean> => {
  if (!TOKEN || !CHANNEL_ID) {
    console.warn('[notify] TOKEN or TRAQ_NOTIFY_CHANNEL_ID is not set; skip notification');
    return true;
  }
  try {
    await api.channels.postMessage(CHANNEL_ID, { content, embed: true });
    return true;
  } catch (e) {
    console.error('[notify] failed to post notification:', e);
    return false;
  }
};

export type NotifyContest = {
  id: string;
  title: string;
  startAt: string;          // ISO8601
  durationMinutes: number;
  problemCount: number;
  createdBy: string;
};

// コンテスト作成をtraQに通知する（ベストエフォート。失敗してもthrowしない）
export const notifyContestCreated = async (c: NotifyContest): Promise<void> => {
  if (!TOKEN || !CHANNEL_ID) {
    console.warn('[notify] TOKEN or TRAQ_NOTIFY_CHANNEL_ID is not set; skip notification');
    return;
  }

  const endAt = new Date(new Date(c.startAt).getTime() + c.durationMinutes * 60_000).toISOString();
  const content = [
    `## :trophy: 新しいバーチャルコンテストが作成されました`,
    ``,
    `### ${c.title}`,
    `- :calendar: 開催: **${fmtJst(c.startAt)}** 〜 ${fmtJst(endAt)}`,
    `- :hourglass: 実施時間: **${c.durationMinutes}分**`,
    `- :page_facing_up: 問題数: ${c.problemCount}問`,
    `- :bust_in_silhouette: 作成者: :@${c.createdBy}:`,
    ``,
    `:link: ${APP_URL}/#/contests/${c.id}`,
  ].join('\n');

  try {
    await api.channels.postMessage(CHANNEL_ID, { content, embed: true });
  } catch (e) {
    console.error('[notify] failed to post contest notification:', e);
  }
};
