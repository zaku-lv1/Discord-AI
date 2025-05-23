const axios = require('axios');

module.exports = {
  data: {
    name: 'wiki',
    description: 'Wikipediaから情報を取得します。',
    options: [
      {
        name: 'query',
        description: '検索するキーワード',
        type: 'STRING',
        required: true,
      },
    ],
  },
  async execute(interaction) {
    const query = interaction.options.getString('query');

    try {
      const response = await axios.get(`https://ja.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&exintro=true&explaintext=true&titles=${encodeURIComponent(query)}`);
      const pageId = Object.keys(response.data.query.pages)[0];
      const page = response.data.query.pages[pageId];
      const extract = page.extract;

      if (extract) {
        await interaction.reply({
          embeds: [{
            title: page.title,
            description: extract,
            url: `https://ja.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
          }],
        });
      } else {
        await interaction.reply({
          content: '該当する情報が見つかりませんでした。',
          ephemeral: true,
        });
      }
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: '情報の取得中にエラーが発生しました。',
        ephemeral: true,
      });
    }
  },
};
