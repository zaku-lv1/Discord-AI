const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const SHEET_NAME = 'シート1';
const TRY_MODELS = ['gemini-1.5-flash'];

// Google Sheets API クライアント取得ヘルパー関数
async function getSheetsClient(credentialsObject) {
    if (!credentialsObject || !credentialsObject.client_email) {
        throw new Error('Googleサービスアカウントの認証情報(オブジェクト)が無効です。');
    }
    const jwtClient = new JWT({
        email: credentialsObject.client_email,
        key: credentialsObject.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return google.sheets({ version: 'v4', auth: jwtClient });
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function tryModelsForTask(prompt, responseParser, taskName) {
    let lastError = null;
    for (const modelName of TRY_MODELS) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            let jsonToParse = response.text().trim().replace(/^```(json)?|```$/g, '').trim();
            return responseParser(jsonToParse, modelName);
        } catch (error) {
            console.warn(`[${modelName} - ${taskName}] での情報抽出に失敗: ${error.message}`);
            lastError = error;
        }
    }
    console.error(`全てのAIモデルでの情報抽出に失敗しました (${taskName})。`, lastError);
    return null;
}

async function extractScheduleInfoWithAI(userInput) {
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const todayStr = today.toISOString().slice(0, 10);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    const prompt = `あなたは優秀なスケジュールアシスタントです。ユーザーからの自然な文章を分析し、含まれている全ての予定をJSON形式の配列で抽出してください。\n# 厳守するべきルール\n1.  **出力形式**: 結果は必ずJSON配列 \`[{"type": "種別", "task": "内容", "due": "期限"}, ...]\` の形式で出力してください。説明や前置きは一切不要です。\n2.  **「内容(task)」の抽出**: 「内容(task)」は最も重要な項目です。ユーザー入力から、**何をするのか**を具体的に抜き出してください。もし内容が抽出できなければ、その予定は無効とみなし、結果に含めないでください。\n3.  **「種別(type)」の割り当て**: ユーザー入力に「宿題」「課題」「レポート」「提出」などの言葉があれば「課題」に、 「テスト」「試験」があれば「テスト」に分類してください。それ以外で明確な種別がなければ「その他」としてください。\n4.  **「期限(due)」の正規化**: 期限は必ず「YYYY-MM-DD」形式に変換してください。「今日」は \`${todayStr}\`、「明日」は \`${tomorrowStr}\` です。「来週の月曜日」のような表現も具体的な日付に変換してください。期限が不明または指定されていない場合は \`"未定"\` としてください。\n5.  **複数予定の認識**: 複数の予定が含まれている場合は、それぞれを個別のJSONオブジェクトとして認識してください。\n6.  **該当なしの場合**: 予定として認識できる情報が何もなければ、空の配列 \`[]\` のみを出力してください。\n\n# ユーザー入力\n"${userInput}"`;
    const parsedResult = await tryModelsForTask(prompt, (json) => JSON.parse(json), 'ScheduleAI');
    return Array.isArray(parsedResult) ? parsedResult : [];
}

async function extractDeletionTargetWithAI(userInput, currentSchedules) {
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    const todayStr = today.toISOString().slice(0, 10);
    const formattedSchedules = currentSchedules.map((item, index) => ({ index, type: item[0], task: item[1], due: item[2] }));
    const prompt = `あなたはタスク管理アシスタントです。以下の予定リストとユーザーの削除リクエストを照合し、削除対象となる予定のインデックス番号を特定してください。\n# ルール\n1.  ユーザーの入力に最も一致する予定をリストから見つけます。\n2.  結果は \`{"indicesToDelete": [index1, index2, ...], "reason": "AIの判断理由"}\` というJSON形式の文字列のみで出力してください。\n3.  削除対象が特定できない場合は、 \`indicesToDelete\` は空の配列 \`[]\` とし、 \`reason\` にその理由を記述してください。\n4.  今日の日付は \`${todayStr}\` です。\n# 予定リスト\n${JSON.stringify(formattedSchedules, null, 2)}\n# ユーザーの削除リクエスト\n"${userInput}"`;
    const parsedResult = await tryModelsForTask(prompt, (json) => JSON.parse(json), 'DeletionAI');
    return parsedResult || { indicesToDelete: [], reason: "AIモデルでの処理中にエラーが発生しました。" };
}

async function cleanupExpiredSchedules(sheets, sheetId) {
    const LIST_RANGE = `${SHEET_NAME}!A2:C`;
    let currentSchedules;
    try {
        const response = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: LIST_RANGE });
        currentSchedules = response.data.values || [];
        if (currentSchedules.length === 0) return 0;
    } catch (error) { return 0; }
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    const todayStr = today.toISOString().slice(0, 10);
    const formattedSchedules = currentSchedules.map((item, index) => ({ index, task: item[1] || 'N/A', due: item[2] || 'N/A' }));
    const prompt = `あなたはタスク管理システムの有能なアシスタントです。今日の日付は「${todayStr}」です。以下のルールに厳密に従って、提供された予定リストの中から「完全に期限が過ぎた」予定のインデックス番号のみを抽出してください。\n# ルール\n1. **期限切れの定義**: 予定の期限 (due) が、今日 (${todayStr}) より前の日付である場合のみ「期限切れ」とみなします。今日が期限のものは含めません。\n2. 未来の予定は除外します。\n3. 日付でない期限は除外します。\n# 指示\n結果は {"expiredIndices": [index1, index2, ...]} というJSON形式の文字列のみで出力してください。\n予定リスト:\n${JSON.stringify(formattedSchedules, null, 2)}`;
    const result = await tryModelsForTask(prompt, (json) => JSON.parse(json), 'ExpiredAI');
    const expiredIndices = result?.expiredIndices;
    if (!expiredIndices || expiredIndices.length === 0) return 0;
    const validSortedIndices = [...new Set(expiredIndices)].filter(idx => typeof idx === 'number' && idx >= 0 && idx < currentSchedules.length).sort((a, b) => b - a);
    if (validSortedIndices.length === 0) return 0;
    try {
        const spreadsheetInfo = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
        const sheet1 = spreadsheetInfo.data.sheets.find(s => s.properties.title === SHEET_NAME);
        if (!sheet1) return 0;
        const deleteRequests = validSortedIndices.map(index => ({ deleteDimension: { range: { sheetId: sheet1.properties.sheetId, dimension: 'ROWS', startIndex: index + 1, endIndex: index + 2 } } }));
        await sheets.spreadsheets.batchUpdate({ spreadsheetId: sheetId, resource: { requests: deleteRequests } });
        return deleteRequests.length;
    } catch (sheetError) { return 0; }
}

function createScheduleEmbed(scheduleItem, currentIndex, totalSchedules) {
    const [type, task, dueDate] = scheduleItem;
    return new EmbedBuilder().setTitle(`📝 ${type || 'N/A'} (${currentIndex + 1}/${totalSchedules})`).setColor(0x0099FF).addFields({ name: '内容', value: task || 'N/A' },{ name: '期限', value: dueDate || 'N/A' }).setTimestamp().setFooter({ text: `予定 ${currentIndex + 1} / ${totalSchedules}` });
}

function updateScheduleButtons(currentIndex, totalSchedules, schedulesExist) {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('schedule_previous').setLabel('前の予定').setStyle(ButtonStyle.Primary).setDisabled(currentIndex === 0 || !schedulesExist),
        new ButtonBuilder().setCustomId('schedule_next').setLabel('次の予定').setStyle(ButtonStyle.Primary).setDisabled(currentIndex >= totalSchedules - 1 || !schedulesExist),
        new ButtonBuilder().setCustomId('schedule_add_modal_trigger').setLabel('追加').setStyle(ButtonStyle.Success)
    );
    if (schedulesExist) {
        row.addComponents(
            new ButtonBuilder().setCustomId('schedule_edit_modal_trigger').setLabel('編集').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('schedule_delete_modal_trigger').setLabel('削除').setStyle(ButtonStyle.Danger)
        );
    }
    return row;
}

async function scheduleDailyReminder(client, db) {
    const logPrefix = '[定時リマインダー]';
    let settings;
    try {
        const settingsDoc = await db.collection('bot_settings').doc('schedule_settings').get();
        if (!settingsDoc.exists || !settingsDoc.data().remindersEnabled) return;
        settings = settingsDoc.data();
    } catch (error) { return; }

    const { googleSheetId, googleServiceAccountJson, reminderGuildId, reminderRoleId } = settings;
    if (!googleSheetId || !googleServiceAccountJson || !reminderGuildId || !reminderRoleId) return;
    
    console.log(`${logPrefix} 処理を開始します。`);
    const getTomorrowDateString = () => {
        const tomorrow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow.toISOString().slice(0, 10);
    };
    const tomorrowStr = getTomorrowDateString();
    
    let sheets;
    try {
        sheets = await getSheetsClient(googleServiceAccountJson);
    } catch (authError) { return; }

    let allSchedules;
    try {
        const response = await sheets.spreadsheets.values.get({ spreadsheetId: googleSheetId, range: `${SHEET_NAME}!A2:C` });
        allSchedules = response.data.values || [];
    } catch (error) { return; }
    
    const cleanedSchedules = allSchedules.map(row => ({ type: (row[0] || '').trim(), task: (row[1] || '').trim(), due: (row[2] || '').trim() })).filter(s => s.task);
    const homeworkDueTomorrow = cleanedSchedules.filter(s => s.due === tomorrowStr && s.type === '課題');
    if (homeworkDueTomorrow.length === 0) return;
    
    const reminderEmbed = new EmbedBuilder().setTitle(`📢 明日提出の宿題リマインダー (${tomorrowStr})`).setColor(0xFFB700).setDescription('以下の宿題が明日提出です。').setTimestamp().addFields(homeworkDueTomorrow.map(({ type, task }) => ({ name: `📝 ${task}`, value: `種別: ${type}` })));
    
    try {
        const guild = await client.guilds.fetch(reminderGuildId);
        const role = await guild.roles.fetch(reminderRoleId);
        if (!role) return;
        await guild.members.fetch();
        const membersWithRole = role.members;
        for (const member of membersWithRole.values()) {
            if (member.user.bot) continue;
            try { await member.send({ embeds: [reminderEmbed] }); }
            catch (dmError) { console.warn(`${logPrefix} ⚠️ ${member.user.tag} へのDM送信失敗`); }
        }
    } catch (error) { console.error(`${logPrefix} 送信処理中にエラー:`, error); }
}

module.exports = {
    data: new SlashCommandBuilder().setName('schedule').setDescription('予定を確認・追加・編集・削除します。(DB設定で動作)'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const db = interaction.client.db;
        const settingsDoc = await db.collection('bot_settings').doc('schedule_settings').get();
        if (!settingsDoc.exists) return interaction.editReply({ content: '❌ スケジュール機能の設定がデータベースに見つかりません。' });
        
        const settings = settingsDoc.data();
        const { googleSheetId, googleServiceAccountJson } = settings;
        if (!googleSheetId || !googleServiceAccountJson) return interaction.editReply({ content: '❌ Google Sheet IDまたはサービスアカウント情報が設定されていません。' });
        
        let sheets;
        try {
            sheets = await getSheetsClient(googleServiceAccountJson);
        } catch (authError) {
            return interaction.editReply({ content: '❌ Google APIへの認証に失敗しました。サービスアカウントのJSON情報が正しいか確認してください。' });
        }
        
        const deletedCount = await cleanupExpiredSchedules(sheets, googleSheetId);
        if (deletedCount > 0) {
            await interaction.followUp({ content: `🧹 自動クリーンアップを実行し、期限切れの予定を**${deletedCount}件**削除しました。`, ephemeral: true });
        }
        
        let schedules;
        try {
            const response = await sheets.spreadsheets.values.get({ spreadsheetId: googleSheetId, range: `${SHEET_NAME}!A2:C` });
            schedules = response.data.values || [];
        } catch (error) { return interaction.editReply({ content: '❌ スプレッドシートからの予定の読み込みに失敗しました。' }); }

        let currentIndex = 0;
        const totalSchedules = schedules.length;
        const schedulesExist = totalSchedules > 0;
        const initialEmbed = schedulesExist ? createScheduleEmbed(schedules[currentIndex], currentIndex, totalSchedules) : null;
        const initialRow = updateScheduleButtons(currentIndex, totalSchedules, schedulesExist);
        const replyOptions = { components: [initialRow] };
        if (initialEmbed) { replyOptions.embeds = [initialEmbed]; }
        else { replyOptions.content = '✅ 登録されている予定はありません。「追加」ボタンから新しい予定を登録できます。'; }
        
        const message = await interaction.editReply(replyOptions);
        const filter = i => i.user.id === interaction.user.id;
        const collector = message.createMessageComponentCollector({ filter, time: 300000 });

        collector.on('collect', async i => {
            try {
                const freshResponse = await sheets.spreadsheets.values.get({ spreadsheetId: googleSheetId, range: `${SHEET_NAME}!A2:C` });
                schedules = freshResponse.data.values || [];
                const currentTotal = schedules.length;
                const currentExist = currentTotal > 0;

                if (i.customId === 'schedule_add_modal_trigger') {
                    const modal = new ModalBuilder().setCustomId('schedule_add_text_modal').setTitle('新しい予定を文章で追加').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('schedule_text_input').setLabel('予定の詳細を文章で入力').setStyle(TextInputStyle.Paragraph).setRequired(true)));
                    return await i.showModal(modal);
                }
                if (i.customId === 'schedule_edit_modal_trigger') {
                    if (!currentExist || !schedules[currentIndex]) return await i.reply({ content: '編集対象の予定がありません。', ephemeral: true });
                    const [type, task, due] = schedules[currentIndex];
                    const modal = new ModalBuilder().setCustomId(`schedule_edit_modal_submit_${currentIndex}`).setTitle('予定を編集').addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('edit_type_input').setLabel('種別').setStyle(TextInputStyle.Short).setValue(type || '').setRequired(false)),
                        new ActionRowRowBuilder().addComponents(new TextInputBuilder().setCustomId('edit_task_input').setLabel('内容').setStyle(TextInputStyle.Paragraph).setValue(task || '').setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('edit_due_input').setLabel('期限').setStyle(TextInputStyle.Short).setValue(due || '').setRequired(false))
                    );
                    return await i.showModal(modal);
                }
                if (i.customId === 'schedule_delete_modal_trigger') {
                    const modal = new ModalBuilder().setCustomId('schedule_delete_text_modal').setTitle('削除する予定の情報を入力').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('schedule_delete_description_input').setLabel('削除したい予定の特徴を教えてください').setStyle(TextInputStyle.Paragraph).setRequired(true)));
                    return await i.showModal(modal);
                }
                
                if (i.customId === 'schedule_previous') {
                    if (currentExist) currentIndex = Math.max(0, currentIndex - 1);
                }
                if (i.customId === 'schedule_next') {
                    if (currentExist) currentIndex = Math.min(currentTotal - 1, currentIndex + 1);
                }

                const newEmbed = currentExist ? createScheduleEmbed(schedules[currentIndex], currentIndex, currentTotal) : null;
                const newRow = updateScheduleButtons(currentIndex, currentTotal, currentExist);
                const updateOptions = { components: [newRow] };
                if (newEmbed) { updateOptions.embeds = [newEmbed]; updateOptions.content = null; }
                else { updateOptions.embeds = []; updateOptions.content = '✅ 登録されている予定はありません。'; }
                await i.update(updateOptions);
            } catch (error) {
                if (error.code === 'InteractionAlreadyReplied') return;
                console.error('ボタン操作中のエラー:', error);
            }
        });
        collector.on('end', () => {
            const finalRow = updateScheduleButtons(currentIndex, schedules.length, schedules.length > 0);
            finalRow.components.forEach(button => button.setDisabled(true));
            if (message?.editable) message.edit({ components: [finalRow] }).catch(() => {});
        });
    },
    
    async handleScheduleModalSubmit(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const userInput = interaction.fields.getTextInputValue('schedule_text_input');
        const extractedSchedules = await extractScheduleInfoWithAI(userInput);
        if (!extractedSchedules || extractedSchedules.length === 0) return interaction.editReply({ content: '❌ AIが予定情報を抽出できませんでした。' });
        const valuesToAppend = extractedSchedules.map(({ type, task, due }) => task ? [type || 'その他', task, due || '未定'] : null).filter(Boolean);
        if (valuesToAppend.length === 0) return interaction.editReply({ content: '❌ 有効な予定を作成できませんでした。' });
        const db = interaction.client.db;
        const settingsDoc = await db.collection('bot_settings').doc('schedule_settings').get();
        if (!settingsDoc.exists) return interaction.editReply({ content: '❌ スケジュール設定が見つかりません。' });
        const { googleSheetId, googleServiceAccountJson } = settingsDoc.data();
        if (!googleSheetId || !googleServiceAccountJson) return interaction.editReply({ content: '❌ スケジュール設定に不備があります。' });
        try {
            const sheets = await getSheetsClient(googleServiceAccountJson);
            await sheets.spreadsheets.values.append({ spreadsheetId: googleSheetId, range: SHEET_NAME, valueInputOption: 'USER_ENTERED', resource: { values: valuesToAppend } });
            await interaction.editReply({ content: `✅ ${valuesToAppend.length}件の予定を追加しました！` });
        } catch (sheetError) { await interaction.editReply({ content: '❌ スプレッドシートへの予定追加中にエラーが発生しました。' }); }
    },

    async handleScheduleDeleteModal(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const userInput = interaction.fields.getTextInputValue('schedule_delete_description_input');
        const db = interaction.client.db;
        const settingsDoc = await db.collection('bot_settings').doc('schedule_settings').get();
        if (!settingsDoc.exists) return interaction.editReply({ content: '❌ スケジュール設定が見つかりません。' });
        const { googleSheetId, googleServiceAccountJson } = settingsDoc.data();
        if (!googleSheetId || !googleServiceAccountJson) return interaction.editReply({ content: '❌ スケジュール設定に不備があります。' });
        let sheets, currentSchedules;
        try {
            sheets = await getSheetsClient(googleServiceAccountJson);
            const response = await sheets.spreadsheets.values.get({ spreadsheetId: googleSheetId, range: `${SHEET_NAME}!A2:C` });
            currentSchedules = response.data.values || [];
            if (currentSchedules.length === 0) return interaction.editReply({ content: 'ℹ️ 削除対象の予定がありません。' });
        } catch (error) { return interaction.editReply({ content: '❌ スプレッドシートの読み込みに失敗しました。' }); }
        const { indicesToDelete, reason } = await extractDeletionTargetWithAI(userInput, currentSchedules);
        if (!indicesToDelete || indicesToDelete.length === 0) return interaction.editReply({ content: `❌ AIが削除対象を特定できませんでした。\n> **AIの理由:** ${reason || '不明'}` });
        const validSortedIndices = [...new Set(indicesToDelete)].filter(idx => typeof idx === 'number' && idx >= 0 && idx < currentSchedules.length).sort((a, b) => b - a);
        if (validSortedIndices.length === 0) return interaction.editReply({ content: `❌ 有効な削除対象が見つかりませんでした。` });
        try {
            const spreadsheetInfo = await sheets.spreadsheets.get({ spreadsheetId: googleSheetId });
            const sheet1 = spreadsheetInfo.data.sheets.find(s => s.properties.title === SHEET_NAME);
            const deleteRequests = validSortedIndices.map(index => ({ deleteDimension: { range: { sheetId: sheet1.properties.sheetId, dimension: 'ROWS', startIndex: index + 1, endIndex: index + 2 } } }));
            await sheets.spreadsheets.batchUpdate({ spreadsheetId: googleSheetId, resource: { requests: deleteRequests } });
            await interaction.editReply({ content: `✅ ${deleteRequests.length}件の予定を削除しました。` });
        } catch (sheetError) { await interaction.editReply({ content: '❌ スプレッドシートからの予定削除中にエラーが発生しました。' }); }
    },
    
    async handleScheduleEditModal(interaction, targetIndex) {
        await interaction.deferReply({ ephemeral: true });
        const newType = interaction.fields.getTextInputValue('edit_type_input').trim() || 'その他';
        const newTask = interaction.fields.getTextInputValue('edit_task_input').trim();
        const newDueRaw = interaction.fields.getTextInputValue('edit_due_input').trim() || '未定';
        if (!newTask) return interaction.editReply({ content: '❌ 「内容」は必須です。' });
        const extracted = await extractScheduleInfoWithAI(`${newType} ${newTask} ${newDueRaw}`);
        const newDue = (extracted.length > 0 && extracted[0].due) ? extracted[0].due : newDueRaw;
        const db = interaction.client.db;
        const settingsDoc = await db.collection('bot_settings').doc('schedule_settings').get();
        if (!settingsDoc.exists) return interaction.editReply({ content: '❌ スケジュール設定が見つかりません。' });
        const { googleSheetId, googleServiceAccountJson } = settingsDoc.data();
        if (!googleSheetId || !googleServiceAccountJson) return interaction.editReply({ content: '❌ スケジュール設定に不備があります。' });
        try {
            const sheets = await getSheetsClient(googleServiceAccountJson);
            await sheets.spreadsheets.values.update({
                spreadsheetId: googleSheetId, range: `'${SHEET_NAME}'!A${targetIndex + 2}:C${targetIndex + 2}`, valueInputOption: 'USER_ENTERED', resource: { values: [[newType, newTask, newDue]] },
            });
            await interaction.editReply({ content: `✅ 予定を更新しました。` });
        } catch (error) { await interaction.editReply({ content: '❌ スプレッドシートの予定更新中にエラーが発生しました。' }); }
    },
    
    getSheetsClient,
    scheduleDailyReminder
};