const dotenv = require('dotenv');

dotenv.config();

module.exports = {
  data: {
    name: 'setnick',
    description: 'ニックネームを変更します。',
    options: [
      {
        type: 'USER',
        name: 'user',
        description: '設定するユーザー',
        required: true,
      },
      {
        type: 'STRING',
        name: 'nick',
        description: '設定するニックネーム',
        required: true,
      },
    ],
  },
  async execute(interaction) {
    const authorizedUser = process.env.ADMIN; // .envファイルのADMIN変数の値を取得
    const userId = interaction.user.id; // コマンドを実行したユーザーのIDを取得
    const isAdmin = userId === authorizedUser;
    const isServerOwner = interaction.guild.ownerId === userId;

    if (!isAdmin && !isServerOwner) {
      await interaction.reply({ content: '権限がありません。', ephemeral: true });
      return;
    }

    const user = interaction.options.getUser('user');
    const nick = interaction.options.getString('nick');

    try {
      await interaction.guild.members.cache.get(user.id).setNickname(nick);
      await interaction.reply({ content: 'ニックネームの変更を実行しました。(Botのロールが変更者のロールの効力より弱い場合、キャンセルされます。)', ephemeral: true });
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: 'ニックネームの変更中にエラーが発生しました。', ephemeral: true });
    }
  },
};
