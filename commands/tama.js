const { WebhookClient, MessageEmbed, Client, Intents } = require('discord.js');

module.exports = {
  data: {
    name: 'tama',
    description: 'たまたまを召喚したり退出させたりします。',
  },
  async execute(interaction) {
    const userId = '1075263318882783383'; // 使用するユーザーIDを指定
    const channel = interaction.channel;

    const webhooks = await channel.fetchWebhooks();
    const client = new Client({
      intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES],
    });

    await client.login(process.env.BOT_TOKEN);
    const user = await client.users.fetch(userId);
    let tamaWebhook = webhooks.find((webhook) => webhook.name === user.displayName);

    if (tamaWebhook) {
      await tamaWebhook.delete();

      const embed = new MessageEmbed().setDescription('たまたまを退出させました。');
      await interaction.reply({ embeds: [embed] });

      await client.destroy();
      return;
    }

    // 召喚処理
    tamaWebhook = await channel.createWebhook(user.displayName, {
      avatar: user.displayAvatarURL(),
    });

    const messages = [
      'そうだよ',
      '乞食だ！',
      'これだから低身長は',
      'ジャンプ買ってないやつは語んな',
      '女あ',
      'にわかだ！！！',
      'ADHDや！',
      '障害者だ！！！',
      '身長180cm以下は人権ない',
    ];

    const filter = (message) => !message.author.bot;
    const collector = channel.createMessageCollector({ filter });

    collector.on('collect', async (message) => {
      const special_message = message.content;
      const randomMessage = messages[Math.floor(Math.random() * messages.length)];

      try {
        if (special_message.toLowerCase().includes('tiktok')) {
          await tamaWebhook.send('TikTokLITEか');
        } else {
          await tamaWebhook.send(randomMessage);
        }
      } catch (error) {
        console.error('Webhook送信時のエラー:', error);
        collector.stop();
      }
    });

    collector.on('webhookUpdate', async () => {
      try {
        await tamaWebhook.delete();
      } catch (error) {
        console.error('Webhook削除エラー:', error);
      }

      const embed = new MessageEmbed().setDescription('Webhookが更新されたため、たまたまを退出させました。');
      await interaction.reply({ embeds: [embed] });

      collector.stop();
    });

    const embed = new MessageEmbed().setDescription('たまたまを召喚しました。');
    await interaction.reply({ embeds: [embed] });

    await client.destroy();
  },
};
