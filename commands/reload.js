const fs = require('node:fs');
const path = require('node:path');
const { SlashCommandBuilder } = require('discord.js');

const OWNER_ID = process.env.ADMIN;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reload')
    .setDescription('指定された、または全てのコマンドを再読み込みします（Bot再起動不要）。')
    // オプションで特定のコマンドを指定してリロードできるようにするのも良い拡張です
    // .addStringOption(option =>
    //   option.setName('command')
    //     .setDescription('再読み込みするコマンド名 (指定しない場合は全て)')
    //     .setRequired(false) // コメントアウトする場合、この行末のカンマは不要
    // ) // コメントアウトされたブロックの終わり
  , // data プロパティの値の定義が終わった後にカンマを置く
  async execute(interaction) {
    // 権限チェック
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({ content: '🚫 あなたにはこのコマンドを実行する権限がありません。', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const reloadedCommands = [];
    const failedCommands = [];

    const commandsPath = __dirname;
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      // reload.js 自体はリロード対象外
      if (file === 'reload.js' && filePath === require.resolve('./reload.js')) { // require.resolveの引数を修正
          continue;
      }

      try {
        delete require.cache[require.resolve(filePath)];
        const command = require(filePath);

        if ('data' in command && 'execute' in command) {
          interaction.client.commands.set(command.data.name, command);
          reloadedCommands.push(command.data.name);
        } else {
          console.warn(`[WARNING] コマンド ${filePath} には 'data' または 'execute' プロパティがありません。`);
          failedCommands.push(file);
        }
      } catch (error) {
        console.error(`[ERROR] コマンド ${filePath} のリロードに失敗しました:`, error);
        failedCommands.push(`${file} (エラー: ${error.message})`);
      }
    }

    try {
      const commandsToRegister = Array.from(interaction.client.commands.values()).map(cmd => cmd.data.toJSON());
      await interaction.client.application.commands.set(commandsToRegister);
      
      let replyMessage = `[SUCCESS] ${reloadedCommands.length} 個のコマンドが正常に再読み込みされました。\n`;
      replyMessage += `リロードされたコマンド: ${reloadedCommands.join(', ') || 'なし'}\n`;
      if (failedCommands.length > 0) {
        replyMessage += `[ERROR] ${failedCommands.length} 個のコマンドの再読み込みに失敗しました:\n`;
        replyMessage += `${failedCommands.join('\n')}`;
      }
      await interaction.editReply({ content: replyMessage });

    } catch (error) {
      console.error('[ERROR] Discordへのコマンド登録に失敗しました:', error);
      await interaction.editReply({ content: '[ERROR] コマンドの再読み込みには成功しましたが、Discordへの登録中にエラーが発生しました。' });
    }
  },
};