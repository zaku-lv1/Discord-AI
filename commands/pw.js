const fs = require('fs');

module.exports = {
  data: {
    name: 'pw',
    description: '禁止ワードの追加・削除を行います。',
    options: [
      {
        name: 'action',
        description: 'アクションを選択してください。',
        type: 'STRING',
        choices: [
          {
            name: '追加',
            value: 'add',
          },
          {
            name: '削除',
            value: 'remove',
          },
        ],
        required: true,
      },
      {
        name: 'word',
        description: '追加または削除する禁止ワード',
        type: 'STRING',
        required: true,
      },
    ],
  },
  async execute(interaction) {
    const action = interaction.options.getString('action');
    const word = interaction.options.getString('word');
    const guildId = interaction.guild.id;
    const prohibitedWordsFile = `./pwlist/${guildId}.json`;

    // ファイルが存在しない場合は空の配列を使用する
    const prohibitedWords = loadProhibitedWords(prohibitedWordsFile);

if (action === 'add') {
  // 禁止ワードを追加
  if (prohibitedWords.includes(word)) {
    await interaction.reply({
      content: `禁止ワード "${word}" は既に存在します。`,
      ephemeral: true,
    });
  } else {
    prohibitedWords.push(word);
    await interaction.reply({
      content: `禁止ワード "${word}" を追加しました。`,
      ephemeral: true,
    });
  }
} else if (action === 'remove') {
  // 禁止ワードを削除
  const index = prohibitedWords.indexOf(word);
  if (index !== -1) {
    prohibitedWords.splice(index, 1);
    await interaction.reply({
      content: `禁止ワード "${word}" を削除しました。`,
      ephemeral: true,
    });
  } else {
    await interaction.reply({
      content: `禁止ワード "${word}" は存在しません。`,
      ephemeral: true,
    });
  }
}

    // 禁止ワードリストを保存
    saveProhibitedWords(prohibitedWords, prohibitedWordsFile);
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

// 禁止ワードリストを保存する関数
function saveProhibitedWords(prohibitedWords, filePath) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(prohibitedWords));
  } catch (error) {
    console.error(`禁止ワードの保存中にエラーが発生しました: ${error}`);
  }
}
