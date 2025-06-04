const axios = require('axios');
// discord.js から必要なビルダーとスタイルをインポート
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function createEmbed(article) {
  // タイトルのルビを括弧に変換する処理 (変更なし)
  const rubyRemoved = article.title_with_ruby ? article.title_with_ruby.replace(/<ruby>|<\/ruby>/g, '') : '情報なし';
  const convertedTitle = rubyRemoved ? rubyRemoved.replace(/<rt>|<\/rt>/g, (match) => (match === '<rt>' ? '(' : ')')) : (article.title || 'タイトル情報なし');

  const embed = new EmbedBuilder()
    .setTitle(article.title || 'タイトルなし')
    .setURL(`https://www3.nhk.or.jp/news/easy/${article.news_id}/${article.news_id}.html`)
    // description に加工したタイトルと本文の冒頭などを入れると良いかもしれません
    // ここでは元の description 構造を尊重しつつ、整形済みタイトルを使用
    .setDescription(`**公開時刻: ${article.news_prearranged_time || '不明'}**\n\n${convertedTitle}`)
    .setColor(0x00AE86); // 適当な色

  // NHK Easy NewsのJSONには記事本文の要約がないため、タイトルを説明文にも使用
  // もし本文も表示したい場合は、別途記事ページをスクレイピングするか、APIで取得する必要がある

  if (article.has_news_web_image && article.news_web_image_uri) {
    embed.setImage(article.news_web_image_uri);
  } else if (article.has_news_easy_image && article.news_easy_image_uri) {
    // web画像がない場合、easy画像を使用するなどのフォールバック
    embed.setImage(article.news_easy_image_uri);
  }
  
  // サムネイルは news_easy_ιά URI (gif)が適切かもしれない
  if (article.has_news_easy_movie && article.news_easy_image_uri) { // GIFサムネイルがある場合
    embed.setThumbnail(article.news_easy_image_uri);
  }


  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('news')
    .setDescription('NHK NEWS WEB EASYの最新ニュースを表示します。'),
  async execute(interaction) {
    await interaction.deferReply();

    try {
      const response = await axios.get('https://www3.nhk.or.jp/news/easy/news-list.json?date=' + new Date().toISOString().slice(0,10));
      // APIの構造が変わっている可能性を考慮し、より安全なアクセスを試みる
      const articlesByDate = response.data[0]; // 通常、最初の要素に日付ごとの記事リストがある
      const firstDateKey = Object.keys(articlesByDate)[0]; // 最新の日付のキー
      const articles = articlesByDate[firstDateKey];

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

      // コレクターのフィルターを修正
      const filter = (i) => {
        if (!i.isButtonComponent()) return false; // ButtonComponentであることを確認
        if (i.user.id !== interaction.user.id) {
          i.reply({ content: 'このボタンはコマンドの実行者のみ操作できます。', ephemeral: true });
          return false;
        }
        return i.customId === 'news_previous' || i.customId === 'news_next';
      };

      // タイムアウトは5分など適宜設定
      const collector = message.createMessageComponentCollector({ filter, time: 300000 }); // 5分

      collector.on('collect', async (i) => {
        if (i.customId === 'news_previous') {
          currentIndex--;
        } else if (i.customId === 'news_next') {
          currentIndex++;
        }

        // インデックスの境界チェック (変更なし)
        if (currentIndex < 0) {
          currentIndex = articles.length - 1;
        } else if (currentIndex >= articles.length) {
          currentIndex = 0;
        }

        const newEmbed = createEmbed(articles[currentIndex]);
        const newRow = updateButtons(currentIndex, articles.length);
        try {
            await i.update({ embeds: [newEmbed], components: [newRow] });
        } catch (updateError) {
            console.error("Failed to update news interaction:", updateError);
        }
      });

      collector.on('end', (collected, reason) => {
        // タイムアウトなどで終了した場合、ボタンを無効化する
        const disabledRow = new ActionRowBuilder()
          .addComponents(
            ButtonBuilder.from(row.components[0]).setDisabled(true),
            ButtonBuilder.from(row.components[1]).setDisabled(true)
          );
        interaction.editReply({ components: [disabledRow] }).catch(console.error);
      });

    } catch (error) {
      console.error('NHKニュース取得または処理エラー:', error);
      await interaction.editReply({ content: 'ニュースの取得中にエラーが発生しました。しばらくしてから再度お試しください。' });
    }
  },
};