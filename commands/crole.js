const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const dotenv = require('dotenv');

dotenv.config(); // メインファイルで設定済みなら不要な場合あり

module.exports = {
  data: new SlashCommandBuilder()
    .setName('crole')
    .setDescription('指定した名前と色でロールを作成し、ユーザーに付与します。')
    .addStringOption(option =>
      option.setName('name')
        .setDescription('作成するロールの名前')
        .setRequired(true)
        .setMaxLength(100)) // Discordのロール名の最大長
    .addStringOption(option =>
      option.setName('color')
        .setDescription('ロールの色を選択または16進数で入力 (例: #FF0000)')
        .setRequired(true)
        // 事前定義された色の選択肢
        .addChoices(
          { name: 'デフォルト (無色)', value: 'DEFAULT' },
          { name: '黒', value: '#000001' }, // #000000 は Discord で無色扱いされるため、#000001 などを使用
          { name: '白', value: '#FFFFFF' },
          { name: '赤', value: '#FF0000' },
          { name: '青', value: '#0000FF' },
          { name: '緑', value: '#00FF00' },
          { name: '黄', value: '#FFFF00' },
          { name: '紫', value: '#800080' },
          { name: 'ピンク', value: '#FFC0CB' }
          // 他の色を追加可能
        ))
    .addUserOption(option =>
      option.setName('user')
        .setDescription('ロールを付与するユーザー (任意)')
        .setRequired(false))
    // コマンドのデフォルト実行権限 (ロール管理権限を持つユーザーに表示)
    // .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    ,
  async execute(interaction) {
    if (!interaction.inGuild()) {
        await interaction.reply({ content: 'このコマンドはサーバー内でのみ使用できます。', ephemeral: true });
        return;
    }

    // 実行者の権限チェック
    const ownerId = interaction.guild.ownerId;
    const authorizedUserId = process.env.ADMIN;
    const userId = interaction.user.id;
    const issuerMember = interaction.member;

    const isOwner = userId === ownerId;
    const isEnvAdmin = userId === authorizedUserId;
    // ロール管理権限があるかどうかのチェックも追加（ADMINやオーナー以外の場合）
    const hasManageRolesPerm = issuerMember.permissions.has(PermissionFlagsBits.ManageRoles);

    if (!isOwner && !isEnvAdmin && !hasManageRolesPerm) {
      await interaction.reply({ content: 'ロールを作成・管理する権限がありません。', ephemeral: true });
      return;
    }
    
    // ボットがロール管理権限を持っているか確認
    const botMember = await interaction.guild.members.fetch(interaction.client.user.id);
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        await interaction.reply({ content: 'ボットにロールを管理する権限がありません。', ephemeral: true });
        return;
    }

    const roleName = interaction.options.getString('name');
    const roleColorInput = interaction.options.getString('color');
    const targetMember = interaction.options.getMember('user'); // 対象ユーザー (GuildMember or null)

    let colorToSet;
    if (roleColorInput.toUpperCase() === 'DEFAULT') {
      colorToSet = null; // Discord.jsではnullまたはundefinedでデフォルト色
    } else if (/^#[0-9A-F]{6}$/i.test(roleColorInput)) {
      colorToSet = roleColorInput; // ユーザーが直接HEXコードを入力した場合
    } else {
      // 選択肢から選ばれたが、万が一HEXでない場合 (通常はaddChoicesで防がれる)
      // ここでは選択肢がHEXであることを前提とする。もし 'RED' のような文字列なら解決処理が必要。
      colorToSet = roleColorInput; // addChoicesで設定したvalueをそのまま使う
    }
    
    // #000000 は Discord で透明（無色）として扱われるので、ほぼ黒にしたい場合は #000001 などを推奨
    if (colorToSet === '#000000') {
        colorToSet = '#000001';
    }


    // 同じ名前のロールが既に存在するかチェック
    const existingRole = interaction.guild.roles.cache.find((role) => role.name === roleName);
    if (existingRole) {
      await interaction.reply({
        content: `同じ名前のロール「${roleName}」が既に存在します。`,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const createdRole = await interaction.guild.roles.create({
        name: roleName,
        color: colorToSet, // ColorResolvable (例: '#FF0000', null, 'Red')
        reason: `コマンド /crole により ${interaction.user.tag} が作成`,
      });

      let replyMessage = `ロール <@&${createdRole.id}> (${createdRole.name}) を作成しました。\n`;

      if (targetMember) {
        // ボットのロールが作成したロールより上で、かつ対象メンバーのロールより高いか確認
        // (通常、ボットが作成したロールはボットの最高位ロールの直下に作られる)
        if (botMember.roles.highest.position <= createdRole.position) {
            replyMessage += `\n⚠️ ボットのロール階層が作成したロールより低いため、ユーザーへの付与は試みますが失敗する可能性があります。`;
        }
        if (targetMember.roles.highest.position >= botMember.roles.highest.position && targetMember.id !== ownerId) {
            replyMessage += `\n⚠️ 対象ユーザー (${targetMember.displayName}) のロールがボットより高いため、ロールを付与できません。`;
            // ロール付与を試みない
        } else {
            await targetMember.roles.add(createdRole);
            replyMessage += `ユーザー ${targetMember} に付与しました。`;
        }
      }

      await interaction.editReply({ content: replyMessage.trim() });

    } catch (error) {
      console.error('ロール作成/付与エラー:', error);
      let errorMessage = 'ロールの作成または付与中にエラーが発生しました。';
      if (error.code === 50013) { // Missing Permissions
        errorMessage = 'ボットの権限が不足しているため、ロールを操作できませんでした。ロール階層や「ロールの管理」権限を確認してください。';
      } else if (error.message.includes('Invalid Form Body')) {
        errorMessage = '指定されたロール名または色が不正です。ロール名は100文字以内です。';
      }
      await interaction.editReply({ content: errorMessage });
    }
  },
};