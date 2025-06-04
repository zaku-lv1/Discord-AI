const axios = require('axios');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js'); // EmbedBuilder をインポート

module.exports = {
  // SlashCommandBuilder を使用してコマンド情報を定義
  data: new SlashCommandBuilder()
    .setName('wiki')
    .setDescription('Wikipediaから情報を取得します。')
    .addStringOption(option => // 文字列型のオプションを追加
      option.setName('query')
        .setDescription('検索するキーワード')
        .setRequired(true)), // 必須オプションに設定
  async execute(interaction) {
    // オプションの値を取得 (v13 と同様)
    const query = interaction.options.getString('query');

    try {
      // APIリクエスト前に応答を遅延させる (Wikipedia APIの応答速度による)
      await interaction.deferReply();

      const response = await axios.get(`https://ja.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&exintro=true&explaintext=true&titles=${encodeURIComponent(query)}`);
      const pages = response.data.query.pages;
      const pageId = Object.keys(pages)[0]; // 最初にヒットしたページのIDを取得

      // ページが存在しないか、エラーページ(-1)の場合
      if (pageId === "-1" || !pages[pageId] || !pages[pageId].extract) {
        await interaction.editReply({ // deferReply後はeditReplyで応答
          content: '該当する情報が見つかりませんでした。別のキーワードでお試しください。',
          ephemeral: true,
        });
        return;
      }

      const page = pages[pageId];
      const extract = page.extract;

      // EmbedBuilder を使用してEmbedを構築
      const embed = new EmbedBuilder()
        .setTitle(page.title)
        .setURL(`https://ja.wikipedia.org/wiki/${encodeURIComponent(page.title)}`)
        .setDescription(extract.length > 4096 ? extract.substring(0, 4093) + '...' : extract) // DiscordのEmbed説明文の文字数制限に対応
        .setColor(0x0099FF) // 適当な色を設定 (例: 青)
        .setFooter({ text: '出典: Wikipedia' });

      await interaction.editReply({ // deferReply後はeditReplyで応答
        embeds: [embed],
      });

    } catch (error) {
      console.error('Wikipediaコマンドエラー:', error);
      // interactionが既に返信済みか、遅延されているかを確認
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: '情報の取得中にエラーが発生しました。しばらくしてから再度お試しください。',
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: '情報の取得中にエラーが発生しました。しばらくしてから再度お試しください。',
          ephemeral: true,
        });
      }
    }
  },
};