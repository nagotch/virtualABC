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
    `- :bust_in_silhouette: 作成者: @${c.createdBy}`,
    ``,
    `:link: ${APP_URL}/#/contests/${c.id}`,
  ].join('\n');

  try {
    await api.channels.postMessage(CHANNEL_ID, { content, embed: true });
  } catch (e) {
    console.error('[notify] failed to post contest notification:', e);
  }
};
