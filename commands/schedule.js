// discord.js から必要なビルダーとスタイルをインポート
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js'); // ButtonBuilder, ButtonStyle は不要に
const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// スプレッドシートIDと範囲 (変更なし)
const sheetId = process.env.GOOGLE_SHEET_ID || '16Mf4f4lIyqvzxjx5Nj8zgvXXRyIZjGFtfQlNmjjzKig';
const listRange = 'シート1!A2:C';
const appendRange = 'シート1!A:A';

// Google Sheets API クライアントを取得するヘルパー関数 (変更なし)
async function getSheetsClient() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON environmental variable is not set.');
  }
  const serviceAccountCreds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON);
  const jwtClient = new JWT({
    email: serviceAccountCreds.client_email,
    key: serviceAccountCreds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth: jwtClient });
}

// Gemini API クライアントの初期化 (変更なし)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * ユーザー入力から予定情報を抽出するAI関数 (変更なし)
 * @param {string} userInput ユーザーが入力した予定に関するテキスト
 * @returns {Promise<object|null>} 抽出された予定情報 {type, task, due}、またはエラー時は null
 */
async function extractScheduleInfoWithAI(userInput) {
  const tryModels = ['gemini-1.5-flash', 'gemini-1.5-pro'];
  let lastError = null;

  const prompt = `
以下のユーザー入力を分析し、予定の「種別」「内容」「期限」を抽出してください。
結果は必ず以下のJSON形式の文字列で出力してください。他の説明や前置きは一切不要です。

{
  "type": "抽出した種別 (例: 宿題, 小テスト, 提出物, イベント 等。不明な場合は「未分類」)",
  "task": "抽出した具体的な内容",
  "due": "抽出した期限 (可能な限りYYYY-MM-DD形式、またはMM/DD形式、または具体的な日付表現。不明な場合は「不明」)"
}

ユーザー入力: "${userInput}"
`;

  for (const modelName of tryModels) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const jsonResponse = response.text().trim();

      if (jsonResponse.startsWith('{') && jsonResponse.endsWith('}')) {
        return JSON.parse(jsonResponse);
      } else {
        console.warn(`[${modelName} - ScheduleAI] AIがJSON形式でない応答を返しました: ${jsonResponse}`);
        lastError = new Error(`AI response was not valid JSON: ${jsonResponse}`);
        continue;
      }
    } catch (error) {
      console.warn(`[${modelName} - ScheduleAI] での情報抽出に失敗: ${error.message}`);
      lastError = error;
      if (error.message.includes('429') || error.message.includes('Quota') || error.message.includes('API key not valid')) {
        console.error(`[${modelName} - ScheduleAI] APIエラー。処理を中断します。: ${error.message}`);
        break;
      }
    }
  }
  console.error("全てのAIモデルでの情報抽出に失敗しました (ScheduleAI)。", lastError ? lastError.message : "不明なエラー");
  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('宿題や小テストの予定を管理します')
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('登録されている予定の一覧を表示します'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('AIを使って新しい予定を文章で追加します')
        .addStringOption(option =>
          option.setName('text')
            .setDescription('予定の内容を文章で入力 (例: 明日の数学の宿題 P10-15 提出は土曜日)')
            .setRequired(true))),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: 'このコマンドはサーバー内でのみ使用できます。', ephemeral: true });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    let sheets; // sheetsクライアントは必要な場合のみ初期化

    if (subcommand === 'list') {
      try {
        sheets = await getSheetsClient();
      } catch (authError) {
        console.error('Google API Authentication Error (List Subcommand):', authError);
        await interaction.reply({ content: '❌ Google APIへの認証に失敗しました。設定を確認してください。', ephemeral: true });
        return;
      }

      try {
        await interaction.deferReply(); // 通常の応答 (ephemeral ではない)
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: listRange,
        });
        const rows = response.data.values;

        if (rows && rows.length) {
          const embed = new EmbedBuilder()
            .setTitle('📅 予定一覧')
            .setColor(0x0099FF)
            .setDescription('現在登録されている予定は以下の通りです。')
            .setTimestamp();
          rows.forEach((row, index) => {
            const type = row[0] || 'N/A';
            const task = row[1] || 'N/A';
            const dueDate = row[2] || 'N/A';
            embed.addFields({
              name: `📝 ${type} (No.${index + 1})`,
              value: `**内容:** ${task}\n**期限:** ${dueDate}`,
              inline: false
            });
          });
          await interaction.editReply({ embeds: [embed] });
        } else {
          await interaction.editReply({ content: 'ℹ️ スプレッドシートに予定が見つかりませんでした。' });
        }
      } catch (error) {
        console.error('Error handling "list" subcommand or Google Sheets API (get):', error);
        let errorMessage = '❌ データの取得中にエラーが発生しました。';
        if (error.response && error.response.data && error.response.data.error && error.response.data.error.message) {
            errorMessage += `\n詳細: ${error.response.data.error.message}`;
        }
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: errorMessage, flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
        }
      }
    } else if (subcommand === 'add') {
      const userInput = interaction.options.getString('text');
      await interaction.deferReply({ ephemeral: true }); // AI処理とシート書き込みがあるので、まずは送信者のみに応答を遅延

      const scheduleData = await extractScheduleInfoWithAI(userInput);

      if (scheduleData && scheduleData.task) {
        const { type = '未分類', task, due = '不明' } = scheduleData;

        try {
          sheets = await getSheetsClient();
        } catch (authError) {
          console.error('Google API Authentication Error (Add Subcommand):', authError);
          await interaction.editReply({ content: '❌ Google API認証に失敗しました。予定を登録できません。' });
          return;
        }

        try {
          await sheets.spreadsheets.values.append({
            spreadsheetId: sheetId,
            range: appendRange,
            valueInputOption: 'USER_ENTERED',
            resource: {
              values: [[type, task, due]],
            },
          });
          await interaction.editReply({ content: `✅ 予定をスプレッドシートに追加しました！\n種別: ${type}\n内容: ${task}\n期限: ${due}` });
        } catch (sheetError) {
          console.error('Google Sheets API (append) error:', sheetError);
          await interaction.editReply({ content: '❌ スプレッドシートへの予定追加中にエラーが発生しました。' });
        }
      } else {
        await interaction.editReply({ content: '❌ AIが予定情報をうまく抽出できませんでした。もう少し具体的に入力してみてください。\n例: 「種別は宿題、内容は国語の教科書P20、期限は来週の月曜日」' });
      }
    }
  },
};