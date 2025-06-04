// discord.js から必要なビルダーとスタイルをインポート
const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, ActionRowBuilder, TextInputStyle, EmbedBuilder } = require('discord.js');
const { google } = require('googleapis');
require('dotenv').config();

// スプレッドシートIDと範囲 (変更なし)
const sheetId = '16Mf4f4lIyqvzxjx5Nj8zgvXXRyIZjGFtfQlNmjjzKig'; // あなたのスプレッドシートID
const listRange = 'シート1!A2:C'; // 一覧表示用の範囲
const appendRange = 'シート1!A:A'; // 追記操作の開始セル (A列の最終行の次から)

module.exports = {
  // SlashCommandBuilder のインポート元を discord.js に（大きな差はないが v14 標準）
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
    // interactionがGuild内からのものか確認 (GuildMemberしか使えない操作がある場合など)
    if (!interaction.inGuild()) {
        await interaction.reply({ content: 'このコマンドはサーバー内でのみ使用できます。', ephemeral: true });
        return;
    }

    const sheets = google.sheets({ version: 'v4', auth: process.env.SHEET_API_KEY }); // 環境変数名を .env ファイルと合わせる
    const action = interaction.options.getString('action');

    if (action === 'list') {
      await interaction.deferReply();

      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: listRange,
        });

        const rows = response.data.values;

        if (!rows || rows.length === 0) {
          const emptyEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('🗓 スケジュール一覧')
            .setDescription('📭 スケジュールは現在空です。');
          await interaction.editReply({ embeds: [emptyEmbed] });
          return;
        }

        // 日付でソート (YYYY-MM-DD 形式を前提)
        rows.sort((a, b) => {
            const dateA = new Date(a[2]);
            const dateB = new Date(b[2]);
            if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) { // 無効な日付は末尾へ
                return isNaN(dateA.getTime()) ? 1 : -1;
            }
            return dateA - dateB;
        });

        const embed = new EmbedBuilder()
          .setColor(0x0099FF)
          .setTitle('🗓 現在のスケジュール一覧')
          .setDescription(rows.length > 0 ? '締切が近い順に表示しています（一部）:' : 'データがありません。');

        // 説明文に最大文字数制限があるため、表示件数を制限するかページネーションを検討
        const fieldsToShow = rows.slice(0, 10); // 例: 直近10件
        fieldsToShow.forEach(([type, task, due]) => {
            embed.addFields({
                name: `📌 ${type}「${task}」`,
                value: `締切: ${due || '未定'}`,
                inline: false
            });
        });
        if (rows.length > 10) {
            embed.setFooter({text: `全 ${rows.length} 件中、${fieldsToShow.length} 件を表示しています。`});
        }


        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        console.error('Google Sheets API (get) error:', error);
        await interaction.editReply({ content: '❌ データの取得中にエラーが発生しました。APIキーやスプレッドシートID、範囲を確認してください。', ephemeral: true });
      }
    } else if (action === 'add') {
      // v14 ネイティブの ModalBuilder を使用
      const modal = new ModalBuilder()
        .setCustomId('scheduleAddModal')
        .setTitle('新しい予定を追加');

      const typeInput = new TextInputBuilder()
        .setCustomId('typeInput')
        .setLabel('予定の種別 (例: 宿題, 小テスト)')
        .setStyle(TextInputStyle.Short) // TextInputStyle Enum を使用
        .setPlaceholder('宿題')
        .setRequired(true);

      const taskInput = new TextInputBuilder()
        .setCustomId('taskInput')
        .setLabel('予定の内容 (例: 数学P.10-15)')
        .setStyle(TextInputStyle.Paragraph) // 長めの入力も考慮してParagraphに
        .setPlaceholder('数学P.10-15')
        .setRequired(true);

      const dueInput = new TextInputBuilder()
        .setCustomId('dueInput')
        .setLabel('期限 (例: 2025-06-05)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('YYYY-MM-DD または MM/DD 形式')
        .setMinLength(4) // MM/DDを考慮
        .setMaxLength(10)
        .setRequired(true);

      // 各 TextInputComponent を ActionRowBuilder でラップする必要がある
      const firstActionRow = new ActionRowBuilder().addComponents(typeInput);
      const secondActionRow = new ActionRowBuilder().addComponents(taskInput);
      const thirdActionRow = new ActionRowBuilder().addComponents(dueInput);

      modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);

      // モーダルを表示
      await interaction.showModal(modal);

      // モーダルの送信を待つ (タイムアウト: 5分)
      try {
        const filter = (i) => i.customId === 'scheduleAddModal' && i.user.id === interaction.user.id;
        const submitted = await interaction.awaitModalSubmit({ filter, time: 300_000 }); // 300秒 = 5分

        const type = submitted.fields.getTextInputValue('typeInput');
        const task = submitted.fields.getTextInputValue('taskInput');
        const due = submitted.fields.getTextInputValue('dueInput');

        // スプレッドシートに追記
        await sheets.spreadsheets.values.append({
          spreadsheetId: sheetId,
          range: appendRange, // A列から追記 (空いている行に自動的に追加)
          valueInputOption: 'USER_ENTERED', // ユーザーが入力したかのようにデータを解釈
          resource: {
            values: [[type, task, due]], // 2次元配列で値を指定
          },
        });

        await submitted.reply({ content: '✅ 予定をスプレッドシートに追加しました！', ephemeral: true });

      } catch (error) {
        // タイムアウトの場合、error.message に 'Collector received no interactions'などが含まれる
        if (error.message.includes('Collector received no interactions') || error.message.includes('time')) {
          console.log(`Modal (scheduleAddModal) for user ${interaction.user.tag} timed out.`);
          // タイムアウト時はユーザーに通知しないか、静かに失敗させる
        } else {
          console.error('Modal submission or Google Sheets API (append) error:', error);
          // submitted オブジェクトが存在し、まだ応答していなければエラーメッセージを送信
          if (interaction.channel) { // interactionがまだ有効か確認
            await interaction.followUp({ content: '❌ 予定の追加中にエラーが発生しました。入力内容やAPI設定を確認してください。', ephemeral: true }).catch(e => console.error("FollowUp Error:", e));
          }
        }
      }
    }
  },
};