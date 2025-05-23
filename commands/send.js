const { CommandInteraction, MessageEmbed, Permissions } = require('discord.js');
const dotenv = require('dotenv');

dotenv.config();

module.exports = {
  data: {
    name: 'send',
    description: '指定されたユーザーにDMを送信します。',
    options: [
      {
        name: 'user',
        description: 'DMを送信するユーザー',
        type: 'USER',
        required: true,
      },
      {
        name: 'message',
        description: '送信するメッセージ',
        type: 'STRING',
        required: true,
      },
    ],
  },
  async execute(interaction = new CommandInteraction()) {
    try {
      const isAdmin = interaction.user.id === process.env.ADMIN;

      if (!isAdmin) {
        await interaction.reply({
          content: 'このコマンドは管理者のみ使用できます。',
          ephemeral: true,
        });
        return;
      }

      const user = interaction.options.getUser('user');
      const messageContent = interaction.options.getString('message');


      await user.send(messageContent);

      await interaction.reply({
        content: `ユーザーにDMを送信しました: ${user}`,
        ephemeral: true,
      });
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: 'コマンドの実行中にエラーが発生しました。',
        ephemeral: true,
      });
    }
  },
};
