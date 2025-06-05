// =================================================================================
// 必要なモジュールとライブラリをインポート
// =================================================================================
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

// =================================================================================
// 定数と設定
// =================================================================================
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const SHEET_ID = GOOGLE_SHEET_ID || 'YOUR_FALLBACK_SHEET_ID';
const SHEET_NAME = 'シート1';
const LIST_RANGE = `${SHEET_NAME}!A2:C`;
const APPEND_RANGE = `${SHEET_NAME}!A:A`;

const TRY_MODELS = ['gemini-1.5-flash'];

// =================================================================================
// Google API 関連
// =================================================================================
async function getSheetsClient() {
    if (!GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON) {
        throw new Error('環境変数 "GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON" が設定されていません。');
    }
    const serviceAccountCreds = JSON.parse(GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON);
    const jwtClient = new JWT({
        email: serviceAccountCreds.client_email,
        key: serviceAccountCreds.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return google.sheets({ version: 'v4', auth: jwtClient });
}

// =================================================================================
// Gemini AI 関連
// =================================================================================
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

async function tryModelsForTask(prompt, responseParser, taskName) {
    let lastError = null;
    for (const modelName of TRY_MODELS) {
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

            return responseParser(jsonToParse, modelName, rawResponseText);
        } catch (error) {
            console.warn(`[${modelName} - ${taskName}] での情報抽出に失敗: ${error.message}`);
            lastError = error;
            if (error.message.includes('429') || error.message.includes('Quota') || error.message.includes('API key not valid')) {
                console.error(`[${modelName} - ${taskName}] APIエラー。処理を中断します。: ${error.message}`);
                break;
            }
        }
    }
    console.error(`全てのAIモデルでの情報抽出に失敗しました (${taskName})。`, lastError ? lastError.message : "不明なエラー");
    return null;
}

async function extractScheduleInfoWithAI(userInput) {
    const today = new Date();
    today.setHours(today.getHours() + 9);
    const todayStr = today.toISOString().slice(0, 10);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    
    const prompt = `ユーザー入力を分析し、全予定の「種別」「内容」「期限」を抽出してください。複数予定も個別に認識します。種別がない場合は「課題」「テスト」「その他」から選んでください。漢数字は半角に直し、内容は簡潔に。「今日」は${todayStr}、「明日」は${tomorrow}とし、期限はYYYY-MM-DD形式に正規化してください。結果はJSON配列形式で出力し、他説明は不要です。該当なしは空配列 [] を返します。\nユーザー入力: "${userInput}"`;

    const parsedResult = await tryModelsForTask(prompt, (json) => JSON.parse(json), 'ScheduleAI');
    return Array.isArray(parsedResult) ? parsedResult : [];
}

async function extractDeletionTargetWithAI(userInput, currentSchedules) {
    const today = new Date();
    today.setHours(today.getHours() + 9);
    const todayStr = today.toISOString().slice(0, 10);
    const formattedSchedules = currentSchedules.map((item, index) => ({ index, type: item[0], task: item[1], due: item[2] }));

    const prompt = `予定リストからユーザーが削除したい予定のインデックスを抽出してください。日付は今日(${todayStr})を基準に解釈してください。結果は {"indicesToDelete": [index1,...], "reason": "理由"} のJSON形式で出力してください。特定できない場合はreasonに記述し、indicesToDeleteは空にします。他の説明は不要です。\n予定リスト: ${JSON.stringify(formattedSchedules)}\nユーザーの削除リクエスト: "${userInput}"`;
    
    const parsedResult = await tryModelsForTask(prompt, (json) => JSON.parse(json), 'DeletionAI');
    return parsedResult || { indicesToDelete: [], reason: "AIモデルでの処理中にエラーが発生しました。" };
}

/**
 * 【自動クリーンアップ用】期限切れの予定を削除する。
 * @param {import('googleapis').sheets_v4.Sheets} sheets - Google Sheets APIクライアント。
 * @returns {Promise<number>} 削除した予定の件数。
 */
async function cleanupExpiredSchedules(sheets) {
    let currentSchedules;
    try {
        const response = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: LIST_RANGE });
        currentSchedules = response.data.values || [];
        if (currentSchedules.length === 0) return 0;
    } catch (error) {
        console.error('クリーンアップのための予定読み込みエラー:', error);
        return 0;
    }

    const today = new Date();
    today.setHours(today.getHours() + 9); // JST
    const todayStr = today.toISOString().slice(0, 10);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const formattedSchedules = currentSchedules.map((item, index) => ({
        index,
        task: item[1] || 'N/A',
        due: item[2] || 'N/A',
    }));

    // 【重要】AIへの指示をより厳密に修正
    const prompt = `
あなたはタスク管理システムの有能なアシスタントです。
今日の日付は「${todayStr}」です。

以下のルールに厳密に従って、提供された予定リストの中から「完全に期限が過ぎた」予定のインデックス番号のみを抽出してください。

# ルール
1.  **期限切れの定義**: 予定の期限 (due) が、今日 (${todayStr}) またはそれより前の日付である場合のみ「期限切れ」とみなします。
2.  **未来の予定は除外**: 期限が明日以降（例: '${tomorrow}', '来週', '2025-12-31'）の予定は、絶対に「期限切れ」に含めないでください。
3.  **日付でない期限は除外**: 期限が「未定」「いつでも」「不明」のような、特定の日付として解釈できない文字列の場合は、絶対に「期限切れ」に含めないでください。
4.  **安全第一**: 少しでも期限切れかどうかの判断に迷う場合は、その予定を「期限切れ」に含めないでください。間違って未来の予定を削除しないことが最優先です。

# 例 (今日が ${todayStr} の場合)
- \`{"task": "レポート提出", "due": "${todayStr}"}\` -> 期限切れ (OK)
- \`{"task": "古い宿題", "due": "2025-06-01"}\` -> 期限切れ (OK)
- \`{"task": "明日の準備", "due": "${tomorrow}"}\` -> 期限切れではない (NG)
- \`{"task": "来週のテスト", "due": "来週の月曜"}\` -> 期限切れではない (NG)
- \`{"task": "買い物", "due": "未定"}\` -> 期限切れではない (NG)

# 指示
上記のルールに基づき、以下の予定リストから期限切れのインデックスを抽出してください。
結果は {"expiredIndices": [index1, index2, ...]} というJSON形式の文字列のみで出力してください。他の説明や前置きは一切不要です。

予定リスト:
${JSON.stringify(formattedSchedules, null, 2)}
`;

    const result = await tryModelsForTask(prompt, (json) => JSON.parse(json), 'ExpiredAI');
    const expiredIndices = result?.expiredIndices;

    // --- デバッグ用ログ ---
    if (expiredIndices && expiredIndices.length > 0) {
        console.log('[DEBUG] AIが期限切れと判断したインデックス:', expiredIndices);
        expiredIndices.forEach(index => {
            if (currentSchedules[index]) {
                console.log(`[DEBUG] 削除対象の予定 (${index}):`, currentSchedules[index].join(' | '));
            }
        });
    }
    // --------------------

    if (!expiredIndices || expiredIndices.length === 0) return 0;

    const validSortedIndices = [...new Set(expiredIndices)]
        .filter(idx => typeof idx === 'number' && idx >= 0 && idx < currentSchedules.length)
        .sort((a, b) => b - a);
    
    if (validSortedIndices.length === 0) return 0;

    try {
        const spreadsheetInfo = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
        const sheet1 = spreadsheetInfo.data.sheets.find(s => s.properties.title === SHEET_NAME);
        const targetSheetGid = sheet1?.properties?.sheetId ?? 0;
        const deleteRequests = validSortedIndices.map(index => ({
            deleteDimension: { range: { sheetId: targetSheetGid, dimension: 'ROWS', startIndex: index + 1, endIndex: index + 2 } },
        }));
        await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, resource: { requests: deleteRequests } });
        return deleteRequests.length;
    } catch (sheetError) {
        console.error('スプレッドシートからの期限切れ予定削除エラー:', sheetError.errors || sheetError.message);
        return 0;
    }
}

// =================================================================================
// Discord UI 関連 (以下、変更なし)
// =================================================================================

function createScheduleEmbed(scheduleItem, currentIndex, totalSchedules) {
    const [type, task, dueDate] = scheduleItem;
    return new EmbedBuilder()
        .setTitle(`📝 ${type || 'N/A'} (${currentIndex + 1}/${totalSchedules})`)
        .setColor(0x0099FF)
        .addFields(
            { name: '内容', value: task || 'N/A', inline: false },
            { name: '期限', value: dueDate || 'N/A', inline: false }
        )
        .setTimestamp()
        .setFooter({ text: `予定 ${currentIndex + 1} / ${totalSchedules}` });
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

// =================================================================================
// メインコマンド
// =================================================================================
module.exports = {
    data: new SlashCommandBuilder()
        .setName('schedule')
        .setDescription('予定を確認・追加・編集・削除します。(期限切れは自動削除されます)'),

    async execute(interaction) {
        if (!interaction.inGuild()) {
            return interaction.reply({ content: 'このコマンドはサーバー内でのみ使用できます。', ephemeral: true });
        }

        await interaction.deferReply();
        let sheets;
        try {
            sheets = await getSheetsClient();
        } catch (authError) {
            console.error('Google API認証エラー:', authError);
            return interaction.editReply({ content: '❌ Google APIへの認証に失敗しました。設定を確認してください。' });
        }

        // --- 自動クリーンアップを実行 ---
        const deletedCount = await cleanupExpiredSchedules(sheets);
        if (deletedCount > 0) {
            await interaction.followUp({ content: `🧹 自動クリーンアップを実行し、期限切れの予定を**${deletedCount}件**削除しました。`, ephemeral: true });
        }

        // --- 最新の予定リストを取得して表示 ---
        let schedules;
        try {
            const response = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: LIST_RANGE });
            schedules = response.data.values || [];
        } catch (error) {
            console.error('スプレッドシートからの予定読み込みエラー:', error);
            return interaction.editReply({ content: '❌ スプレッドシートからの予定の読み込みに失敗しました。' });
        }

        let currentIndex = 0;
        const totalSchedules = schedules.length;
        const schedulesExist = totalSchedules > 0;

        const initialEmbed = schedulesExist ? createScheduleEmbed(schedules[currentIndex], currentIndex, totalSchedules) : null;
        const initialRow = updateScheduleButtons(currentIndex, totalSchedules, schedulesExist);
        
        const replyOptions = { components: [initialRow] };
        if (initialEmbed) {
            replyOptions.embeds = [initialEmbed];
        } else {
            replyOptions.content = '✅ 登録されている予定はありません。「追加」ボタンから新しい予定を登録できます。';
        }
        
        const message = await interaction.editReply(replyOptions);
        
        const filter = i => i.user.id === interaction.user.id;
        const collector = message.createMessageComponentCollector({ filter, time: 300000 });

        collector.on('collect', async i => {
            try {
                // ボタン操作時にも最新のリストを再取得
                const freshResponse = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: LIST_RANGE });
                schedules = freshResponse.data.values || [];
                const currentTotal = schedules.length;
                const currentExist = currentTotal > 0;

                const actionHandlers = {
                    'schedule_previous': () => {
                        if (!currentExist) return;
                        currentIndex = Math.max(0, currentIndex - 1);
                    },
                    'schedule_next': () => {
                        if (!currentExist) return;
                        currentIndex = Math.min(currentTotal - 1, currentIndex + 1);
                    },
                    'schedule_add_modal_trigger': async () => {
                        const modal = new ModalBuilder().setCustomId('schedule_add_text_modal').setTitle('新しい予定を文章で追加');
                        const input = new TextInputBuilder().setCustomId('schedule_text_input').setLabel('予定の詳細を文章で入力').setStyle(TextInputStyle.Paragraph).setPlaceholder('例:\n・明日の数学の宿題 P10-15\n・国語の音読 来週月曜まで').setRequired(true);
                        modal.addComponents(new ActionRowBuilder().addComponents(input));
                        return i.showModal(modal);
                    },
                    'schedule_edit_modal_trigger': async () => {
                        if (!currentExist || !schedules[currentIndex]) return i.reply({ content: '編集対象の予定がありません。', ephemeral: true });
                        const [type, task, due] = schedules[currentIndex];
                        const modal = new ModalBuilder().setCustomId(`schedule_edit_modal_submit_${currentIndex}`).setTitle('予定を編集');
                        modal.addComponents(
                            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('edit_type_input').setLabel('種別').setStyle(TextInputStyle.Short).setValue(type || '').setRequired(false)),
                            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('edit_task_input').setLabel('内容').setStyle(TextInputStyle.Paragraph).setValue(task || '').setRequired(true)),
                            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('edit_due_input').setLabel('期限').setStyle(TextInputStyle.Short).setValue(due || '').setRequired(false))
                        );
                        return i.showModal(modal);
                    },
                    'schedule_delete_modal_trigger': async () => {
                        const modal = new ModalBuilder().setCustomId('schedule_delete_text_modal').setTitle('削除する予定の情報を入力');
                        const input = new TextInputBuilder().setCustomId('schedule_delete_description_input').setLabel('削除したい予定の特徴を教えてください').setStyle(TextInputStyle.Paragraph).setPlaceholder('例: 「数学の宿題」と「来週のレポート」').setRequired(true);
                        modal.addComponents(new ActionRowBuilder().addComponents(input));
                        return i.showModal(modal);
                    }
                };

                const handler = actionHandlers[i.customId];
                if (typeof handler === 'function') {
                    const modalResult = await handler();
                    if (modalResult) return; // モーダル表示時は更新しない
                }

                const newEmbed = currentExist ? createScheduleEmbed(schedules[currentIndex], currentIndex, currentTotal) : null;
                const newRow = updateScheduleButtons(currentIndex, currentTotal, currentExist);
                const updateOptions = { components: [newRow] };
                if (newEmbed) {
                    updateOptions.embeds = [newEmbed];
                    updateOptions.content = null;
                } else {
                    updateOptions.embeds = [];
                    updateOptions.content = '✅ 登録されている予定はありません。「追加」ボタンから新しい予定を登録できます。';
                }
                await i.update(updateOptions);

            } catch (error) {
                console.error('ボタン操作中のエラー:', error);
                if (!i.replied && !i.deferred) await i.reply({ content: '⚠️ ボタンの処理中にエラーが発生しました。', ephemeral: true }).catch(console.error);
            }
        });

        collector.on('end', () => {
            const finalRow = updateScheduleButtons(currentIndex, schedules.length, schedulesExist);
            finalRow.components.forEach(button => button.setDisabled(true));
            if (message?.editable) message.edit({ components: [finalRow] }).catch(() => {});
        });
    },
    
    // =================================================================================
    // モーダル処理
    // =================================================================================
    
    async handleScheduleModalSubmit(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const userInput = interaction.fields.getTextInputValue('schedule_text_input');
        const extractedSchedules = await extractScheduleInfoWithAI(userInput);

        if (!extractedSchedules || extractedSchedules.length === 0) {
            return interaction.editReply({ content: '❌ AIが予定情報を抽出できませんでした。より具体的に入力してください。\n例: 「明日の国語の音読」と「金曜日までの数学ドリルP5」' });
        }

        const valuesToAppend = extractedSchedules.map(({ type, task, due }) => task ? [type || 'その他', task, due || '不明'] : null).filter(Boolean);
        if (valuesToAppend.length === 0) {
            return interaction.editReply({ content: '❌ 有効な予定を作成できませんでした。「内容」は必須です。' });
        }

        try {
            const sheets = await getSheetsClient();
            await sheets.spreadsheets.values.append({
                spreadsheetId: SHEET_ID, range: APPEND_RANGE, valueInputOption: 'USER_ENTERED', resource: { values: valuesToAppend },
            });
            await interaction.editReply({ content: `✅ ${valuesToAppend.length}件の予定を追加しました！\nリストを更新するには、再度 \`/schedule\` コマンドを実行してください。` });
        } catch (sheetError) {
            console.error('スプレッドシートへの追記エラー:', sheetError);
            await interaction.editReply({ content: '❌ スプレッドシートへの予定追加中にエラーが発生しました。' });
        }
    },

    async handleScheduleDeleteModal(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const userInput = interaction.fields.getTextInputValue('schedule_delete_description_input');
        let sheets, currentSchedules;

        try {
            sheets = await getSheetsClient();
            const response = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: LIST_RANGE });
            currentSchedules = response.data.values || [];
            if (currentSchedules.length === 0) return interaction.editReply({ content: 'ℹ️ 削除対象の予定がありません。' });
        } catch (error) {
            return interaction.editReply({ content: '❌ スプレッドシートからの予定読み込みに失敗しました。' });
        }

        const { indicesToDelete, reason } = await extractDeletionTargetWithAI(userInput, currentSchedules);
        if (!indicesToDelete || indicesToDelete.length === 0) {
            return interaction.editReply({ content: `❌ AIが削除対象を特定できませんでした。\n> **AIからの理由:** ${reason || '不明'}` });
        }
        
        const validSortedIndices = [...new Set(indicesToDelete)].filter(idx => typeof idx === 'number' && idx >= 0 && idx < currentSchedules.length).sort((a, b) => b - a);
        if (validSortedIndices.length === 0) {
            return interaction.editReply({ content: `❌ 有効な削除対象が見つかりませんでした。` });
        }

        try {
            const spreadsheetInfo = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
            const sheet1 = spreadsheetInfo.data.sheets.find(s => s.properties.title === SHEET_NAME);
            const deleteRequests = validSortedIndices.map(index => ({ deleteDimension: { range: { sheetId: sheet1.properties.sheetId, dimension: 'ROWS', startIndex: index + 1, endIndex: index + 2 } } }));
            await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, resource: { requests: deleteRequests } });
            await interaction.editReply({ content: `✅ ${deleteRequests.length}件の予定を削除しました。\n再度 \`/schedule\` を実行してリストを更新してください。` });
        } catch (sheetError) {
            console.error('スプレッドシートからの複数予定削除エラー:', sheetError.errors || sheetError.message);
            await interaction.editReply({ content: '❌ スプレッドシートからの予定削除中にエラーが発生しました。' });
        }
    },
    
    async handleScheduleEditModal(interaction, targetIndex) {
        await interaction.deferReply({ ephemeral: true });
        const newType = interaction.fields.getTextInputValue('edit_type_input').trim() || 'その他';
        const newTask = interaction.fields.getTextInputValue('edit_task_input').trim();
        const newDueRaw = interaction.fields.getTextInputValue('edit_due_input').trim() || '不明';

        if (!newTask) return interaction.editReply({ content: '❌ 「内容」は必須です。' });
        
        const extracted = await extractScheduleInfoWithAI(`${newType} ${newTask} ${newDueRaw}`);
        const newDue = (extracted.length > 0 && extracted[0].due) ? extracted[0].due : newDueRaw;

        try {
            const sheets = await getSheetsClient();
            await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID, range: `'${SHEET_NAME}'!A${targetIndex + 2}:C${targetIndex + 2}`, valueInputOption: 'USER_ENTERED', resource: { values: [[newType, newTask, newDue]] },
            });
            await interaction.editReply({ content: `✅ 予定を更新しました。\n再度 \`/schedule\` を実行してリストを更新してください。` });
        } catch (error) {
            console.error('スプレッドシートの予定更新エラー:', error);
            await interaction.editReply({ content: '❌ スプレッドシートの予定更新中にエラーが発生しました。' });
        }
    }
};