const { SlashCommandBuilder, EmbedBuilder } = require('discord.js'); // EmbedBuilder をインポート

module.exports = {
  // SlashCommandBuilder を使用してコマンド情報を定義
  data: new SlashCommandBuilder()
    .setName('omikuji')
    .setDescription('おみくじを引くことができます。'),
  async execute(interaction) {
    const results = [ // 結果の画像URL
      "https://i.ibb.co/CwD67y5/5.png",  // 例: 大吉
      "https://i.ibb.co/TqnpK7Q/4.png",  // 例: 中吉
      "https://i.ibb.co/CP0P5n5/3.png",  // 例: 小吉
      "https://i.ibb.co/GRhTSHh/image.png",// 例: 吉
      "https://i.ibb.co/5rXXv7b/2.png",  // 例: 末吉
      "https://i.ibb.co/W6y4YrN/1.png",  // 例: 凶
      "https://i.ibb.co/bBdQH47/image.png" // 例: 大凶 (URLが吉と同じなので注意)
    ];
    // 各結果の重み (合計が100でなくても良い)
    const weights = [15, 25, 20, 20, 15, 10, 5]; // 大吉, 中吉, 小吉, 吉, 末吉, 凶, 大凶 の順に対応想定

    // 重み付け抽選ロジック (変更なし)
    let totalWeight = 0;
    for (let i = 0; i < weights.length; i++) {
      totalWeight += weights[i];
    }

    let randomValue = Math.random() * totalWeight; // 0以上 totalWeight未満の乱数

    for (let i = 0; i < weights.length; i++) {
      if (randomValue < weights[i]) {
        const selectedImageUrl = results[i];

        // EmbedBuilder を使用して画像を表示
        const embed = new EmbedBuilder()
          .setTitle('おみくじの結果！')
          .setImage(selectedImageUrl)
          .setColor(Math.floor(Math.random() * 0xFFFFFF)); // ランダムな色を設定

        try {
          await interaction.reply({ embeds: [embed] });
        } catch (replyError) {
          console.error("おみくじの返信エラー:", replyError);
          // フォローアップで試みるか、別の方法で通知
          await interaction.followUp({ content: 'おみくじの結果表示に失敗しました。もう一度試してください。', ephemeral: true }).catch(console.error);
        }
        return;
      } else {
        randomValue -= weights[i];
      }
    }

    // この部分は通常到達しないはずだが、念のため
    console.error("おみくじ抽選ロジックエラー: 抽選結果が決定できませんでした。");
    try {
        await interaction.reply({ content: 'おみくじの抽選でエラーが発生しました。もう一度お試しください。', ephemeral: true });
    } catch(e) {
        console.error("フォールバックエラーメッセージ送信失敗:", e);
    }
  }
};