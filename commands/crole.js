const { Permissions } = require('discord.js');

module.exports = {
  data: {
    name: 'crole',
    description: '指定した名前と色でロールを作成し、ユーザーに付与します。',
    options: [
      {
        type: 3,
        name: 'name',
        description: 'ロールの名前',
        required: true,
      },
      {
        type: 3,
        name: 'color',
        description: 'ロールの色',
        required: true,
        choices: [
          {
            name: 'デフォルト',
            value: 'DEFAULT',
          },
          {
            name: '黒',
            value: '#000000',
          },
          {
            name: '白',
            value: '#FFFFFF',
          },
          {
            name: '赤',
            value: '#FF0000',
          },
          {
            name: '青',
            value: '#0000FF',
          },
          // 他の色の選択肢を追加することができます
        ],
      },
      {
        type: 6,
        name: 'user',
        description: 'ロールを付与するユーザー',
        required: false,
      },
    ],
  },
  async execute(interaction) {
    const authorizedUser = process.env.ADMIN; // .envファイルのADMIN変数の値を取得
    const userId = interaction.user.id; // コマンドを実行したユーザーのIDを取得

    const isServerOwner = interaction.guild.ownerId === interaction.user.id;

    if (!isServerOwner && userId !== authorizedUser) {
      return interaction.reply({
        content: 'オーナーのみがこのコマンドを使用できます。',
        ephemeral: true,
      });
    }

    const { guild } = interaction;
    const roleName = interaction.options.getString('name');
    const roleColor = interaction.options.getString('color');
    const user = interaction.options.getMember('user');

    let colorValue;
    switch (roleColor) {
      case 'DEFAULT':
        colorValue = null;
        break;
      default:
        colorValue = roleColor.startsWith('#') ? roleColor : `#${roleColor}`;
        break;
    }

    // 同じ名前のロールが既に存在するかチェックする
    const existingRole = guild.roles.cache.find((role) => role.name === roleName);
    if (existingRole) {
      await interaction.reply({
        content: '同じ名前のロールが既に存在します。',
        ephemeral: true,
      });
      return;
    }

    try {
      const createdRole = await guild.roles.create({
        name: roleName,
        color: colorValue !== 'DEFAULT' ? colorValue.replace('#', '') : undefined,
      });

      if (user) {
        await user.roles.add(createdRole);
        await interaction.reply({
          content: `ロール <@&${createdRole.id}> を作成し、ユーザー ${user} に付与しました。`,
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: `ロール <@&${createdRole.id}> を作成しました。`,
          ephemeral: true,
        });
      }
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: 'ロールの作成中にエラーが発生しました。',
        ephemeral: true,
      });
    }
  },
};
