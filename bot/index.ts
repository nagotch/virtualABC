import { Api, Client } from 'traq-bot-ts';

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

  // plainText例: "@BOT_virtualABC help" → args = ["help"]
  const parts = message.plainText.trim().split(/\s+/);
  const mentionIdx = parts.findIndex((p) => p === `@${BOT_NAME}`);
  const args = parts.slice(mentionIdx + 1);

  const channelId = message.channelId;

  if (args.length === 0 || args[0] === 'help') {
    await sendHelp(channelId);
    return;
  }

  await send(channelId, `:warning: 不明なコマンドです。\`@${BOT_NAME} help\` でコマンド一覧を確認できます。`);
});

const sendHelp = async (channelId: string) => {
  await send(
    channelId,
    `## Virtual ABC Bot

| コマンド | 説明 |
|---------|------|
| \`@${BOT_NAME} register <AtCoder ID>\` | AtCoder IDを登録する |
| \`@${BOT_NAME} start <コンテストID> [時間(分)]\` | コンテストを開始する（例: \`@${BOT_NAME} start abc300\`）|
| \`@${BOT_NAME} join\` | 進行中のコンテストに参加する |
| \`@${BOT_NAME} standings\` | 現在の順位表を表示する |
| \`@${BOT_NAME} status\` | コンテストの状態を確認する |
| \`@${BOT_NAME} end\` | コンテストを終了して最終結果を表示する |`,
  );
};

await client.listen(() => console.log(`Virtual ABC Bot (${BOT_NAME}) started!`));
