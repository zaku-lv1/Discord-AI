const { google } = require('googleapis');
const { MessageActionRow, MessageButton, MessageEmbed } = require('discord.js');

// YouTube Data API v3の認証情報を指定する
const youtube = google.youtube({
  version: 'v3',
  auth: process.env.GEMINI_API_KEY, // ご自身のYouTube Data API v3のAPIキーに置き換えてください
});

module.exports = {
  data: {
    name: 'youtube',
    description: 'Youtubeの急上昇ランキングを表示します。',
  },
  async execute(interaction) {
    // 急上昇ランキングを取得する
    const response = await youtube.videos.list({
      part: 'snippet',
      chart: 'mostPopular',
      regionCode: 'JP',
      maxResults: 10,
    });

    const videos = response.data.items;

    const embed = createEmbed(videos[0], 1);
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
        currentIndex = videos.length - 1;
      } else if (currentIndex >= videos.length) {
        currentIndex = 0;
      }

      const newEmbed = createEmbed(videos[currentIndex], currentIndex + 1);
      await interaction.update({ embeds: [newEmbed] });
    });

    collector.on('end', () => {
      row.components.forEach((component) => component.setDisabled(true));
      interaction.editReply({ components: [row] });
    });
  },
};

function createEmbed(video, rank) {
  const embed = new MessageEmbed()
    .setTitle(`急上昇ランキング ${rank}位`)
    .setURL(`https://www.youtube.com/watch?v=${video.id}`)
    .setDescription(video.snippet.title)
    .setImage(video.snippet.thumbnails.high.url)
    .setFooter(video.snippet.channelTitle, video.snippet.channelThumbnail);

  return embed;
}
