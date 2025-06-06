const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Parser = require('rss-parser');
const parser = new Parser();

/**
 * Google Newsの記事データからEmbedを生成する関数
 * @param {object} article - rss-parserがパースした記事オブジェクト (item)
 * @returns {EmbedBuilder}
 */
function createEmbed(article) {
  const embed = new EmbedBuilder()
    .setTitle(article.title || 'タイトルなし')
    .setURL(article.link)
    .setDescription(`**公開日時: ${new Date(article.pubDate).toLocaleString('ja-JP')}**\n\n${article.contentSnippet || '内容の要約なし'}`)
    .setColor(0x4285F4)
    .setFooter({ text: article.creator || 'Google News' });

  const imageMatch = article.content ? article.content.match(/<img src="([^"]+)"/) : null;
  if (imageMatch && imageMatch[1]) {
    embed.setImage(imageMatch[1]);
  }

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('news')
    .setDescription('Google Newsの最新ニュースを表示します。'),
  async execute(interaction) {
    await interaction.deferReply();

    try {
      const feed = await parser.parseURL('https://news.google.com/rss?hl=ja&gl=JP&ceid=JP:ja');
      const articles = feed.items;

      if (!articles || articles.length === 0) {
        await interaction.editReply('最新のニュースが見つかりませんでした。');
        return;
      }

      let currentIndex = 0;
      const embed = createEmbed(articles[currentIndex]);

      const updateButtons = (index, total) => {
        return new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('news_previous')
              .setLabel('前へ')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(index === 0),
            new ButtonBuilder()
              .setCustomId('news_next')
              .setLabel('次へ')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(index === total - 1)
          );
      };

      const row = updateButtons(currentIndex, articles.length);
      const message = await interaction.editReply({ embeds: [embed], components: [row] });

      // ★★★ ここを修正しました ★★★
      const filter = (i) => {
        // i.isButtonComponent() は存在しないため、i.isButton() に修正します。
        if (!i.isButton()) return false;
        
        if (i.user.id !== interaction.user.id) {
          i.reply({ content: 'このボタンはコマンドの実行者のみ操作できます。', ephemeral: true });
          return false;
        }
        return i.customId === 'news_previous' || i.customId === 'news_next';
      };

      const collector = message.createMessageComponentCollector({ filter, time: 300000 }); // 5分

      collector.on('collect', async (i) => {
        if (i.customId === 'news_previous') {
          currentIndex--;
        } else if (i.customId === 'news_next') {
          currentIndex++;
        }

        if (currentIndex < 0) currentIndex = 0;
        if (currentIndex >= articles.length) currentIndex = articles.length - 1;

        const newEmbed = createEmbed(articles[currentIndex]);
        const newRow = updateButtons(currentIndex, articles.length);
        try {
          await i.update({ embeds: [newEmbed], components: [newRow] });
        } catch (updateError) {
          console.error("Failed to update news interaction:", updateError);
        }
      });

      collector.on('end', () => {
        const disabledRow = new ActionRowBuilder()
          .addComponents(
            ButtonBuilder.from(row.components[0]).setDisabled(true),
            ButtonBuilder.from(row.components[1]).setDisabled(true)
          );
        interaction.editReply({ components: [disabledRow] }).catch(console.error);
      });

    } catch (error) {
      console.error('Google News取得または処理エラー:', error);
      await interaction.editReply({ content: 'ニュースの取得中にエラーが発生しました。しばらくしてから再度お試しください。' });
    }
  },
};