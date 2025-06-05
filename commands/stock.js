const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const cheerio = require('cheerio'); // npm install cheerio

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stock')
    .setDescription('指定した日本株の株価とチャートを表示します。')
    .addStringOption(option =>
      option.setName('code')
        .setDescription('証券コード（例: 7974）')
        .setRequired(true)
    ),
  
  async execute(interaction) {
    const code = interaction.options.getString('code').trim();
    const stockUrl = `https://stooq.com/q/?s=${code}.jp`;
    const chartUrl = `https://stooq.com/c/?s=${code}.jp&c=5m&t=c&a=lg&svg`;

    await interaction.deferReply();

    try {
      const res = await fetch(stockUrl);
      if (!res.ok) throw new Error('Stooqページの取得に失敗しました');

      const html = await res.text();
      const $ = cheerio.load(html);

      // 株価情報の取得（例：終値）
      const stockName = $('h2').first().text().trim();
      const priceText = $('td.fth:contains("終値")').next().text().trim() || '取得失敗';
      const changeText = $('td.fth:contains("変動")').next().text().trim() || '取得失敗';
      const timeText = $('td.fth:contains("日付")').next().text().trim() || '取得失敗';

      const embed = new EmbedBuilder()
        .setTitle(`${stockName} (${code}.JP)`)
        .setURL(stockUrl)
        .setDescription(`**終値**: ${priceText}\n**変動**: ${changeText}\n**日付**: ${timeText}`)
        .setImage(chartUrl)
        .setColor(0x00bfff)
        .setFooter({ text: 'データ提供: stooq.com' });

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('[ERROR] /stock コマンドエラー:', error);
      await interaction.editReply('株価の取得中にエラーが発生しました。証券コードが正しいか確認してください。');
    }
  }
};
