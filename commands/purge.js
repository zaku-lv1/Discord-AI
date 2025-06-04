const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const dotenv = require('dotenv');

dotenv.config();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('指定した量のメッセージを削除します。(最大100件、14日以内)')
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('削除するメッセージの量 (1-100)')
        .setRequired(true)
        .setMinValue(1) // 最小値を1に設定
        .setMaxValue(100)) // 最大値を100に設定
    // コマンドのデフォルト実行権限 (メッセージ管理権限を持つユーザーに表示)
    // .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    ,
  async execute(interaction) {
    // .env ADMIN チェック
    const authorizedUserId = process.env.ADMIN;
    const issuerId = interaction.user.id;
    const issuerMember = interaction.member;

    const isEnvAdmin = issuerId === authorizedUserId;
    // ManageMessages 権限チェック (サーバー内でのみ有効)
    const hasManageMessagesPerm = interaction.inGuild() && issuerMember.permissions.has(PermissionFlagsBits.ManageMessages);

    // .envで指定されたADMIN、またはManageMessages権限を持つユーザーが実行可能
    if (!isEnvAdmin && !hasManageMessagesPerm) {
      await interaction.reply({ content: 'メッセージを削除する権限がありません。', ephemeral: true });
      return;
    }

    // チャンネルがメッセージ削除可能なタイプか確認
    if (!interaction.channel || !interaction.channel.isTextBased() || interaction.channel.type === ChannelType.DM) {
        await interaction.reply({ content: 'このコマンドはDM以外のテキストチャンネルでのみ使用できます。', ephemeral: true });
        return;
    }
    
    // ボットがメッセージ管理権限を持っているか確認
    const botMember = await interaction.guild.members.fetch(interaction.client.user.id);
    if (!botMember.permissions.has(PermissionFlagsBits.ManageMessages)) {
        await interaction.reply({ content: 'ボットにメッセージを管理する権限がありません。', ephemeral: true });
        return;
    }

    const amount = interaction.options.getInteger('amount');

    // deferReplyで応答を遅延 (ephemeral推奨)
    await interaction.deferReply({ ephemeral: true });

    try {
      let deletedMessagesCount = 0;

      if (amount === 1) {
        // 1件だけ削除する場合
        const messagesToDelete = await interaction.channel.messages.fetch({ limit: 1 });
        if (messagesToDelete.size > 0) {
          await messagesToDelete.first().delete();
          deletedMessagesCount = 1;
        }
      } else {
        // 2件以上削除する場合 (bulkDeleteは2件から100件まで)
        const deletedMessages = await interaction.channel.bulkDelete(amount, true); // trueで14日以上前のメッセージを除外
        deletedMessagesCount = deletedMessages.size;
      }

      if (deletedMessagesCount > 0) {
        await interaction.editReply({
          content: `${deletedMessagesCount}件のメッセージを削除しました。 (14日以上前のメッセージは削除されません)`,
        });
      } else {
        await interaction.editReply({
          content: '削除対象のメッセージが見つからなかったか、削除できませんでした。',
        });
      }

    } catch (error) {
      console.error('Purgeコマンドエラー:', error);
      let errorMessage = 'メッセージの削除中にエラーが発生しました。';
      if (error.code === 50034) { // DiscordAPIErrorCodes.MessageTooOld
        errorMessage = '14日以上前のメッセージを一括削除することはできません。';
      } else if (error.code === 50013) { // DiscordAPIErrorCodes.MissingPermissions
        errorMessage = 'ボットの権限が不足しているため、メッセージを削除できませんでした。';
      } else if (error.message.toLowerCase().includes('must be an array')) { // bulkDeleteに渡す引数が不正
        errorMessage = 'メッセージ削除の内部処理で問題が発生しました。指定した件数を確認してください。';
      }
      await interaction.editReply({ content: errorMessage });
    }
  },
};