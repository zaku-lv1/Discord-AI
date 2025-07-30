const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('test-ping')
    .setDescription('ボットの動作確認用テストコマンド'),
  async execute(interaction) {
    try {
      console.log(`[TEST-PING] ${interaction.user.username} がtest-pingコマンドを実行しました`);
      
      await interaction.reply({
        content: '🤖 ボットは正常に動作しています！\n' +
                 '✅ コマンド受信: OK\n' +
                 '✅ 応答送信: OK\n' +
                 '⏰ 応答時間: ' + Date.now() + 'ms',
        ephemeral: true
      });
      
      console.log(`[TEST-PING] test-pingコマンドが正常に実行されました`);
    } catch (error) {
      console.error(`[TEST-PING] エラー:`, error);
      
      const errorMessage = {
        content: '❌ テストコマンドの実行中にエラーが発生しました: ' + error.message,
        ephemeral: true
      };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  },
};