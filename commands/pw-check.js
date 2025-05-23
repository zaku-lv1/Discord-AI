const fs = require('fs');

const { MessageEmbed } = require('discord.js');

module.exports = {
  data: {
    name: 'pw-check',
    description: '禁止ワードリストを表示します。',
  },
  async execute(interaction) {
    const guildId = interaction.guild.id;
    const prohibitedWordsFile = `./pwlist/${guildId}.json`;

    // 禁止ワードをファイルから読み込む
    const prohibitedWords = loadProhibitedWords(prohibitedWordsFile);

    // メッセージを作成する
    const embed = new MessageEmbed()
      .setTitle('禁止ワードリスト')
      .setDescription(prohibitedWords.map(word => `\`${word}\``).join(', '));

    // メッセージを返信する
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// 禁止ワードのリストを読み込む関数
function loadProhibitedWords(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`禁止ワードの読み込み中にエラーが発生しました: ${error}`);
    return [];
  }
}
