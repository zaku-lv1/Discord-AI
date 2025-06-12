const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

let jpStockMap = new Map();

async function fetchJapaneseStockList() {
  const url = 'https://stooq.com/t/?i=513';
  const res = await fetch(url);
  const html = await res.text();
  const $ = cheerio.load(html);
  $('table tr').each((i, row) => {
    const cells = $(row).find('td');
    if (cells.length >= 2) {
      const code = $(cells[0]).text().trim().replace('.JP', '');
      const name = $(cells[1]).text().trim();
      if (code && name) {
        jpStockMap.set(name, code);
      }
    }
  });
}

async function fetchStockData(code) {
  const url = `https://stooq.com/q/?s=${code}.jp&f=sd2t2ohlcvn`;
  const res = await fetch(url);
  const text = await res.text();
  const lines = text.trim().split('\n');
  if (lines.length < 2) return null;
  const [_, dataLine] = lines;
  const [symbol, date, time, open, high, low, close, volume, name] = dataLine.split(',');
  return { name, symbol, date, time, open, high, low, close, volume };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stock')
    .setDescription('日本語の会社名から株価とチャートを確認します。')
    .addStringOption(option =>
      option.setName('company')
        .setDescription('会社名を日本語で入力（例: 任天堂）')
        .setRequired(true)
    ),

  async execute(interaction) {
    const input = interaction.options.getString('company').trim();

    try {
      // 先にdeferReplyしてタイムアウトを防ぐ
      await interaction.deferReply();

      if (jpStockMap.size === 0) {
        await fetchJapaneseStockList();
      }

      const foundEntry = [...jpStockMap.entries()].find(([name]) =>
        name.toLowerCase().includes(input.toLowerCase())
      );

      if (!foundEntry) {
        await interaction.editReply({ content: `「${input}」という企業が見つかりませんでした。` });
        return;
      }

      const [matchedName, code] = foundEntry;
      const data = await fetchStockData(code);

      if (!data) {
        await interaction.editReply({ content: `「${matchedName}（${code}）」の株価情報を取得できませんでした。` });
        return;
      }

      const chartUrl = `https://stooq.com/c/?s=${code}.jp&c=5m&t=c&a=lg`;
      const embed = new EmbedBuilder()
        .setTitle(`${data.name} (${data.symbol}.JP) の株価情報`)
        .setURL(`https://stooq.com/q/?s=${code}.jp`)
        .addFields(
          { name: '終値', value: `${data.close} 円`, inline: true },
          { name: '高値', value: `${data.high} 円`, inline: true },
          { name: '安値', value: `${data.low} 円`, inline: true },
          { name: '日付', value: `${data.date}`, inline: true },
          { name: '出来高', value: `${data.volume}`, inline: true }
        )
        .setImage(chartUrl)
        .setColor(0x0099ff)
        .setFooter({ text: `Powered by Stooq.com` });

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('[STOCK_CMD_ERROR]', error);
      // すでにdeferReply済みなのでeditReplyでエラー通知
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: '株価情報の取得中にエラーが発生しました。',
        });
      }
    }
  }
};