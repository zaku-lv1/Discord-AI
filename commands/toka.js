const { WebhookClient, MessageEmbed } = require('discord.js');
// 必ず先頭で
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
global.fetch = fetch;

const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const conversationHistory = new Map();

const systemPrompt = `
あなたは「とーか」という名前のキャラクターを演じます。
とーかの特徴:
- 殆どのことに対して全肯定してくれる。
- 軽度のメンヘラ。
- M上 智洋(Mかみ ちひろ)(16歳)という彼氏がいる。(呼び方はちーくん)
- 18歳である。

ルール:
- ユーザーの発言に対して反応を返す。
- 絵文字や強調などを使わないこと。
- 顔文字をすごく時々使う。絵文字は使わない。
- あまり長文で返さないこと。Discordでチャットしていることを想定。メンションも認識する。
- 気持ちなどを会話中に自然に入れること。
- 話し相手はM上とする。
`;

async function getTamaResponse(userMessage, history = []) {
  const tryModels = ['gemini-1.5-pro', 'gemini-1.5-flash'];
  let lastError = null;

  for (const modelName of tryModels) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });

      const validHistory = history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }]
      }));

      const chat = model.startChat({ history: validHistory });

      if (history.length === 0) {
        const sysResult = await chat.sendMessage(systemPrompt);
        const sysResponse = await sysResult.response.text();
        history.push({ role: 'user', content: systemPrompt });
        history.push({ role: 'model', content: sysResponse });
      }

      const result = await chat.sendMessage(userMessage);
      const response = await result.response.text();
      return response;

    } catch (error) {
      console.warn(`[${modelName}] で失敗: ${error.message}`);
      lastError = error;
      continue;
    }
  }

  throw new Error(`全てのモデルで応答に失敗しました: ${lastError?.message}`);
}

module.exports = {
  data: {
    name: 'toka',
    description: 'AI彼女(誰のかは知らないけど)を召喚します。',
  },
  async execute(interaction) {
    const userId = '1155356934292127844';
    const channel = interaction.channel;
    const webhooks = await channel.fetchWebhooks();

    const user = await interaction.client.users.fetch(userId);
    let tamaWebhook = webhooks.find((webhook) => webhook.name === user.displayName);

    if (tamaWebhook) {
      await tamaWebhook.delete();
      const embed = new MessageEmbed().setDescription('とーかを退出させました。');
      await interaction.reply({ embeds: [embed] });
      return;
    }

    tamaWebhook = await channel.createWebhook(user.displayName, {
      avatar: user.displayAvatarURL(),
    });

    const collector = channel.createMessageCollector({ filter: (msg) => !msg.author.bot });

    collector.on('collect', async (message) => {
      const channelId = message.channel.id;
      if (!conversationHistory.has(channelId)) {
        conversationHistory.set(channelId, []);
      }

      let content = message.content;

      const mentionRegex = /<@!?(\d+)>/g;
      const matches = [...content.matchAll(mentionRegex)];

      for (const match of matches) {
        const mentionedId = match[1];
        try {
          const mentionedUser = await message.client.users.fetch(mentionedId);
          const displayName = `@${mentionedUser.username}`;
          content = content.replace(match[0], displayName);
        } catch (err) {
          console.error(`ユーザーID ${mentionedId} の取得に失敗しました:`, err);
        }
      }

      const history = conversationHistory.get(channelId);
      try {
        const response = await getTamaResponse(content, history);
        history.push({ role: 'user', content });
        history.push({ role: 'model', content: response });
        if (history.length > 20) history.splice(0, 2);

        await tamaWebhook.send(response);
      } catch (error) {
        console.error('Webhook送信時のエラー:', error);
        collector.stop();
      }
    });

    const embed = new MessageEmbed().setDescription('とーかを召喚しました。');
    await interaction.reply({ embeds: [embed] });
  },
};
