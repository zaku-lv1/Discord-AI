const { WebhookClient, MessageEmbed, Client, Intents } = require('discord.js');

module.exports = {
  data: {
    name: 'tama',
    description: 'たまたまを召喚したり退出させたりします。',
  },
  async execute(interaction) {
    const userId = '1075263318882783383'; // 使用するユーザーIDを指定する
    const channel = interaction.channel;
    const webhooks = await channel.fetchWebhooks();
    const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] }); // 使用するインテントを指定する
    await client.login(process.env.BOT_TOKEN); // BOT_TOKENはご自身のボットトークンに置き換えてください
    const user = await client.users.fetch(userId); // 指定されたユーザーIDを使用してユーザー情報を取得する
    const tamaWebhook = webhooks.find((webhook) => webhook.name === user.username);

    if (tamaWebhook) {
      // tamaが既に召喚されている場合は退出させる
      await tamaWebhook.delete(); // tamaのWebhookを削除する

      const embed = new MessageEmbed()
        .setDescription('たまたまを退出させました。');
      await interaction.reply({ embeds: [embed] });
    } else if (tamaWebhook){
      await tamaWebhook.delete();
      const embed = new MessageEmbed()
        .setDescription('たまたまを退出させました。');
      await interaction.reply({ embeds: [embed] });
    } else {
      // tamaが召喚されていない場合は召喚する
      const tamaWebhook = await channel.createWebhook(user.username, {
        avatar: user.displayAvatarURL(), // ユーザーのアイコンを取得してWebhookのアイコンに設定する
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
        '身長180cm以下は人権ない'
      ];

      const filter = (message) => !message.author.bot;
      const collector = channel.createMessageCollector({ filter });

      collector.on('collect', async (message) => {
        const randomMessage = messages[Math.floor(Math.random() * messages.length)];
        const special_message = message.content;

        if (special_message.includes('TikTok')) {
          await tamaWebhook.send('TikTokLITEか');
        } else {
            await kttWebhook.send(randomMessage);
        }
      });

      collector.on('webhookUpdate', async () => {
        // Webhookが更新された場合の処理
        await tamaWebhook.delete(); // tamaのWebhookを削除する

        const embed = new MessageEmbed()
          .setDescription('Webhookが更新されたため、たまたまを退出させました。');
        await interaction.reply({ embeds: [embed] });

        collector.stop(); // コレクターを停止する
      });

      const embed = new MessageEmbed()
        .setDescription('たまたまを召喚しました。');
      await interaction.reply({ embeds: [embed] });

      await client.destroy(); // クライアントを破棄する
    }
  },
};
