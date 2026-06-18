import { Api, Client } from 'traq-bot-ts';
import { fetchUserRating, ratingToColor } from './src/atcoder';
import { getAtcoderId, registerUser } from './src/store';

const TOKEN = process.env.TOKEN;
const BOT_NAME = process.env.BOT_NAME ?? 'BOT_virtualABC';

if (!TOKEN) throw new Error('TOKEN is not set');

const api = new Api({
  securityWorker: (token) => ({
    headers: { Authorization: `Bearer ${token}` },
  }),
});
api.setSecurityData(TOKEN);

const send = async (channelId: string, content: string) => {
  await api.channels.postMessage(channelId, { content });
};

const client = new Client({ token: TOKEN });

client.on('MESSAGE_CREATED', async ({ body }) => {
  const { message } = body;

  if (message.user.bot) return;

  const mentioned = message.embedded.some(
    (e) => e.type === 'user' && e.raw === `@${BOT_NAME}`,
  );
  if (!mentioned) return;

  const parts = message.plainText.trim().split(/\s+/);
  const mentionIdx = parts.findIndex((p) => p === `@${BOT_NAME}`);
  const args = parts.slice(mentionIdx + 1);

  const channelId = message.channelId;
  const traqId = message.user.name;

  switch (args[0]) {
    case 'register': {
      if (args.length < 2) {
        await send(channelId, `:warning: 使い方: \`@${BOT_NAME} register <AtCoder ID>\``);
        return;
      }
      registerUser(traqId, args[1]);
      await send(channelId, `:white_check_mark: @${traqId} のAtCoder IDを \`${args[1]}\` として登録しました！`);
      break;
    }

    case 'status': {
      const atcoderId = getAtcoderId(traqId);
      if (!atcoderId) {
        await send(channelId, `:warning: AtCoder IDが未登録です。\`@${BOT_NAME} register <AtCoder ID>\` で登録してください。`);
        return;
      }
      const info = await fetchUserRating(atcoderId);
      if (!info) {
        await send(channelId, `:information_source: **${atcoderId}** のレーティング情報が見つかりませんでした。`);
        return;
      }
      await send(
        channelId,
        `## ${atcoderId} のステータス

**レーティング**: ${info.rating}（${ratingToColor(info.rating)}）
**最高レーティング**: ${info.highestRating}（${ratingToColor(info.highestRating)}）
**参加コンテスト数**: ${info.ratedCount}回`,
      );
      break;
    }

    case undefined:
    case 'help':
      await sendHelp(channelId);
      break;

    default:
      await send(channelId, `:warning: 不明なコマンドです。\`@${BOT_NAME} help\` でコマンド一覧を確認できます。`);
  }
});

const sendHelp = async (channelId: string) => {
  await send(
    channelId,
    `## Virtual ABC Bot

| コマンド | 説明 |
|---------|------|
| \`@${BOT_NAME} register <AtCoder ID>\` | AtCoder IDを登録する |
| \`@${BOT_NAME} status\` | 自分のレーティングを確認する |
| \`@${BOT_NAME} start <コンテストID> [時間(分)]\` | コンテストを開始する（例: \`@${BOT_NAME} start abc300\`）|
| \`@${BOT_NAME} join\` | 進行中のコンテストに参加する |
| \`@${BOT_NAME} standings\` | 現在の順位表を表示する |
| \`@${BOT_NAME} end\` | コンテストを終了して最終結果を表示する |`,
  );
};

await client.listen(() => console.log(`Virtual ABC Bot (${BOT_NAME}) started!`));
