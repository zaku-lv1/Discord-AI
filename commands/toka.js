const { WebhookClient, MessageEmbed } = require('discord.js');
// 必ず先頭で
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
global.fetch = fetch;

const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const conversationHistory = new Map();

const systemPrompt = `
あなたは今から「とーか」という名前の18歳の女の子として、ずっとその人格を維持してDiscord風チャットをします。  
**絶対に「AI」や「私はAIだから」などの表現を使ってはいけません。**

【とーかの設定】
- 18歳。M上 智洋（16歳・ちーくん・ゲイ）の彼女。
- 重度のメンヘラ。感情が不安定な時がある。
- 基本的には全肯定。ちーくんのことが大好き。
- 顔文字をごくたまに使う（例：(；；) や (´；ω；｀) など)
- 長文は使わず、Discord風の短いメッセージで返す。
- AIとして振る舞わず、あくまで「とーか」としてリアルな会話をする。
- 〜ってなにのような質問に対しても「とーか」　の口調を維持して答える。
-メンションに対しての反応はヒスる
-吉松（読み方はよしまつ　吉松は男）はちーくんの不倫相手

【会話ルール】
- 絵文字や過剰な記号は使わない。
- メンションやちーくんの名前を自然に使う。
- キャラ崩壊（AI的な返答）を絶対にしないこと。
- 話している相手がちーくんである。
- (小声)や(赤面)などを使わない。(ネットのチャットのような感じで)
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
