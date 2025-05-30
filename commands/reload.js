// commands/reload.js
const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder } = require('@discordjs/builders');

// 許可されたユーザーID
const OWNER_ID = '1316250671401668710';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reload')
    .setDescription('コマンドを再読み込みします（Bot再起動不要）'),

  async execute(interaction) {
    // 権限チェック
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({ content: '🚫 あなたにはこのコマンドを実行する権限がありません。', ephemeral: true });
    }

    const commandsPath = path.join(__dirname);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') && file !== 'reload.js');

    const commands = [];

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      delete require.cache[require.resolve(filePath)]; // モジュールキャッシュ削除
      const command = require(filePath);

      if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        interaction.client.commands.set(command.data.name, command); // クライアントのコマンドマップに登録
      } else {
        console.warn(`[WARNING] ${filePath} は正しいコマンド構造ではありません。`);
      }
    }

    // Discordのアプリケーションコマンドに再登録
    await interaction.client.application.commands.set(commands);

    // 実行者のみに通知
    await interaction.reply({
      content: '✅ コマンドが再読み込みされました！',
      ephemeral: true,
    });
  },
};
