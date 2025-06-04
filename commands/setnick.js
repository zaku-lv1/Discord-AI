const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const dotenv = require('dotenv');

dotenv.config();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setnick')
    .setDescription('指定されたユーザーのニックネームを変更します。')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('ニックネームを設定するユーザー')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('nick')
        .setDescription('設定するニックネーム (32文字以内)')
        .setRequired(true)
        .setMaxLength(32)) // Discordのニックネーム上限
    // コマンドのデフォルト実行権限 (ニックネーム管理権限を持つユーザーに表示)
    // .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    ,
  async execute(interaction) {
    // 実行者の権限チェック
    const authorizedUserId = process.env.ADMIN;
    const issuerId = interaction.user.id;
    const issuerMember = interaction.member; // GuildMemberとしての実行者

    const isEnvAdmin = issuerId === authorizedUserId;
    // interaction.member.permissions.has は、DM内ではエラーになるので、guildが存在することを確認
    const hasManageNicknamesPerm = interaction.inGuild() && issuerMember.permissions.has(PermissionFlagsBits.ManageNicknames);
    // サーバーオーナーであるか (より安全なチェック)
    const isServerOwner = interaction.inGuild() && interaction.guild.ownerId === issuerId;


    // .envで指定されたADMIN、サーバーオーナー、またはManageNicknames権限を持つユーザーが実行可能
    if (!isEnvAdmin && !isServerOwner && !hasManageNicknamesPerm) {
      await interaction.reply({ content: 'ニックネームを変更する権限がありません。', ephemeral: true });
      return;
    }

    const targetUser = interaction.options.getUser('user');
    const newNickname = interaction.options.getString('nick');

    // 対象ユーザーのGuildMemberオブジェクトを取得
    const targetMember = interaction.options.getMember('user');

    if (!targetMember) {
      await interaction.reply({ content: '指定されたユーザーはこのサーバーのメンバーではありません。', ephemeral: true });
      return;
    }

    // ボット自身の情報を取得
    const botMember = await interaction.guild.members.fetch(interaction.client.user.id);

    // 1. ボットがニックネーム管理権限を持っているか
    if (!botMember.permissions.has(PermissionFlagsBits.ManageNicknames)) {
      await interaction.reply({ content: 'ボットにニックネームを管理する権限がありません。', ephemeral: true });
      return;
    }

    // 2. 対象がサーバーオーナーの場合、変更不可 (実行者がオーナー自身である場合を除く)
    if (targetMember.id === interaction.guild.ownerId && issuerId !== interaction.guild.ownerId) {
      await interaction.reply({ content: 'サーバーオーナーのニックネームは変更できません。', ephemeral: true });
      return;
    }
    
    // 3. ボットのロールが対象ユーザーのロールより高いか (オーナーは除く)
    if (targetMember.id !== interaction.guild.ownerId && botMember.roles.highest.position <= targetMember.roles.highest.position) {
      await interaction.reply({ content: 'ボットのロールが対象ユーザーのロールより低いため、ニックネームを変更できません。', ephemeral: true });
      return;
    }
    
    // 4. 自分自身のニックネームを変更しようとしている場合 (setNicknameは他人に対して使うのが主)
    // 自分自身のニックネームは interaction.member.setNickname で変更可能
    if (targetMember.id === issuerId) {
        try {
            await issuerMember.setNickname(newNickname);
            await interaction.reply({ content: `あなたのニックネームを「${newNickname}」に変更しました。`, ephemeral: true });
        } catch (error) {
            console.error(`自分のニックネーム変更エラー (User: ${issuerId}):`, error);
            await interaction.reply({ content: '自分のニックネーム変更中にエラーが発生しました。', ephemeral: true });
        }
        return;
    }


    try {
      await targetMember.setNickname(newNickname);
      await interaction.reply({ content: `${targetUser.username} のニックネームを「${newNickname}」に変更しました。`, ephemeral: false }); // 成功時は公開しても良いかも
    } catch (error) {
      console.error(`ニックネーム変更エラー (Target: ${targetUser.id}, Nick: ${newNickname}):`, error);
      // エラーの内容に応じてメッセージを出し分ける
      let errorMessage = 'ニックネームの変更中に不明なエラーが発生しました。';
      if (error.code === 50013) { // Missing Permissions
        errorMessage = 'ボットの権限が不足しているか、対象ユーザーのロールが高すぎるため、ニックネームを変更できませんでした。';
      } else if (error.message.includes('Invalid Form Body')) {
        errorMessage = 'ニックネームが長すぎるか、無効な文字が含まれています。ニックネームは32文字以内です。';
      }
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  },
};