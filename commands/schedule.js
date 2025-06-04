const { SlashCommandBuilder } = require('@discordjs/builders');
const { google } = require('googleapis');
require('dotenv').config();

const sheetId = '16Mf4f4lIyqvzxjx5Nj8zgvXXRyIZjGFtfQlNmjjzKig';
const range = 'シート1!A2:C';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('宿題や小テストの予定を確認・追加します')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('予定の種別（例: 宿題、小テスト）')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('task')
        .setDescription('予定の内容（例: 数学ワーク）')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('due')
        .setDescription('期限（例: 2025-06-05）')
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();

    const type = interaction.options.getString('type');
    const task = interaction.options.getString('task');
    const due = interaction.options.getString('due');

    const sheets = google.sheets({ version: 'v4', auth: process.env.sheet_api_key });

    if (type && task && due) {
      try {
        await sheets.spreadsheets.values.append({
          spreadsheetId: sheetId,
          range: range,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [[type, task, due]],
          },
        });

        await interaction.editReply(`✅ 新しい予定を追加しました:\n📌 **${type}**: ${task}（締切: ${due}）`);
      } catch (error) {
        console.error(error);
        await interaction.editReply('❌ 予定の追加中にエラーが発生しました。');
      }
      return;
    }

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: range,
      });

      const rows = response.data.values;

      if (!rows || rows.length === 0) {
        await interaction.editReply('📭 スケジュールが空です。');
        return;
      }

      const upcoming = rows.map(([type, task, due]) => {
        return `📌 **${type}**: ${task}（締切: ${due}）`;
      });

      await interaction.editReply({
        content: `🗓 **現在のスケジュール一覧**:\n\n${upcoming.join('\n')}`,
      });
    } catch (error) {
      console.error(error);
      await interaction.editReply('❌ データの取得中にエラーが発生しました。');
    }
  },
};
