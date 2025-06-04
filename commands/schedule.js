// discord.js から必要なビルダーとスタイルをインポート
const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// スプレッドシートIDと範囲
const sheetId = process.env.GOOGLE_SHEET_ID || '16Mf4f4lIyqvzxjx5Nj8zgvXXRyIZjGFtfQlNmjjzKig';
const listRange = 'シート1!A2:C';
const appendRange = 'シート1!A:A';

// Google Sheets API クライアントを取得するヘルパー関数
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

// Gemini API クライアントの初期化
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * ユーザー入力から予定情報を抽出するAI関数
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
 * ユーザー入力と予定リストから削除対象を特定するAI関数 (新規追加)
 */
async function extractDeletionTargetWithAI(userInput, currentSchedules) {
  const tryModels = ['gemini-1.5-flash', 'gemini-1.5-pro'];
  let lastError = null;

  const formattedSchedules = currentSchedules.map((item, index) => ({
    index, // 0-based index in the currentSchedules array
    type: item[0] || 'N/A',
    task: item[1] || 'N/A',
    due: item[2] || 'N/A',
  }));

  const prompt = `
以下の予定リストの中から、ユーザーが削除したいと述べている予定を特定し、その予定のリスト内での【0始まりのインデックス番号】と【タスク内容】を抽出してください。
ユーザー入力の日付表現（「明日」「昨日」など）は、今日が ${new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit'})} であることを考慮して解釈してください。
もし完全に一致するものが複数ある場合や、曖昧で特定が困難な場合は、"indexToDelete" を null とし、"reason" にその理由を日本語で記述してください。
特定できた場合は、"reason" は不要です。
結果は必ず以下のJSON形式の文字列で出力してください。他の説明や前置きは一切不要です。

予定リスト:
${JSON.stringify(formattedSchedules)}

ユーザーの削除リクエスト: "${userInput}"

JSON形式:
{
  "indexToDelete": extracted_index_or_null,
  "identifiedTask": "extracted_task_content_if_found",
  "reason": "reason_if_ambiguous_or_not_found_in_Japanese"
}
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
          console.warn(`[${modelName} - DeletionAI] JSONのパースに失敗 (Markdown除去後): ${parseError.message}. 元の応答: ${rawResponseText}`);
          lastError = parseError;
          continue;
        }
      } else {
        console.warn(`[${modelName} - DeletionAI] AIの応答がJSON形式ではありません (Markdown除去後): ${jsonToParse}. 元の応答: ${rawResponseText}`);
        lastError = new Error(`AI response was not valid JSON after stripping Markdown. Content: ${jsonToParse}`);
        continue;
      }
    } catch (error) {
      console.warn(`[${modelName} - DeletionAI] での情報抽出に失敗: ${error.message}`);
      lastError = error;
      if (error.message.includes('429') || error.message.includes('Quota') || error.message.includes('API key not valid')) {
        console.error(`[${modelName} - DeletionAI] APIエラー。処理を中断します。: ${error.message}`);
        break;
      }
    }
  }
  console.error("全てのAIモデルでの削除対象特定に失敗しました (DeletionAI)。", lastError ? lastError.message : "不明なエラー");
  return { indexToDelete: null, reason: "AIモデルでの処理中にエラーが発生しました。" };
}

/**
 * 1件の予定情報を Embed に整形する関数
 */
function createScheduleEmbed(scheduleItem, currentIndex, totalSchedules) {
  const type = scheduleItem[0] || 'N/A';
  const task = scheduleItem[1] || 'N/A';
  const dueDate = scheduleItem[2] || 'N/A';

  return new EmbedBuilder()
    .setTitle(`📝 ${type} (${currentIndex + 1}/${totalSchedules})`)
    .setColor(0x0099FF)
    .addFields(
      { name: '内容', value: task, inline: false },
      { name: '期限', value: dueDate, inline: false }
    )
    .setTimestamp()
    .setFooter({ text: `予定 ${currentIndex + 1} / ${totalSchedules}` });
}

/**
 * ナビゲーションボタン、追加ボタン、削除ボタンを作成・更新する関数 (更新)
 */
function updateScheduleButtons(currentIndex, totalSchedules, schedulesExist) {
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_previous')
        .setLabel('前の予定')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentIndex === 0 || !schedulesExist),
      new ButtonBuilder()
        .setCustomId('schedule_next')
        .setLabel('次の予定')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentIndex >= totalSchedules - 1 || !schedulesExist),
      new ButtonBuilder()
        .setCustomId('schedule_add_modal_trigger')
        .setLabel('予定を追加')
        .setStyle(ButtonStyle.Success)
    );

  if (schedulesExist) { // 予定が存在する場合のみ「削除」ボタンを追加
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_delete_modal_trigger')
        .setLabel('予定を削除')
        .setStyle(ButtonStyle.Danger)
    );
  }
  return row;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('登録されている予定をボタンで確認・追加・削除します。'), // 説明を更新

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

    let currentIndex = 0;
    const totalSchedules = schedules.length;
    const schedulesExist = totalSchedules > 0; // 予定が存在するかのフラグ

    if (!schedulesExist) {
      const row = updateScheduleButtons(0, 0, false); // schedulesExist を false に
      await interaction.editReply({ content: 'ℹ️ 登録されている予定はありません。「予定を追加」ボタンから新しい予定を登録できます。', components: [row] });
      // この後、追加ボタンに対応するためにコレクターはセットアップされる
    }

    const initialEmbed = schedulesExist ? createScheduleEmbed(schedules[currentIndex], currentIndex, totalSchedules) : null;
    const initialRow = updateScheduleButtons(currentIndex, totalSchedules, schedulesExist); 

    const replyOptions = { components: [initialRow] };
    if (initialEmbed) {
      replyOptions.embeds = [initialEmbed];
    } else if (!schedulesExist) { 
      replyOptions.content = 'ℹ️ 登録されている予定はありません。「予定を追加」ボタンから新しい予定を登録できます。';
    }


    const message = await interaction.editReply(replyOptions);

    const filter = (i) => {
      if (!i.isButton()) return false;
      if (i.user.id !== interaction.user.id) {
        i.reply({ content: 'このボタンはコマンドの実行者のみ操作できます。', flags: MessageFlags.Ephemeral });
        return false;
      }
      return ['schedule_previous', 'schedule_next', 'schedule_add_modal_trigger', 'schedule_delete_modal_trigger'].includes(i.customId);
    };

    const collector = message.createMessageComponentCollector({ filter, time: 300000 }); 

    collector.on('collect', async (i) => {
      try {
        if (i.customId === 'schedule_previous') {
          if (!schedulesExist) { await i.deferUpdate(); return; }
          currentIndex--;
          const newEmbed = createScheduleEmbed(schedules[currentIndex], currentIndex, totalSchedules);
          const newRow = updateScheduleButtons(currentIndex, totalSchedules, schedulesExist);
          await i.update({ embeds: [newEmbed], components: [newRow] });
        } else if (i.customId === 'schedule_next') {
          if (!schedulesExist) { await i.deferUpdate(); return; }
          currentIndex++;
          const newEmbed = createScheduleEmbed(schedules[currentIndex], currentIndex, totalSchedules);
          const newRow = updateScheduleButtons(currentIndex, totalSchedules, schedulesExist);
          await i.update({ embeds: [newEmbed], components: [newRow] });
        } else if (i.customId === 'schedule_add_modal_trigger') {
          const modal = new ModalBuilder()
            .setCustomId('schedule_add_text_modal')
            .setTitle('新しい予定を文章で追加');
          const scheduleInput = new TextInputBuilder()
            .setCustomId('schedule_text_input')
            .setLabel('予定の詳細を文章で入力してください')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('例: 明日の数学の宿題 P10-15 提出は土曜日')
            .setRequired(true);
          const actionRowModal = new ActionRowBuilder().addComponents(scheduleInput);
          modal.addComponents(actionRowModal);
          await i.showModal(modal);
        } else if (i.customId === 'schedule_delete_modal_trigger') {
          const deleteModal = new ModalBuilder()
            .setCustomId('schedule_delete_text_modal') 
            .setTitle('削除する予定の情報を入力');
          const deleteInput = new TextInputBuilder()
            .setCustomId('schedule_delete_description_input') 
            .setLabel('削除したい予定の特徴を教えてください')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('例: 明日の数学の宿題、会議の資料など')
            .setRequired(true);
          const actionRowModalDelete = new ActionRowBuilder().addComponents(deleteInput);
          deleteModal.addComponents(actionRowModalDelete);
          await i.showModal(deleteModal);
        }
      } catch (error) {
        console.error('Error during button interaction:', error);
        if (!i.replied && !i.deferred) {
          await i.reply({ content: '⚠️ ボタンの処理中にエラーが発生しました。', flags: MessageFlags.Ephemeral }).catch(console.error);
        } else {
          await i.followUp({ content: '⚠️ ボタンの処理中にエラーが発生しました。', flags: MessageFlags.Ephemeral }).catch(console.error);
        }
      }
    });

    collector.on('end', (collected, reason) => {
      const finalRow = updateScheduleButtons(currentIndex, totalSchedules, schedulesExist); 
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
        await modalInteraction.editReply({ content: `✅ 予定をスプレッドシートに追加しました！\n種別: ${type}\n内容: ${task}\n期限: ${due}\nリストを更新するには、再度 \`/schedule\` コマンドを実行してください。` });
      } catch (sheetError) {
        console.error('Google Sheets API (append) error:', sheetError);
        await modalInteraction.editReply({ content: '❌ スプレッドシートへの予定追加中にエラーが発生しました。' });
      }
    } else {
      await modalInteraction.editReply({ content: '❌ AIが予定情報をうまく抽出できませんでした。もう少し具体的に入力してみてください。\n例: 「種別は宿題、内容は国語の教科書P20、期限は来週の月曜日」' });
    }
  },

  /**
   * 削除用モーダルから送信されたテキストをAIで処理し、スプレッドシートから該当行を削除する関数 (新規追加)
   * @param {import('discord.js').ModalSubmitInteraction} modalInteraction
   */
  async handleScheduleDeleteModal(modalInteraction) {
    await modalInteraction.deferReply({ flags: MessageFlags.Ephemeral });

    const userInput = modalInteraction.fields.getTextInputValue('schedule_delete_description_input');
    let sheets;
    let currentSchedules = [];

    try {
      sheets = await getSheetsClient();
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: listRange,
      });
      currentSchedules = response.data.values || [];
      if (currentSchedules.length === 0) {
        await modalInteraction.editReply({ content: 'ℹ️ 現在登録されている予定はありません。削除する対象がありません。' });
        return;
      }
    } catch (error) {
      console.error('Error fetching schedules for deletion:', error);
      await modalInteraction.editReply({ content: '❌ スプレッドシートからの予定の読み込みに失敗しました。' });
      return;
    }

    const deletionTarget = await extractDeletionTargetWithAI(userInput, currentSchedules);

    if (deletionTarget && typeof deletionTarget.indexToDelete === 'number') {
      const targetIndex = deletionTarget.indexToDelete;
      if (targetIndex < 0 || targetIndex >= currentSchedules.length) {
        await modalInteraction.editReply({ content: `❌ AIが示したインデックス (${targetIndex}) が範囲外です。既存の予定数: ${currentSchedules.length}` });
        return;
      }
      const scheduleToDelete = currentSchedules[targetIndex];
      const type = scheduleToDelete[0] || 'N/A';
      const task = scheduleToDelete[1] || 'N/A';
      const due = scheduleToDelete[2] || 'N/A';

      try {
        let targetSheetGid = 0; // デフォルトは0 (通常、最初のシート)
        try {
          const spreadsheetInfo = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
          const sheet1 = spreadsheetInfo.data.sheets.find(s => s.properties.title === 'シート1');
          if (sheet1) {
            targetSheetGid = sheet1.properties.sheetId;
          } else {
            console.warn("シート 'シート1' が見つかりませんでした。gid=0 を使用します。");
          }
        } catch (e) {
          console.warn(`シートのgid取得に失敗: ${e.message}. デフォルトのgid=0 を使用します。`);
        }

        // listRange ('シート1!A2:C') はヘッダーを除いたデータ範囲
        // 配列のインデックス targetIndex は、ヘッダーを除いたデータの0番目から始まるインデックス
        // Google Sheets API の deleteDimension の startIndex は 0-indexed で、シート全体の行を指す
        // シートの1行目 (ヘッダー) = startIndex 0
        // シートの2行目 (データ開始行) = startIndex 1
        // よって、データ配列のインデックス targetIndex に対応するシート全体の行の startIndex は targetIndex + 1
        const sheetRowStartIndex = targetIndex + 1;

        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          resource: {
            requests: [
              {
                deleteDimension: {
                  range: {
                    sheetId: targetSheetGid,
                    dimension: 'ROWS',
                    startIndex: sheetRowStartIndex,
                    endIndex: sheetRowStartIndex + 1,
                  },
                },
              },
            ],
          },
        });
        await modalInteraction.editReply({ content: `✅ 予定「${task}」(種別: ${type}, 期限: ${due}) をスプレッドシートから削除しました。\nリストを更新するには、再度 \`/schedule\` コマンドを実行してください。` });
      } catch (sheetError) {
        console.error('Google Sheets API (delete) error:', sheetError.message, sheetError.errors);
        await modalInteraction.editReply({ content: '❌ スプレッドシートからの予定削除中にエラーが発生しました。' });
      }
    } else {
      const reason = deletionTarget.reason || "AIが予定を特定できませんでした。";
      await modalInteraction.editReply({ content: `❌ 削除対象の予定を特定できませんでした。\n理由: ${reason}\nもう少し具体的に入力するか、内容が正しいか確認してください。` });
    }
  }
};