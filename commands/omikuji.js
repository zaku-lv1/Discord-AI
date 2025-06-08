const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// =================================================================================
// Gemini AI の初期化
// =================================================================================
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });


module.exports = {
  data: new SlashCommandBuilder()
    .setName('omikuji')
    .setDescription('おみくじを引いて、神様からの一言アドバイスをもらいます。'),

  async execute(interaction) {
    // 応答を保留（defer）します。AIの応答に時間がかかる場合があるためです。
    await interaction.deferReply();

    // =================================================================================
    // おみくじのデータ定義
    // ★改善点: 結果、画像URL、重みをオブジェクトにまとめて管理しやすくしました。
    // 元のコードでは結果が6つ、重みが7つだったので「大凶」を追加して整合性をとりました。
    // =================================================================================
    const fortunes = [
      { name: "大吉", imageUrl: "https://i.ibb.co/CwD67y5/5.png", weight: 15 },
      { name: "中吉", imageUrl: "https://i.ibb.co/CP0P5n5/3.png", weight: 20 },
      { name: "小吉", imageUrl: "https://i.ibb.co/GRhTSHh/image.png", weight: 25 },
      { name: "吉", imageUrl: "https://i.ibb.co/TqnpK7Q/4.png", weight: 20 },
      { name: "末吉", imageUrl: "https://i.ibb.co/5rXXv7b/2.png", weight: 15 },
      { name: "凶", imageUrl: "https://i.ibb.co/W6y4YrN/1.png", weight: 10 },
    ];

    // --- 重み付け抽選ロジック ---
    const totalWeight = fortunes.reduce((sum, fortune) => sum + fortune.weight, 0);
    let randomValue = Math.random() * totalWeight;
    let selectedFortune;

    for (const fortune of fortunes) {
      if (randomValue < fortune.weight) {
        selectedFortune = fortune;
        break;
      }
      randomValue -= fortune.weight;
    }
    
    // 抽選結果が万が一決まらなかった場合の保険
    if (!selectedFortune) {
      selectedFortune = fortunes[fortunes.length - 1]; // 末尾の結果をデフォルトに
      console.error("おみくじ抽選ロジックでエラーが発生したため、デフォルト値を設定しました。");
    }


    // =================================================================================
    // Gemini Flash を使って一言メッセージを生成
    // =================================================================================
    let aiMessage = "AIからの助言は、またの機会に。"; // デフォルトメッセージ
    try {
      const prompt = `
あなたは日本の神社の経験豊富な神主です。
おみくじの結果が「${selectedFortune.name}」でした。
この結果にふさわしい、ありがたくて短い一言アドバイスを、一つだけ生成してください。

# ルール
- 30文字程度で、簡潔にしてください。
- 詩的で、少しユーモアのある表現を心がけてください。
- 前置きや挨拶、結果の繰り返し（「${selectedFortune.name}ですね」など）は一切不要です。
- アドバイスの文章そのものだけを出力してください。

# 例
結果が「大吉」の場合の出力例: 天高く馬肥ゆる秋、食べ過ぎには注意。
結果が「凶」の場合の出力例: 落とし穴は、忘れた頃にやってくる。`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      aiMessage = response.text().trim();

    } catch (error) {
      console.error("Gemini AIによるメッセージ生成に失敗しました:", error.message);
      // AIからのメッセージ生成に失敗しても、デフォルトメッセージを使って処理は続行します。
    }

    // =================================================================================
    // Embed を作成して結果を送信
    // =================================================================================
    const embed = new EmbedBuilder()
      .setTitle(`おみくじの結果は...【${selectedFortune.name}】！`)
      .setDescription(`**"${aiMessage}"**`) // AIからのメッセージを強調表示
      .setImage(selectedFortune.imageUrl)
      .setColor(Math.floor(Math.random() * 0xFFFFFF)) // ランダムな色を設定
      .setFooter({ text: `${interaction.user.username}さんの運勢` });

    // deferReplyした応答を編集して、最終的な結果を送信
    await interaction.editReply({ embeds: [embed] });
  }
};