const dotenv = require('dotenv');

dotenv.config();

module.exports = {
  data: {
    name: 'echo',
    description: '指定したメッセージを指定したチャンネルに送信します。',
    options: [
      {
        name: 'message',
        description: '送信するメッセージ',
        type: 'STRING',
        required: true,
      },
      {
        name: 'channel',
        description: 'メッセージを送信するチャンネル',
        type: 'CHANNEL',
        required: true,
      },
    ],
  },
  async execute(interaction) {
    const ownerId = interaction.guild.ownerId; // サーバーのオーナーのIDを取得
    const authorizedUser = process.env.ADMIN; // .envファイルのADMIN変数の値を取得
    const userId = interaction.user.id; // コマンドを実行したユーザーのIDを取得

    if (userId !== authorizedUser && userId !== ownerId) {
      await interaction.reply({ content: '権限がありません。', ephemeral: true });
      return;
    }

    const message = interaction.options.getString('message');
    const channel = interaction.options.getChannel('channel');

    try {
      await channel.send(message);
      await interaction.reply({
        content: 'メッセージを送信しました。',
        ephemeral: true,
      });
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: 'メッセージの送信中にエラーが発生しました。',
        ephemeral: true,
      });
    }
  },
};
