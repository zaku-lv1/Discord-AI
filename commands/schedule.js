// discord.js から必要なビルダーとスタイルをインポート
const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,         // 追加
  TextInputBuilder,     // 追加
  TextInputStyle        // 追加
} = require('discord.js');
const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
const { GoogleGenerativeAI } = require('@google/generative-ai'); //復活
require('dotenv').config();

// スプレッドシートIDと範囲
const sheetId = process.env.GOOGLE_SHEET_ID || '16Mf4f4lIyqvzxjx5Nj8zgvXXRyIZjGFtfQlNmjjzKig';
const listRange = 'シート1!A2:C';
const appendRange = 'シート1!A:A'; // 復活

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

// Gemini API クライアントの初期化 (復活)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * ユーザー入力から予定情報を抽出するAI関数 (復活、内容は変更なし)
 */
async function extractScheduleInfoWithAI(userInput) {
  const tryModels = ['gemini-1.5-flash', 'gemini-1.5-pro'];
  let lastError = null;

  const prompt = `
以下のユーザー入力を分析し、予定の「種別」「内容」「期限」を抽出してください。
種別の記述がない場合は「課題」「テスト」「その他」の中から考えて選んでください。
漢数字はすべて半角算用数字に書き換えること。内容が冗長にならないように気をつけること。
「明日」「明後日」は今日 (${new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit'})}) からの日付で期限を考えること。
結果は必ず以下のJSON形式の文字列で出力してください。他の説明や前置きは一切不要です。

{
  "type": "抽出した種別",
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
      const rawResponseText = response.text().trim();
      let jsonToParse = rawResponseText;

      if (jsonToParse.startsWith("```json")) {
        jsonToParse = jsonToParse.substring(7);
        if (jsonToParse.endsWith("```")) {
          jsonToParse = jsonToParse.substring(0, jsonToParse.length - 3);
        }
      } else if (jsonToParse.startsWith("```")) {
        jsonToParse = jsonToParse.substring(3);
        if (jsonToParse.endsWith("```")) {
          jsonToParse = jsonToParse.substring(0, jsonToParse.length - 3);
        }
      }
      jsonToParse = jsonToParse.trim();

      if (jsonToParse.startsWith('{') && jsonToParse.endsWith('}')) {
        try {
          return JSON.parse(jsonToParse);
        } catch (parseError) {
          console.warn(`[${modelName} - ScheduleAI] JSONのパースに失敗 (Markdown除去後): ${parseError.message}. 元の応答: ${rawResponseText}`);
          lastError = parseError;
          continue;
        }
      } else {
        console.warn(`[${modelName} - ScheduleAI] AIの応答がJSON形式ではありません (Markdown除去後): ${jsonToParse}. 元の応答: ${rawResponseText}`);
        lastError = new Error(`AI response was not valid JSON after stripping Markdown. Content: ${jsonToParse}`);
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


/**
 * 1件の予定情報を Embed に整形する関数 (変更なし)
 */
function createScheduleEmbed(scheduleItem, currentIndex, totalSchedules) {
  const type = scheduleItem[0] || 'N/A';
  const task = scheduleItem[1] || 'N/A';
  const dueDate = scheduleItem[2] || 'N/A';

  const embed = new EmbedBuilder()
    .setTitle(`📝 ${type} (${currentIndex + 1}/${totalSchedules})`)
    .setColor(0x0099FF)
    .addFields(
      { name: '内容', value: task, inline: false },
      { name: '期限', value: dueDate, inline: false }
    )
    .setTimestamp()
    .setFooter({ text: `予定 ${currentIndex + 1} / ${totalSchedules}` });
  return embed;
}

/**
 * ナビゲーションボタンと追加ボタンを作成・更新する関数
 */
function updateScheduleButtons(currentIndex, totalSchedules) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_previous')
        .setLabel('前の予定')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentIndex === 0),
      new ButtonBuilder()
        .setCustomId('schedule_next')
        .setLabel('次の予定')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentIndex >= totalSchedules - 1),
      new ButtonBuilder() // 「予定を追加」ボタンを追加
        .setCustomId('schedule_add_modal_trigger')
        .setLabel('予定を追加')
        .setStyle(ButtonStyle.Success)
    );
}


module.exports = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('登録されている予定をボタンで確認・追加します。'), // 説明を更新

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: 'このコマンドはサーバー内でのみ使用できます。', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply();
    let sheets;

    try {
      sheets = await getSheetsClient();
    } catch (authError) {
      console.error('Google API Authentication Error (Schedule View):', authError);
      await interaction.editReply({ content: '❌ Google APIへの認証に失敗しました。設定を確認してください。' });
      return;
    }

    let schedules = [];
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: listRange,
      });
      schedules = response.data.values || [];
    } catch (error) {
      console.error('Error fetching schedules from Google Sheets:', error);
      await interaction.editReply({ content: '❌ スプレッドシートからの予定の読み込みに失敗しました。' });
      return;
    }

    if (schedules.length === 0) {
      // 予定がない場合でも「追加」ボタンは表示する
      const row = updateScheduleButtons(0, 0); // インデックスと総数を0に
      await interaction.editReply({ content: 'ℹ️ 登録されている予定はありません。「予定を追加」ボタンから新しい予定を登録できます。', components: [row] });
      // この場合もコレクターをセットアップして「予定を追加」ボタンのクリックに対応する
    }


    let currentIndex = 0;
    const totalSchedules = schedules.length;

    // 予定がなくても updateScheduleButtons は呼び出されるようにする
    const initialEmbed = schedules.length > 0 ? createScheduleEmbed(schedules[currentIndex], currentIndex, totalSchedules) : null;
    const initialRow = updateScheduleButtons(currentIndex, totalSchedules);
    
    const replyOptions = { components: [initialRow] };
    if (initialEmbed) {
        replyOptions.embeds = [initialEmbed];
    } else if (schedules.length === 0) { // この条件は上のifで処理済みだが念のため
        replyOptions.content = 'ℹ️ 登録されている予定はありません。「予定を追加」ボタンから新しい予定を登録できます。';
    }


    const message = await interaction.editReply(replyOptions);

    const filter = (i) => {
      if (!i.isButton()) return false;
      if (i.user.id !== interaction.user.id) {
        i.reply({ content: 'このボタンはコマンドの実行者のみ操作できます。', flags: MessageFlags.Ephemeral });
        return false;
      }
      return i.customId === 'schedule_previous' || i.customId === 'schedule_next' || i.customId === 'schedule_add_modal_trigger';
    };

    const collector = message.createMessageComponentCollector({ filter, time: 300000 }); // 5分間

    collector.on('collect', async (i) => {
      if (i.customId === 'schedule_previous') {
        if (schedules.length === 0) { // 予定がない場合は操作不可
             await i.deferUpdate(); return;
        }
        currentIndex--;
        const newEmbed = createScheduleEmbed(schedules[currentIndex], currentIndex, totalSchedules);
        const newRow = updateScheduleButtons(currentIndex, totalSchedules);
        await i.update({ embeds: [newEmbed], components: [newRow] });
      } else if (i.customId === 'schedule_next') {
        if (schedules.length === 0) { // 予定がない場合は操作不可
             await i.deferUpdate(); return;
        }
        currentIndex++;
        const newEmbed = createScheduleEmbed(schedules[currentIndex], currentIndex, totalSchedules);
        const newRow = updateScheduleButtons(currentIndex, totalSchedules);
        await i.update({ embeds: [newEmbed], components: [newRow] });
      } else if (i.customId === 'schedule_add_modal_trigger') {
        const modal = new ModalBuilder()
          .setCustomId('schedule_add_text_modal') // モーダル送信時のID
          .setTitle('新しい予定を文章で追加');

        const scheduleInput = new TextInputBuilder()
          .setCustomId('schedule_text_input')
          .setLabel('予定の詳細を文章で入力してください')
          .setStyle(TextInputStyle.Paragraph) // 長文入力用にParagraph
          .setPlaceholder('例: 明日の数学の宿題 P10-15 提出は土曜日')
          .setRequired(true);

        const actionRowModal = new ActionRowBuilder().addComponents(scheduleInput);
        modal.addComponents(actionRowModal);

        await i.showModal(modal);
      }
    });

    collector.on('end', (collected, reason) => {
      const finalRow = updateScheduleButtons(currentIndex, totalSchedules); // 現在の状態でボタンを取得
      const disabledRow = new ActionRowBuilder();
      finalRow.components.forEach(button => {
        disabledRow.addComponents(ButtonBuilder.from(button).setDisabled(true));
      });
        
      if (message && message.editable) {
         message.edit({ components: [disabledRow] }).catch(console.error);
      }
    });
  },

  /**
   * モーダルから送信されたテキストをAIで処理し、スプレッドシートに追記する関数
   * (この関数は bot.js の interactionCreate イベントリスナーから呼び出される想定)
   * @param {import('discord.js').ModalSubmitInteraction} modalInteraction
   */
  async handleScheduleModalSubmit(modalInteraction) {
    await modalInteraction.deferReply({ flags: MessageFlags.Ephemeral });

    const userInput = modalInteraction.fields.getTextInputValue('schedule_text_input');
    const scheduleData = await extractScheduleInfoWithAI(userInput);

    if (scheduleData && scheduleData.task) {
      const { type = '未分類', task, due = '不明' } = scheduleData;
      let sheets;
      try {
        sheets = await getSheetsClient();
      } catch (authError) {
        console.error('Google API Authentication Error (Modal Add):', authError);
        await modalInteraction.editReply({ content: '❌ Google API認証に失敗しました。予定を登録できません。' });
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
        await modalInteraction.editReply({ content: `✅ 予定をスプレッドシートに追加しました！\n種別: ${type}\n内容: ${task}\n期限: ${due}` });
        // ここで元のリスト表示を更新するのは複雑なので、一旦追加完了メッセージのみとします。
      } catch (sheetError) {
        console.error('Google Sheets API (append) error:', sheetError);
        await modalInteraction.editReply({ content: '❌ スプレッドシートへの予定追加中にエラーが発生しました。' });
      }
    } else {
      await modalInteraction.editReply({ content: '❌ AIが予定情報をうまく抽出できませんでした。もう少し具体的に入力してみてください。\n例: 「種別は宿題、内容は国語の教科書P20、期限は来週の月曜日」' });
    }
  }
};