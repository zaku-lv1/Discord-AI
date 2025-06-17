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
      { name: "大吉", imageUrl: "https://i.imgur.com/IIatUFN.png", weight: 15 },
      { name: "中吉", imageUrl: "https://i.imgur.com/eG581X3.png", weight: 20 },
      { name: "小吉", imageUrl: "https://i.imgur.com/ynGiAM7.png", weight: 25 },
      { name: "吉", imageUrl: "https://i.imgur.com/TFPScYW.png", weight: 20 },
      { name: "末吉", imageUrl: "https://i.imgur.com/4WITf7Q.png", weight: 15 },
      { name: "凶", imageUrl: "https://i.imgur.com/pAUIGeM.png", weight: 10 },
      { name: "大凶", imageUrl: "https://i.imgur.com/Wvh3mdz.png", weight: 5 },
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
あなたは野獣先輩を祀る神社の経験豊富な神主です。
おみくじの結果が「${selectedFortune.name}」でした。
この結果にふさわしい、ありがたくて短い一言アドバイスを、一つだけ生成してください。

# ルール
- 30文字程度で、簡潔にしてください。
- 野獣先輩や淫夢厨の発言を元作ってください。(例のように、淫夢語録を織り交ぜること。)
- 前置きや挨拶、結果の繰り返し（「${selectedFortune.name}ですね」など）は一切不要です。
- アドバイスの文章そのものだけを出力してください。
- 淫夢語録は「」で囲ってください。
- 「淫夢語録」+考えたありがたい言葉
- 「やりますねぇ」は大吉限定。

# 例
- 「お前のことが好きだったんだよ！」 思いがけない幸運が訪れる。待ち人、来ますねぇ！
- 「ああ＾～いいっすね～」 何をやってもうまくいく絶頂の一日。願い事も叶う。
- 「やりますねぇ！」 努力が認められる時。ただし油断は（アカン）。
- 「まずうちさぁ、寄ってかない？」 良い出会いや新しい発見がありそう。
- 「アイスティーしかなかったけどいいかな」 ささやかな幸せに満たされる一日。高望みは禁物。
- 「しょうがねぇなぁ。」 少し苦労するが、助けが現れ、最終的には解決する。
- 「24歳、学生です。」 初心に帰ることで道が開ける。学びが鍵。
- 「アツゥイ！」 人間関係のトラブルや火の元に要注意。冷静になろう。
- 「ファッ！？」 すべてが水の泡になる可能性。もう眠るしかない。
- 「どうしてくれんのこれ。」 四面楚歌。誰も助けてくれない。しばらくは我慢。
- 「暴れんなよ…暴れんな…」 ここで冷静さを欠いてはならない。落ち着いて掴み取れ。
- 「こ↑こ↓」 探していた答えは、案外すぐ近くにある暗示。「ここだ！」という閃きを信じろ。
- 「いいよこいよ！」 どんな幸運もドンと来い。来るもの全てがあなたの力になる最高の一日。

# 淫夢語録
- ｱｰｲｷｿ
- 24歳、学生です。
- あーソレいいよ
- アイスティーしかなかったんだけどいいかな	
- 頭にきますよ!!
- 暴れんなよ…暴れんなよ…
- ありますあります
- 114514
- イキスギィ!
- 痛いですね…これは痛い
- オォン!アォン!
- お前の事が好きだったんだよ!
- こ↑こ↓
- はっきりわかんだね
- ファッ!?
- 810
- やりますねぇ!
- ンアッー!	
- まずいですよ!
- いいゾ～これ
- そうだよ(便乗)
- 見たけりゃ見せてやるよ
- アッー!
- 最後が気持ちよかった(小並感)
- ま、多少はね？
`;

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