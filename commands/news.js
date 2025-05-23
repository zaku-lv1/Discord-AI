const axios = require('axios');
const { MessageActionRow, MessageButton } = require('discord.js');

module.exports = {
  data: {
    name: 'news',
    description: '最新のニュースを表示します。',
  },
  async execute(interaction) {
    const response = await axios.get('https://www3.nhk.or.jp/news/easy/news-list.json');
    const articles = response.data[0][Object.keys(response.data[0])[0]];

    const embed = createEmbed(articles[0]);
    let currentIndex = 0;

    const row = new MessageActionRow()
      .addComponents(
        new MessageButton()
          .setCustomId('previous')
          .setLabel('前へ')
          .setStyle('PRIMARY'),
        new MessageButton()
          .setCustomId('next')
          .setLabel('次へ')
          .setStyle('PRIMARY')
      );

    await interaction.reply({ embeds: [embed], components: [row] });

    const filter = (interaction) =>
      interaction.isButton() && interaction.user.id === interaction.user.id;

    const collector = interaction.channel.createMessageComponentCollector({ filter });

    collector.on('collect', async (interaction) => {
      if (interaction.customId === 'previous') {
        currentIndex--;
      } else if (interaction.customId === 'next') {
        currentIndex++;
      }

      if (currentIndex < 0) {
        currentIndex = articles.length - 1;
      } else if (currentIndex >= articles.length) {
        currentIndex = 0;
      }

      const newEmbed = createEmbed(articles[currentIndex]);
      await interaction.update({ embeds: [newEmbed] });
    });

    collector.on('end', () => {
      row.components.forEach((component) => component.setDisabled(true));
      interaction.editReply({ components: [row] });
    });
  },
};

function createEmbed(article) {
  const rubyRemoved = article.title_with_ruby ? article.title_with_ruby.replace(/<ruby>|<\/ruby>/g, '') : '情報なし';
  const converted = rubyRemoved ? rubyRemoved.replace(/<rt>|<\/rt>/g, (match) => (match === '<rt>' ? '(' : ')')) : '情報なし';

  const embed = {
    title: article.title,
    url: `https://www3.nhk.or.jp/news/easy/${article.news_id}/${article.news_id}.html`,
    description: `**${article.news_prearranged_time || '情報なし'}**\n\n${converted}`,
  };

  if (article.news_image) {
    embed.thumbnail = { url: article.news_image.url };
  }

  if (article.news_web_image_uri) {
    embed.image = { url: article.news_web_image_uri };
  }

  return embed;
}
