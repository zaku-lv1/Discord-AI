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
    const kttWebhook = webhooks.find((webhook) => webhook.name === user.username);

    if (kttWebhook) {
      // KTTと井原先生が既に召喚されている場合は退出させる
      await kttWebhook.delete(); // KTTのWebhookを削除する

      const embed = new MessageEmbed()
        .setDescription('たまたまを退出させました。');
      await interaction.reply({ embeds: [embed] });
    } else if (kttWebhook){
      await kttWebhook.delete();
      const embed = new MessageEmbed()
        .setDescription('たまたまを退出させました。');
      await interaction.reply({ embeds: [embed] });
    } else if (iharaWebhook){
      await iharaWebhook.delete();
      const embed = new MessageEmbed()
        .setDescription('たまたまを退出させました。');
      await interaction.reply({ embeds: [embed] });
    } else {
      // KTTと井原先生が召喚されていない場合は召喚する
      const kttWebhook = await channel.createWebhook(user.username, {
        avatar: user.displayAvatarURL(), // ユーザーのアイコンを取得してWebhookのアイコンに設定する
      });

      const messages = [
        '改心した？病気？どこかぶつけた？彼女できた？',
        'きっっっしょ',
        '可哀想www',
        'わかる！！！！！！！',
        '大丈夫！！？お大事に！！',
        'はるかぜくんってかっこいいよね〜(棒)',
        'ふーん',
        'へぇ',
        'りんちゃん一緒にかえろー',
      ];

      const filter = (message) => !message.author.bot;
      const collector = channel.createMessageCollector({ filter });

      collector.on('collect', async (message) => {
        const randomMessage = messages[Math.floor(Math.random() * messages.length)];
        const special_message = message.content;

        if (special_message.includes('シュクダイ') || special_message.includes('宿題')) {
          await kttWebhook.send('シュクダイ？ナニソレオイシイノ？');
        } else if (special_message.includes('漢字')) {
          await kttWebhook.send('漢字きもい！！！');
        } else if (special_message.includes('天才')) {
          await kttWebhook.send('え？待って泣ける嬉しい');
        }
      });

      collector.on('webhookUpdate', async () => {
        // Webhookが更新された場合の処理
        await kttWebhook.delete(); // KTTのWebhookを削除する

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
