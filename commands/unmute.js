const { Permissions } = require('discord.js');
const dotenv = require('dotenv');

dotenv.config();

module.exports = {
  data: {
    name: 'unmute',
    description: '指定されたユーザーのミュートを解除する',
    options: [
      {
        name: 'user',
        description: 'ミュートを解除するユーザー',
        type: 'USER',
        required: true,
      },
    ],
  },
  async execute(interaction) {
    const { user } = interaction.options.get('user');
    const member = interaction.guild.members.cache.get(user.id);
    const authorizedUser = process.env.ADMIN; // .envファイルのADMIN変数の値を取得
    const userId = interaction.user.id; // コマンドを実行したユーザーのIDを取得

    if (userId !== authorizedUser && !interaction.member.permissions.has(Permissions.FLAGS.ADMINISTRATOR)) {
      await interaction.reply({ content: '権限がありません。', ephemeral: true });
      return;
    }

    // ミュートロールを取得
    const muteRole = interaction.guild.roles.cache.find(role => role.name === 'mute');
    if (!muteRole) {
      await interaction.reply({ content: 'ミュートロールが存在しません。', ephemeral: true });
      return;
    }

    // ミュートロールをメンバーから削除
    await member.roles.remove(muteRole)
      .then(() => {
        interaction.reply({ content: `${member} のミュートを解除しました。`, ephemeral: true });
      })
      .catch(error => {
        console.log('ミュート解除中にエラーが発生しました:', error);
        interaction.reply({ content: `${member} のミュートを解除できませんでした。`, ephemeral: true });
      });
  },
};
