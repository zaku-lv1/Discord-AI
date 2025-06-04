// discord.js から必要なビルダーとスタイルをインポート
const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, ActionRowBuilder, TextInputStyle, EmbedBuilder } = require('discord.js');
const { google } = require('googleapis');
const { JWT } = require('google-auth-library'); // JWTクライアントをインポート
require('dotenv').config();

// スプレッドシートIDと範囲 (変更なし)
const sheetId = '16Mf4f4lIyqvzxjx5Nj8zgvXXRyIZjGFtfQlNmjjzKig'; // あなたのスプレッドシートID
const listRange = 'シート1!A2:C'; // 一覧表示用の範囲
const appendRange = 'シート1!A:A'; // 追記操作の開始セル (A列の最終行の次から)

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
    if (!interaction.inGuild()) {
        await interaction.reply({ content: 'このコマンドはサーバー内でのみ使用できます。', ephemeral: true });
        return;
    }

    let sheets;
    try {
        // 環境変数からサービスアカウントのJSON認証情報を文字列として取得し、パース
        // 例: GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON という名前の環境変数にJSON文字列全体を格納
        if (!process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON) {
            throw new Error('GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON environmental variable is not set.');
        }
        const serviceAccountCreds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON);

        // JWTクライアントのインスタンスを作成
        const jwtClient = new JWT({
            email: serviceAccountCreds.client_email,
            key: serviceAccountCreds.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'], // 必要なスコープを指定
        });

        // JWTクライアントで認証 (authorizeを呼び出すことで、リクエスト時に自動的にトークンがリフレッシュされます)
        // await jwtClient.authorize(); // 最初の呼び出しで認証が行われるため、明示的な authorize は必須ではない場合もあります。

        sheets = google.sheets({ version: 'v4', auth: jwtClient });

    } catch (authError) {
        console.error('Google API Authentication Error:', authError);
        await interaction.reply({ content: '❌ Google APIへの認証に失敗しました。設定を確認してください。', ephemeral: true });
        return;
    }

    const action = interaction.options.getString('action');

    if (action === 'list') {
      await interaction.deferReply();
      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: listRange,
        });
        // ... (以降の list アクションのロジックはほぼ同じ)
        // エラーメッセージを修正する可能性:
        // await interaction.editReply({ content: '❌ データの取得中にエラーが発生しました。API設定やスプレッドシートの共有設定、範囲を確認してください。', ephemeral: true });
      } catch (error) {
        console.error('Google Sheets API (get) error:', error);
        await interaction.editReply({ content: '❌ データの取得中にエラーが発生しました。API設定やスプレッドシートの共有設定、範囲を確認してください。', ephemeral: true });
      }
    } else if (action === 'add') {
      // ... (モーダルの定義は同じ)
      const modal = new ModalBuilder()
        .setCustomId('scheduleAddModal')
        .setTitle('新しい予定を追加');

      const typeInput = new TextInputBuilder()
        .setCustomId('typeInput')
        .setLabel('予定の種別 (例: 宿題, 小テスト)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('宿題')
        .setRequired(true);

      const taskInput = new TextInputBuilder()
        .setCustomId('taskInput')
        .setLabel('予定の内容 (例: 数学P.10-15)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('数学P.10-15')
        .setRequired(true);

      const dueInput = new TextInputBuilder()
        .setCustomId('dueInput')
        .setLabel('期限 (例: 2025-06-05)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('YYYY-MM-DD または MM/DD 形式')
        .setMinLength(4)
        .setMaxLength(10)
        .setRequired(true);

      const firstActionRow = new ActionRowBuilder().addComponents(typeInput);
      const secondActionRow = new ActionRowBuilder().addComponents(taskInput);
      const thirdActionRow = new ActionRowBuilder().addComponents(dueInput);

      modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);
      await interaction.showModal(modal);

      try {
        const filter = (i) => i.customId === 'scheduleAddModal' && i.user.id === interaction.user.id;
        const submitted = await interaction.awaitModalSubmit({ filter, time: 300_000 });

        const type = submitted.fields.getTextInputValue('typeInput');
        const task = submitted.fields.getTextInputValue('taskInput');
        const due = submitted.fields.getTextInputValue('dueInput');

        await sheets.spreadsheets.values.append({
          spreadsheetId: sheetId,
          range: appendRange,
          valueInputOption: 'USER_ENTERED',
          resource: {
            values: [[type, task, due]],
          },
        });

        await submitted.reply({ content: '✅ 予定をスプレッドシートに追加しました！', ephemeral: true });

      } catch (error) {
        if (error.message.includes('Collector received no interactions') || error.message.includes('time')) {
          console.log(`Modal (scheduleAddModal) for user ${interaction.user.tag} timed out.`);
        } else {
          console.error('Modal submission or Google Sheets API (append) error:', error);
          // エラーメッセージを修正
          if (interaction.channel) {
            await interaction.followUp({ content: '❌ 予定の追加中にエラーが発生しました。入力内容やAPI設定、スプレッドシートの共有設定を確認してください。', ephemeral: true }).catch(e => console.error("FollowUp Error:", e));
          }
        }
      }
    }
  },
};