const { google } = require('googleapis');
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// YouTube Data API v3の認証情報を指定する
const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY,
});

function createEmbed(video, rank, totalVideos) {
  const embed = new EmbedBuilder()
    .setColor(0xFF0000) // YouTubeの赤色など、適宜設定
    .setTitle(`${video.snippet.title}`)
    .setURL(`https://www.youtube.com/watch?v=${video.id}`)
    .setDescription(video.snippet.description ? video.snippet.description.substring(0, 150) + (video.snippet.description.length > 150 ? '...' : '') : '説明なし')
    .setImage(video.snippet.thumbnails.high.url)
    .addFields({ name: 'チャンネル', value: video.snippet.channelTitle, inline: true })
    .setTimestamp(new Date(video.snippet.publishedAt))
    .setFooter({ text: `急上昇ランキング ${rank}位 / ${totalVideos}件中` });

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('youtube')
    .setDescription('YouTubeの急上昇ランキングを表示します。'),
  async execute(interaction) {
    try {
      await interaction.deferReply(); // 応答に時間がかかる可能性があるのでdeferReply

      const response = await youtube.videos.list({
        part: 'snippet,contentDetails,statistics', // snippetに加えて詳細情報も取得すると良い
        chart: 'mostPopular',
        regionCode: 'JP',
        maxResults: 10, // 取得する動画の数 (最大50)
      });

      const videos = response.data.items;

      if (!videos || videos.length === 0) {
        await interaction.editReply('急上昇動画が見つかりませんでした。');
        return;
      }

      let currentIndex = 0;

      const embed = createEmbed(videos[currentIndex], currentIndex + 1, videos.length);

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('youtube_previous')
            .setLabel('前へ')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true), // 最初は「前へ」を無効化
          new ButtonBuilder()
            .setCustomId('youtube_next')
            .setLabel('次へ')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(videos.length <= 1) // 動画が1つなら「次へ」も無効化
        );

      const message = await interaction.editReply({ embeds: [embed], components: [row] });

      // フィルター: コマンド実行者からのボタン操作のみ受け付ける
      const filter = (i) => {
        // customIdのチェックも追加して、このコマンドのボタン操作であることを明確にする
        if (!i.isButton() || (i.customId !== 'youtube_previous' && i.customId !== 'youtube_next')) {
          return false;
        }
        if (i.user.id !== interaction.user.id) {
          i.reply({ content: 'このボタンはコマンドの実行者のみ操作できます。', ephemeral: true });
          return false;
        }
        return true;
      };

      // タイムアウトは1分 (60000ミリ秒) など適宜設定
      const collector = message.createMessageComponentCollector({ filter, time: 120000 }); // 2分間

      collector.on('collect', async (i) => {
        if (i.customId === 'youtube_previous') {
          currentIndex--;
        } else if (i.customId === 'youtube_next') {
          currentIndex++;
        }

        // currentIndexの範囲チェックは不要 (ボタンのdisabled状態で制御するため)
        // が、念のため残すか、ボタンのdisabledを更新するロジックでカバー
        // if (currentIndex < 0) currentIndex = 0;
        // if (currentIndex >= videos.length) currentIndex = videos.length - 1;


        const newEmbed = createEmbed(videos[currentIndex], currentIndex + 1, videos.length);
        const newRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('youtube_previous')
              .setLabel('前へ')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(currentIndex === 0),
            new ButtonBuilder()
              .setCustomId('youtube_next')
              .setLabel('次へ')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(currentIndex === videos.length - 1)
          );
        try {
            await i.update({ embeds: [newEmbed], components: [newRow] });
        } catch (updateError){
            console.error("Failed to update interaction:", updateError);
        }
      });

      collector.on('end', (collected, reason) => {
        // タイムアウトなどで終了した場合、ボタンを無効化する
        const disabledRow = new ActionRowBuilder()
          .addComponents(
            ButtonBuilder.from(row.components[0]).setDisabled(true), // 既存のボタンから作成して無効化
            ButtonBuilder.from(row.components[1]).setDisabled(true)
          );
        interaction.editReply({ components: [disabledRow] }).catch(console.error); // エラー処理を追加
      });

    } catch (error) {
      console.error('YouTubeコマンドの実行中にエラーが発生しました:', error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: '動画情報の取得中にエラーが発生しました。APIキーやクォータを確認してください。', ephemeral: true });
      } else {
        await interaction.reply({ content: '動画情報の取得中にエラーが発生しました。APIキーやクォータを確認してください。', ephemeral: true });
      }
    }
  },
};