const { SlashCommandBuilder } = require('@discordjs/builders');
const { Modal, TextInputComponent, showModal } = require('discord-modals');
const { google } = require('googleapis');
require('dotenv').config();

const sheetId = '16Mf4f4lIyqvzxjx5Nj8zgvXXRyIZjGFtfQlNmjjzKig';
const range = 'シート1!A2:C';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('宿題や小テストの予定を確認・追加します')
    .addStringOption(option =>
      option
        .setName('action')
        .setDescription('操作を選択してください')
        .setRequired(true)
        .addChoices(
          { name: '一覧表示', value: 'list' },
          { name: '予定を追加', value: 'add' },
        )
    ),

  async execute(interaction) {
    const sheets = google.sheets({ version: 'v4', auth: process.env.sheet_api_key });
    const action = interaction.options.getString('action');

    if (action === 'list') {
      await interaction.deferReply();

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
    } else if (action === 'add') {
      const modal = new Modal()
        .setCustomId('scheduleAddModal')
        .setTitle('予定を追加')
        .addComponents(
          new TextInputComponent()
            .setCustomId('typeInput')
            .setLabel('予定の種別（宿題・小テスト・その他）')
            .setStyle('SHORT')
            .setPlaceholder('宿題')
            .setRequired(true),
          new TextInputComponent()
            .setCustomId('taskInput')
            .setLabel('予定の内容（例: 数学ワーク）')
            .setStyle('SHORT')
            .setPlaceholder('数学ワーク')
            .setRequired(true),
          new TextInputComponent()
            .setCustomId('dueInput')
            .setLabel('期限（例: 2025-06-05）')
            .setStyle('SHORT')
            .setPlaceholder('YYYY-MM-DD形式で入力')
            .setRequired(true),
        );

      showModal(modal, {
        client: interaction.client,
        interaction: interaction,
      });
    }
  },
};
