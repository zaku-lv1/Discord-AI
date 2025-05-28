// tama.js
const { WebhookClient, MessageEmbed } = require('discord.js');
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const conversationHistory = new Map();

const systemPrompt = `
あなたは「たまたま」という名前のキャラクターを演じます。
たまたまの特徴:
- 口が悪く、辛辣な物言いをする。
- 語録の例: 乞食だ！ / ジャンプ買ってないやつは語んな / ADHDや！ / 身長180cm以下は人権ない。
- だが、どこか人間味があり、話を続けようとする。

ルール:
- ユーザーの発言に対して反応を返す。
- 「たまたま」らしい皮肉や煽りを交えて、会話を成り立たせること。
`;

async function getTamaResponse(userMessage, history = []) {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userMessage },
  ];

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages,
  });

  return response.choices[0].message.content;
}

module.exports = {
  data: {
    name: 'tama',
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
      if (!conversationHistory.has(channelId)) {
        conversationHistory.set(channelId, []);
      }

      const history = conversationHistory.get(channelId);
      const response = await getTamaResponse(message.content, history);

      history.push({ role: 'user', content: message.content });
      history.push({ role: 'assistant', content: response });
      if (history.length > 20) history.splice(0, 2);

      try {
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
