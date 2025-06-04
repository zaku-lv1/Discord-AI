const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const dotenv = require('dotenv');

dotenv.config(); // メインファイルで設定済みなら不要な場合あり

module.exports = {
  data: new SlashCommandBuilder()
    .setName('echo')
    .setDescription('指定したメッセージを指定したチャンネルに送信します。')
    .addStringOption(option =>
      option.setName('message')
        .setDescription('送信するメッセージ (Discordの文字数制限に注意)')
        .setRequired(true)
        .setMaxLength(2000)) // Discordのメッセージ上限
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('メッセージを送信するチャンネル')
        .setRequired(true)
        // 送信可能なチャンネルタイプを指定
        .addChannelTypes(
            ChannelType.GuildText, 
            ChannelType.GuildAnnouncement,
            ChannelType.PublicThread,
            ChannelType.PrivateThread
            // ChannelType.GuildVoice // ボイスチャンネルのテキストチャットも対象にする場合
            )),
  async execute(interaction) {
    // 権限チェック
    const ownerId = interaction.guild?.ownerId; // guildが存在する場合のみownerIdを取得
    const authorizedUserId = process.env.ADMIN;
    const userId = interaction.user.id;

    // サーバー内でのみオーナーチェックが有効
    const isOwner = interaction.inGuild() && userId === ownerId;
    const isEnvAdmin = userId === authorizedUserId;

    if (!isEnvAdmin && !isOwner) {
      await interaction.reply({ content: 'このコマンドを実行する権限がありません。', ephemeral: true });
      return;
    }

    const messageContent = interaction.options.getString('message');
    const targetChannel = interaction.options.getChannel('channel');

    // 1. チャンネルがメッセージ送信可能か基本的な型チェック
    if (!targetChannel.isTextBased() || targetChannel.isDMBased()) {
        await interaction.reply({
            content: '指定されたチャンネルはテキストメッセージを送信できる場所ではありません。テキストチャンネルやスレッドを指定してください。',
            ephemeral: true,
        });
        return;
    }
    
    // 2. ボットが対象チャンネルでメッセージを送信する権限を持っているか確認
    const botPermissionsInChannel = targetChannel.permissionsFor(interaction.client.user);
    if (!botPermissionsInChannel) {
        await interaction.reply({ content: 'ボットの権限情報を取得できませんでした。開発者にお問い合わせください。', ephemeral: true });
        return;
    }
    if (!botPermissionsInChannel.has(PermissionFlagsBits.ViewChannel)) {
        await interaction.reply({ content: `ボットがチャンネル「${targetChannel.name}」を閲覧する権限がありません。`, ephemeral: true });
        return;
    }
    if (!botPermissionsInChannel.has(PermissionFlagsBits.SendMessages)) {
        await interaction.reply({ content: `ボットがチャンネル「${targetChannel.name}」にメッセージを送信する権限がありません。`, ephemeral: true });
        return;
    }


    try {
      await targetChannel.send(messageContent);
      await interaction.reply({
        content: `チャンネル <#${targetChannel.id}> にメッセージを送信しました。`,
        ephemeral: true, // 実行者のみに見せる
      });
    } catch (error) {
      console.error(`Echoコマンドエラー (Channel: ${targetChannel.id}):`, error);
      let errorMessage = 'メッセージの送信中にエラーが発生しました。';
      if (error.code === 50013) { // DiscordAPIErrorCodes.MissingPermissions
          errorMessage = `ボットがチャンネル「${targetChannel.name}」にメッセージを送信する権限が不足しています。`;
      } else if (error.code === 50001) { // DiscordAPIErrorCodes.MissingAccess
          errorMessage = `ボットがチャンネル「${targetChannel.name}」にアクセスできませんでした。`;
      } else if (error.message.includes('Invalid Form Body') || error.code === 50006) { // 空メッセージなど
          errorMessage = '送信するメッセージ内容が無効です（例: 空、長すぎるなど）。';
      }
      
      // interactionが既に返信済みか、遅延されているかを確認
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true }).catch(console.error);
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true }).catch(console.error);
      }
    }
  },
};