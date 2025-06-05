// discord.js から必要なビルダーとスタイルをインポート
const {
  SlashCommandBuilder,
  EmbedBuilder,
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
const TRY_MODELS = ['gemini-1.5-flash', 'gemini-1.5-pro'];

/**
 * ★ ユーザー入力から予定情報を抽出し、常に配列で返すAI関数 (修正)
 * 単一の予定でも複数の予定でも対応。
 */
async function extractScheduleInfoWithAI(userInput) {
  const tryModels = TRY_MODELS;
  let lastError = null;

  const prompt = `
以下のユーザー入力を分析し、含まれる全ての予定について「種別」「内容」「期限」を抽出してください。
ユーザーが複数の予定を記述している場合（例：改行区切り、箇条書き、「と」「や」での接続など）、それぞれを個別の予定として認識してください。
種別の記述がない場合は「課題」「テスト」「その他」の中から考えて選んでください。
漢数字はすべて半角算用数字に書き換えること。内容は冗長にならないように気をつけること。
「明日」「明後日」は今日 (${new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit'})}) からの日付で期限を考えること。
結果は必ず以下のJSON形式の文字列（予定オブジェクトの配列）で出力してください。単一の予定の場合でも、要素数1の配列としてください。
他の説明や前置きは一切不要です。抽出できる予定がない場合は空の配列 "[]" を返してください。

例1 (単一予定):
ユーザー入力: "明日の数学の宿題 P10-15"
出力:
[
  {
    "type": "宿題",
    "task": "数学 P10-15",
    "due": "${new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('ja-JP', {year: 'numeric', month: '2-digit', day: '2-digit'}).replace(/\//g, '-')}"
  }
]

例2 (複数予定):
ユーザー入力: "国語の教科書を読む 明日まで。あと、来週の月曜に英語の単語テスト"
出力:
[
  {
    "type": "課題",
    "task": "国語の教科書を読む",
    "due": "${new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('ja-JP', {year: 'numeric', month: '2-digit', day: '2-digit'}).replace(/\//g, '-')}"
  },
  {
    "type": "テスト",
    "task": "英語の単語テスト",
    "due": "来週の月曜日"
  }
]

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
        jsonToParse = jsonToParse.substring(7, jsonToParse.endsWith("```") ? jsonToParse.length - 3 : undefined);
      } else if (jsonToParse.startsWith("```")) {
        jsonToParse = jsonToParse.substring(3, jsonToParse.endsWith("```") ? jsonToParse.length - 3 : undefined);
      }
      jsonToParse = jsonToParse.trim();

      if (jsonToParse.startsWith('[') && jsonToParse.endsWith(']')) {
        try {
          const parsedArray = JSON.parse(jsonToParse);
          if (Array.isArray(parsedArray)) {
            return parsedArray;
          } else {
            console.warn(`[${modelName} - ScheduleAI] AIの応答がJSON配列形式ではありません（パース後）: ${jsonToParse}`);
            lastError = new Error(`AI response was parsed but not an array. Content: ${jsonToParse}`);
            continue;
          }
        } catch (parseError) {
          console.warn(`[${modelName} - ScheduleAI] JSON配列のパースに失敗: ${parseError.message}. 応答: ${rawResponseText}`);
          lastError = parseError;
          continue;
        }
      } else {
        console.warn(`[${modelName} - ScheduleAI] AIの応答がJSON配列形式ではありません: ${jsonToParse}. 応答: ${rawResponseText}`);
        lastError = new Error(`AI response was not valid JSON Array. Content: ${jsonToParse}`);
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
  return []; // 失敗時は空配列を返す
}

/**
 * ★ ユーザー入力と予定リストから削除対象を特定し、常にインデックスの配列で返すAI関数 (修正)
 */
async function extractDeletionTargetWithAI(userInput, currentSchedules) {
  const tryModels = TRY_MODELS;
  let lastError = null;

  const formattedSchedules = currentSchedules.map((item, index) => ({
    index, 
    type: item[0] || 'N/A',
    task: item[1] || 'N/A',
    due: item[2] || 'N/A',
  }));

  const prompt = `
以下の予定リストの中から、ユーザーが削除したいと述べている全ての予定を特定し、それらの予定のリスト内での【0始まりのインデックス番号】を抽出してください。
ユーザー入力の日付表現（「明日」「昨日」など）は、今日が ${new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit'})} であることを考慮して解釈してください。
結果は必ず以下のJSON形式の文字列で出力してください。
"indicesToDelete" キーには抽出したインデックスの配列を、"reason" キーにはインデックスが特定できなかった場合の理由や補足情報（日本語）を記述してください。
ユーザーが指定した予定がリストに存在しない場合や曖昧な場合も、reasonに記述してください。
全ての対象を特定できた場合は、"reason" は空文字列にするか省略可能です。
特定できる予定がない場合は "indicesToDelete" は空の配列 [] としてください。他の説明や前置きは一切不要です。

予定リスト:
${JSON.stringify(formattedSchedules, null, 2)}

ユーザーの削除リクエスト: "${userInput}"

JSON形式:
{
  "indicesToDelete": [extracted_index1, extracted_index2, ...],
  "reason": "一部または全て特定できなかった場合の理由や補足 (日本語)。全て特定できた場合は省略可"
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
        jsonToParse = jsonToParse.substring(7, jsonToParse.endsWith("```") ? jsonToParse.length - 3 : undefined);
      } else if (jsonToParse.startsWith("```")) {
        jsonToParse = jsonToParse.substring(3, jsonToParse.endsWith("```") ? jsonToParse.length - 3 : undefined);
      }
      jsonToParse = jsonToParse.trim();
      
      if (jsonToParse.startsWith('{') && jsonToParse.endsWith('}')) {
        try {
          const parsed = JSON.parse(jsonToParse);
          // indicesToDeleteが配列であることを保証
          if (!Array.isArray(parsed.indicesToDelete)) {
            console.warn(`[${modelName} - DeletionAI] indicesToDeleteが配列ではありませんでした。応答: ${rawResponseText}`);
            parsed.indicesToDelete = [];
            if (!parsed.reason) parsed.reason = "AIの応答でindicesToDeleteが配列形式ではありませんでした。";
          }
          return parsed;
        } catch (parseError) {
          console.warn(`[${modelName} - DeletionAI] JSONのパースに失敗: ${parseError.message}. 応答: ${rawResponseText}`);
          lastError = parseError;
          continue;
        }
      } else {
        console.warn(`[${modelName} - DeletionAI] AIの応答がJSON形式ではありません: ${jsonToParse}. 応答: ${rawResponseText}`);
        lastError = new Error(`AI response was not valid JSON. Content: ${jsonToParse}`);
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
  return { indicesToDelete: [], reason: "AIモデルでの処理中にエラーが発生しました。" };
}

/**
 * 1件の予定情報を Embed に整形する関数 (既存)
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
 * ★ ナビゲーション、追加、編集、削除ボタンを作成・更新する関数 (元の状態に戻す)
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
        .setLabel('追加')
        .setStyle(ButtonStyle.Success)
    );

  if (schedulesExist) {
    row.addComponents(
      new ButtonBuilder() 
        .setCustomId('schedule_edit_modal_trigger')
        .setLabel('編集')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('schedule_delete_modal_trigger')
        .setLabel('削除')
        .setStyle(ButtonStyle.Danger)
    );
  }
  return row; // ★ 単一のActionRowを返す
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('登録されている予定をボタンで確認・追加・編集・削除します。'), 

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: 'このコマンドはサーバー内でのみ使用できます。', ephemeral: true });
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
    const schedulesExist = totalSchedules > 0;

    const initialEmbed = schedulesExist ? createScheduleEmbed(schedules[currentIndex], currentIndex, totalSchedules) : null;
    const initialRow = updateScheduleButtons(currentIndex, totalSchedules, schedulesExist); // ★ 単一のActionRowを取得

    const replyOptions = { components: [initialRow] }; // ★ componentsはActionRowの配列
    if (initialEmbed) {
      replyOptions.embeds = [initialEmbed];
    } else { 
      replyOptions.content = 'ℹ️ 登録されている予定はありません。「追加」ボタンから新しい予定を登録できます。';
    }

    const message = await interaction.editReply(replyOptions);

    // ★ コレクターのフィルターを元に戻す
    const filter = (i) => {
      if (!i.isButton()) return false;
      if (i.user.id !== interaction.user.id) {
        i.reply({ content: 'このボタンはコマンドの実行者のみ操作できます。', ephemeral: true });
        return false;
      }
      return ['schedule_previous', 'schedule_next', 'schedule_add_modal_trigger', 'schedule_edit_modal_trigger', 'schedule_delete_modal_trigger'].includes(i.customId);
    };

    const collector = message.createMessageComponentCollector({ filter, time: 300000 }); 

    collector.on('collect', async (i) => {
      try {
        if (i.customId === 'schedule_previous') {
          if (!schedulesExist) { await i.deferUpdate().catch(console.error); return; }
          currentIndex--;
          if (currentIndex < 0) currentIndex = 0; // 配列範囲チェック
          const newEmbed = createScheduleEmbed(schedules[currentIndex], currentIndex, totalSchedules);
          const newRow = updateScheduleButtons(currentIndex, totalSchedules, schedulesExist);
          await i.update({ embeds: [newEmbed], components: [newRow] });
        } else if (i.customId === 'schedule_next') {
          if (!schedulesExist) { await i.deferUpdate().catch(console.error); return; }
          currentIndex++;
          if (currentIndex >= totalSchedules) currentIndex = totalSchedules -1; // 配列範囲チェック
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
            .setPlaceholder('例: 明日の数学の宿題 P10-15\n国語の音読 来週月曜まで')
            .setRequired(true);
          const actionRowModal = new ActionRowBuilder().addComponents(scheduleInput);
          modal.addComponents(actionRowModal);
          await i.showModal(modal);
        } else if (i.customId === 'schedule_edit_modal_trigger') { 
          if (!schedulesExist || !schedules[currentIndex]) {
            await i.reply({ content: '編集対象の予定がありません。', ephemeral: true });
            return;
          }
          const currentSchedule = schedules[currentIndex];
          const type = currentSchedule[0] || '';
          const task = currentSchedule[1] || '';
          const due = currentSchedule[2] || '';

          const editModal = new ModalBuilder()
            .setCustomId(`schedule_edit_modal_submit_${currentIndex}`) 
            .setTitle('予定を編集');
          const typeInput = new TextInputBuilder().setCustomId('edit_type_input').setLabel('種別').setStyle(TextInputStyle.Short).setValue(type).setPlaceholder('例: 課題, テスト, その他').setRequired(false);
          const taskInput = new TextInputBuilder().setCustomId('edit_task_input').setLabel('内容').setStyle(TextInputStyle.Paragraph).setValue(task).setPlaceholder('例: 数学の宿題 P10-15').setRequired(true);
          const dueInput = new TextInputBuilder().setCustomId('edit_due_input').setLabel('期限').setStyle(TextInputStyle.Short).setValue(due).setPlaceholder('例: 明日, YYYY-MM-DD, MM/DD').setRequired(false);
          editModal.addComponents(
            new ActionRowBuilder().addComponents(typeInput),
            new ActionRowBuilder().addComponents(taskInput),
            new ActionRowBuilder().addComponents(dueInput)
          );
          await i.showModal(editModal);
        } else if (i.customId === 'schedule_delete_modal_trigger') {
          const deleteModal = new ModalBuilder()
            .setCustomId('schedule_delete_text_modal') 
            .setTitle('削除する予定の情報を入力');
          const deleteInput = new TextInputBuilder()
            .setCustomId('schedule_delete_description_input') 
            .setLabel('削除したい予定の特徴を教えてください')
            .setStyle(TextInputStyle.Paragraph) // ★ 複数削除を意識してParagraphに変更も検討
            .setPlaceholder('例: 明日の数学の宿題、または「会議の資料」と「〇〇のレポート」')
            .setRequired(true);
          const actionRowModalDelete = new ActionRowBuilder().addComponents(deleteInput);
          deleteModal.addComponents(actionRowModalDelete);
          await i.showModal(deleteModal);
        }
      } catch (error) {
        console.error('Error during button interaction:', error);
        if (!i.replied && !i.deferred && i.isRepliable()) { 
            await i.reply({ content: '⚠️ ボタンの処理中にエラーが発生しました。', ephemeral: true }).catch(console.error);
        } else if (i.isRepliable()){ 
            await i.followUp({ content: '⚠️ ボタンの処理中にエラーが発生しました。', ephemeral: true }).catch(console.error);
        } else {
            console.error("Interaction is not repliable.");
        }
      }
    });

    collector.on('end', (collected, reason) => {
      const finalRow = updateScheduleButtons(currentIndex, totalSchedules, schedulesExist); 
      const disabledRow = new ActionRowBuilder();
      finalRow.components.forEach(button => { // finalRow は ActionRowBuilder のインスタンスなので、その components を直接参照
        disabledRow.addComponents(ButtonBuilder.from(button).setDisabled(true));
      });
        
      if (message && message.editable) {
         message.edit({ components: [disabledRow] }).catch(console.error);
      }
    });
  },

  /**
   * ★ 追加用モーダル処理 (修正：複数追加に対応)
   */
  async handleScheduleModalSubmit(modalInteraction) {
    await modalInteraction.deferReply({ ephemeral: true });

    const userInput = modalInteraction.fields.getTextInputValue('schedule_text_input');
    const extractedSchedules = await extractScheduleInfoWithAI(userInput); // 常に配列を期待

    if (!extractedSchedules || extractedSchedules.length === 0) {
      await modalInteraction.editReply({ content: '❌ AIが予定情報をうまく抽出できませんでした。入力形式を確認するか、もう少し具体的に入力してみてください。\n例1: 明日の国語の音読\n例2: 数学のドリルP5 金曜日まで、そして理科のレポート 来週の月曜提出' });
      return;
    }
    
    let sheets;
    try {
      sheets = await getSheetsClient();
    } catch (authError) {
      console.error('Google API Authentication Error (Modal Add):', authError);
      await modalInteraction.editReply({ content: '❌ Google API認証に失敗しました。予定を登録できません。' });
      return;
    }

    const valuesToAppend = extractedSchedules.map(scheduleData => {
        if (scheduleData && scheduleData.task) {
            const { type = '未分類', task, due = '不明' } = scheduleData;
            return [type, task, due];
        }
        return null;
    }).filter(row => row !== null); // taskがないものや不正なものを除外

    if (valuesToAppend.length === 0) {
        await modalInteraction.editReply({ content: '❌ 抽出された情報から有効な予定を作成できませんでした。内容（task）が必須です。' });
        return;
    }

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: appendRange,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: valuesToAppend, // ★ 複数の値を一度に送信
        },
      });
      const count = valuesToAppend.length;
      await modalInteraction.editReply({ content: `✅ ${count}件の予定をスプレッドシートに追加しました！\nリストを更新するには、再度 \`/schedule\` コマンドを実行してください。` });
    } catch (sheetError) {
      console.error('Google Sheets API (append) error:', sheetError);
      await modalInteraction.editReply({ content: '❌ スプレッドシートへの予定追加中にエラーが発生しました。' });
    }
  },

  /**
   * ★ 削除用モーダル処理 (修正：複数削除に対応)
   */
  async handleScheduleDeleteModal(modalInteraction) {
    await modalInteraction.deferReply({ ephemeral: true });

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

    const deletionData = await extractDeletionTargetWithAI(userInput, currentSchedules); // {indicesToDelete: [...], reason: "..."} を期待
    let indicesToDelete = deletionData.indicesToDelete || [];
    const reason = deletionData.reason;

    if (!indicesToDelete || indicesToDelete.length === 0) {
      let replyMessage = '❌ AIが削除対象の予定を特定できませんでした。';
      if (reason) {
        replyMessage += `\n理由: ${reason}`;
      }
      replyMessage += '\nもう少し具体的に入力するか、内容が正しいか確認してください。';
      await modalInteraction.editReply({ content: replyMessage });
      return;
    }

    // インデックスのバリデーションと重複削除、降順ソート
    indicesToDelete = [...new Set(indicesToDelete)] 
        .filter(idx => typeof idx === 'number' && idx >= 0 && idx < currentSchedules.length)
        .sort((a, b) => b - a); // ★ 降順ソート (重要：行削除時のインデックスずれを防ぐため)

    if (indicesToDelete.length === 0) {
        await modalInteraction.editReply({ content: `❌ 有効な削除対象が見つかりませんでした。AIが示したインデックスが不正か、対象が特定できませんでした。${reason ? `\nAIからの注記: ${reason}` : ''}` });
        return;
    }

    try {
      let targetSheetGid = 0; 
      try {
        const spreadsheetInfo = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
        const sheet1 = spreadsheetInfo.data.sheets.find(s => s.properties.title === 'シート1');
        if (sheet1 && typeof sheet1.properties.sheetId === 'number') {
          targetSheetGid = sheet1.properties.sheetId;
        } else {
          console.warn("シート 'シート1' またはそのgidが見つかりませんでした。gid=0 を使用します。");
        }
      } catch (e) {
        console.warn(`シートのgid取得に失敗: ${e.message}. デフォルトのgid=0 を使用します。`);
      }
      
      const deleteRequests = indicesToDelete.map(targetIndex => {
        const sheetRowStartIndex = targetIndex + 1; // listRange A2:C を考慮した0ベースの行インデックス
        return {
          deleteDimension: {
            range: {
              sheetId: targetSheetGid,
              dimension: 'ROWS',
              startIndex: sheetRowStartIndex,
              endIndex: sheetRowStartIndex + 1,
            },
          },
        };
      });
      
      if (deleteRequests.length > 0) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          resource: {
            requests: deleteRequests,
          },
        });
        let replyMessage = `✅ ${deleteRequests.length}件の予定をスプレッドシートから削除しました。\nリストを更新するには、再度 \`/schedule\` コマンドを実行してください。`;
        // AIが理由を返していて、かつ実際に削除された件数がAIが示唆した件数より少ない場合、その理由を表示する
        if (reason && deletionData.indicesToDelete.length > indicesToDelete.length) { 
            replyMessage += `\nAIからの注記: ${reason}`;
        }
        await modalInteraction.editReply({ content: replyMessage });
      } else {
         await modalInteraction.editReply({ content: 'ℹ️ 削除リクエストを作成できませんでした (有効なインデックスなし)。' });
      }

    } catch (sheetError) {
      console.error('Google Sheets API (batch delete) error:', sheetError.message, sheetError.errors);
      await modalInteraction.editReply({ content: '❌ スプレッドシートからの複数予定削除中にエラーが発生しました。' });
    }
  },

  /**
   * 編集用モーダル処理 (既存のまま)
   */
  async handleScheduleEditModal(modalInteraction, targetIndex) {
    await modalInteraction.deferReply({ ephemeral: true });

    const newType = modalInteraction.fields.getTextInputValue('edit_type_input').trim() || 'その他';
    const newTask = modalInteraction.fields.getTextInputValue('edit_task_input').trim();
    const newDueRaw = modalInteraction.fields.getTextInputValue('edit_due_input').trim() || '不明';

    if (!newTask) {
        await modalInteraction.editReply({ content: '❌ 内容は必須です。' });
        return;
    }

    let newDue = newDueRaw;
    if (newDueRaw && newDueRaw.toLowerCase() !== '不明' && newDueRaw.toLowerCase() !== 'na' && newDueRaw.toLowerCase() !== 'n/a') {
        // 編集時は単一の予定に対する更新なので、単一情報抽出用のAI関数を呼び出す
        // ただし、extractScheduleInfoWithAIが配列を返すようになったので、その最初の要素を使う
        const scheduleLikeString = `${newType} ${newTask} ${newDueRaw}`;
        const extractedDateInfoArray = await extractScheduleInfoWithAI(scheduleLikeString); 
        if (extractedDateInfoArray && extractedDateInfoArray.length > 0) {
            const extractedDateInfo = extractedDateInfoArray[0]; // 配列の最初の要素を取得
            if (extractedDateInfo && extractedDateInfo.due && extractedDateInfo.due !== '不明') {
                newDue = extractedDateInfo.due;
            } else {
                console.warn(`AIによる期限 '${newDueRaw}' の解析に失敗、または「不明」と判断されました。元の入力を期限として使用します。`);
            }
        } else {
             console.warn(`AIによる期限 '${newDueRaw}' の解析に失敗しました。元の入力を期限として使用します。`);
        }
    }
    
    try {
      const sheets = await getSheetsClient();
      const rangeToUpdate = `'シート1'!A${targetIndex + 2}:C${targetIndex + 2}`;
      
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: rangeToUpdate,
        valueInputOption: 'USER_ENTERED', 
        resource: {
          values: [[newType, newTask, newDue]],
        },
      });

      await modalInteraction.editReply({ content: `✅ 予定 (元のリストでの ${targetIndex + 1}番目) を更新しました。\n新しい内容:\n種別: ${newType}\n内容: ${newTask}\n期限: ${newDue}\n\nリストを最新の状態にするには、再度 \`/schedule\` コマンドを実行してください。` });
    } catch (error) {
      console.error('Error updating schedule in Google Sheets:', error);
      await modalInteraction.editReply({ content: '❌ スプレッドシートの予定更新中にエラーが発生しました。' });
    }
  }
};