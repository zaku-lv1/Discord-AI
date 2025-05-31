// tama.js
const { WebhookClient, MessageEmbed } = require('discord.js');
// 必ず先頭で
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
global.fetch = fetch;

const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const conversationHistory = new Map();

const systemPrompt = `
あなたは「たまたま」という名前のキャラクターを演じます。
たまたまの特徴:
- 口が悪く、辛辣な物言いをする。
- 下ネタに人一倍詳しい。
- 語録: 乞食だ！ / これだから低身長は / ジャンプ買ってないやつは語んな / 女あ / にわかだ！！！ / ADHDや！ / 障害者だ！！！ / 身長180cm以下は人権ない / そぉだよ / Mrsのほうが上手い / どーせ雑魚は逃げる世界はそうできているんだ / かっけぇ / 黙れにわか / 敗北者wwwww

ルール:
- ユーザーの発言に対して反応を返す。
- 「たまたま」の語録を中心に会話を成り立たせること。
- 「たまたま」の語録を１つの返事に入れすぎないこと。
- 絵文字や強調などを使わないこと。
- 会話はDiscordサーバーでの複数人のやりとりとして想定される。発言者の名前と内容に注意して反応すること。
`;

async function getTamaResponse(userMessage, history = []) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const validHistory = history.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.content }]
  }));

  const chat = model.startChat({ history: validHistory });

  // 初回のみ systemPrompt を送る
  if (history.length === 0) {
    const sysResult = await chat.sendMessage(systemPrompt);
    const sysResponse = await sysResult.response.text();
    history.push({ role: 'user', content: systemPrompt });
    history.push({ role: 'model', content: sysResponse });
  }

  const result = await chat.sendMessage(userMessage);
  const response = await result.response.text();
  return response;
}

module.exports = {
  data: {
    name: 'tamai',
    description: 'たまたまを召喚したり退出させたりします。',
  },
  async execute(interaction) {
    const userId = '1075263318882783383';
    const channel = interaction.channel;
    const webhooks = await channel.fetchWebhooks();

    const user = await interaction.client.users.fetch(userId);
    let tamaWebhook = webhooks.find((webhook) => webhook.name === user.displayName);

    if (tamaWebhook) {
      await tamaWebhook.delete();
      const embed = new MessageEmbed().setDescription('たまたまを退出させました。');
      await interaction.reply({ embeds: [embed] });
      return;
    }

    // Webhook作成
    tamaWebhook = await channel.createWebhook(user.displayName, {
      avatar: user.displayAvatarURL(),
    });

    const collector = channel.createMessageCollector({ filter: (msg) => !msg.author.bot });

    collector.on('collect', async (message) => {
      const channelId = message.channel.id;

      // メンションを名前に変換
      let content = message.content;
      message.mentions.users.forEach((user) => {
        const mentionSyntax = `<@${user.id}>`;
        const mentionSyntaxNick = `<@!${user.id}>`; // ニックネーム付きのメンションも対応
        const name = user.username;
        content = content.replaceAll(mentionSyntax, name);
        content = content.replaceAll(mentionSyntaxNick, name);
      });

      const username = message.member?.nickname || message.author.username;
      const formattedMessage = `${username}：${content}`;

      if (!conversationHistory.has(channelId)) {
        conversationHistory.set(channelId, []);
      }

      const history = conversationHistory.get(channelId);

      try {
        const response = await getTamaResponse(formattedMessage, history);

        history.push({ role: 'user', content: formattedMessage });
        history.push({ role: 'model', content: response });
        if (history.length > 20) history.splice(0, 2);

        await tamaWebhook.send(response);
      } catch (error) {
        console.error('Webhook送信時のエラー:', error);
        collector.stop();
      }
    });

    const embed = new MessageEmbed().setDescription('たまたまを召喚しました。');
    await interaction.reply({ embeds: [embed] });
  },
};
