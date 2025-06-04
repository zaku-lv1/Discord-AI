const { SlashCommandBuilder } = require('discord.js'); // SlashCommandBuilderのみインポート
const dotenv = require('dotenv');

dotenv.config();

module.exports = {
  // SlashCommandBuilder を使用してコマンド情報を定義
  data: new SlashCommandBuilder()
    .setName('send')
    .setDescription('指定されたユーザーにDMを送信します。')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('DMを送信するユーザー')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('message')
        .setDescription('送信するメッセージ (Discordの文字数制限に注意)')
        .setRequired(true)
        .setMaxLength(2000)), // Discordのメッセージ上限（DMも同様）
  async execute(interaction) { // CommandInteraction の型ヒントは削除 (必須ではないため)
    try {
      // 管理者チェック (変更なし)
      const isAdmin = interaction.user.id === process.env.ADMIN;

      if (!isAdmin) {
        await interaction.reply({
          content: 'このコマンドは管理者のみ使用できます。',
          ephemeral: true,
        });
        return;
      }

      const targetUser = interaction.options.getUser('user');
      const messageContent = interaction.options.getString('message');

      if (targetUser.bot) {
        await interaction.reply({
          content: 'ボットにDMを送信することはできません。',
          ephemeral: true,
        });
        return;
      }

      try {
        await targetUser.send(messageContent);
        await interaction.reply({
          content: `${targetUser.username} にDMを送信しました。`,
          ephemeral: true,
        });
      } catch (dmError) {
        console.error(`DM送信エラー (To: ${targetUser.id}):`, dmError);
        let replyMessage = 'DMの送信に失敗しました。';
        if (dmError.code === 50007) { // DiscordAPIErrorCodes.CannotSendMessagesToThisUser
          replyMessage = 'DMの送信に失敗しました。相手ユーザーがDMを許可していないか、ブロックされている可能性があります。';
        }
        await interaction.reply({
          content: replyMessage,
          ephemeral: true,
        });
      }

    } catch (error) {
      console.error('Sendコマンド全体のエラー:', error);
      // interactionが既に返信済みか、遅延されているかを確認
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'コマンドの実行中に予期せぬエラーが発生しました。', ephemeral: true });
      } else {
        await interaction.reply({ content: 'コマンドの実行中に予期せぬエラーが発生しました。', ephemeral: true });
      }
    }
  },
};