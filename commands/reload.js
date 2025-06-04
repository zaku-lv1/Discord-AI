const fs = require('node:fs'); // 'node:' プレフィックスを推奨
const path = require('node:path'); // 'node:' プレフィックスを推奨
const { SlashCommandBuilder } = require('discord.js'); // discord.js から直接インポート

// 許可されたユーザーID (メインファイルで dotenv.config() が呼ばれている前提)
const OWNER_ID = process.env.ADMIN;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reload')
    .setDescription('指定された、または全てのコマンドを再読み込みします（Bot再起動不要）。')
    // オプションで特定のコマンドを指定してリロードできるようにするのも良い拡張です
    // .addStringOption(option =>
    //   option.setName('command')
    //     .setDescription('再読み込みするコマンド名 (指定しない場合は全て)')
    //     .setRequired(false)),
  async execute(interaction) {
    // 権限チェック
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({ content: '🚫 あなたにはこのコマンドを実行する権限がありません。', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const reloadedCommands = [];
    const failedCommands = [];

    // この reload.js が存在するディレクトリをコマンドフォルダとする
    const commandsPath = __dirname; // path.join は不要、__dirname は絶対パス
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      // reload.js 自体はリロード対象外
      if (file === 'reload.js' && filePath === require.resolve('./reload.js')) {
          continue;
      }

      try {
        // モジュールキャッシュから削除して再読み込み
        delete require.cache[require.resolve(filePath)];
        const command = require(filePath);

        if ('data' in command && 'execute' in command) {
          // client.commands (Collection) にコマンドを再セット
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

    // Discordに登録されているコマンドを更新 (全てのコマンドを再登録する形)
    // client.commands Collection から最新のコマンド定義を取得して登録
    try {
      const commandsToRegister = Array.from(interaction.client.commands.values()).map(cmd => cmd.data.toJSON());
      await interaction.client.application.commands.set(commandsToRegister);
      
      let replyMessage = `✅ ${reloadedCommands.length} 個のコマンドが正常に再読み込みされました。\n`;
      replyMessage += `リロードされたコマンド: ${reloadedCommands.join(', ') || 'なし'}\n`;
      if (failedCommands.length > 0) {
        replyMessage += `❌ ${failedCommands.length} 個のコマンドの再読み込みに失敗しました:\n`;
        replyMessage += `${failedCommands.join('\n')}`;
      }
      await interaction.editReply({ content: replyMessage });

    } catch (error) {
      console.error('[ERROR] Discordへのコマンド登録に失敗しました:', error);
      await interaction.editReply({ content: '❌ コマンドの再読み込みには成功しましたが、Discordへの登録中にエラーが発生しました。' });
    }
  },
};