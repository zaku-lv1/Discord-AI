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
// .envファイルから環境変数を読み込む
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// スプレッドシートの定義
const SHEET_ID = GOOGLE_SHEET_ID || 'YOUR_FALLBACK_SHEET_ID'; // フォールバックIDを設定
const LIST_RANGE = 'シート1!A2:C'; // 予定を一覧取得する範囲
const APPEND_RANGE = 'シート1!A:A'; // 予定を追記する範囲

// 使用するAIモデルのリスト
const TRY_MODELS = ['gemini-1.5-flash', 'gemini-1.5-pro'];

// =================================================================================
// Google API 関連
// =================================================================================

/**
 * Google Sheets APIの認証済みクライアントを取得します。
 * @returns {Promise<import('googleapis').sheets_v4.Sheets>} Google Sheets APIクライアント
 * @throws {Error} 認証情報が設定されていない場合にエラーをスローします。
 */
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
// Gemini AI 関連 (予定の抽出・削除)
// =================================================================================

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

/**
 * AIモデルを順に試行し、特定のタスクを実行する汎用ヘルパー関数。
 * @param {string[]} models - 試行するAIモデル名の配列。
 * @param {string} prompt - AIに送信するプロンプト。
 * @param {Function} responseParser - AIの応答をパースして検証する関数。
 * @param {string} taskName - ログ出力用のタスク名 (例: 'ScheduleAI')。
 * @returns {Promise<any>} パースされたAIの応答。失敗した場合はデフォルト値を返す。
 */
async function tryModelsForTask(models, prompt, responseParser, taskName) {
    let lastError = null;
    for (const modelName of models) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const rawResponseText = response.text().trim();
            
            // JSON部分を抽出
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
            // APIキーエラーや割り当て超過の場合はループを中断
            if (error.message.includes('429') || error.message.includes('Quota') || error.message.includes('API key not valid')) {
                console.error(`[${modelName} - ${taskName}] APIエラー。処理を中断します。: ${error.message}`);
                break;
            }
        }
    }
    console.error(`全てのAIモデルでの情報抽出に失敗しました (${taskName})。`, lastError ? lastError.message : "不明なエラー");
    return null; // 失敗時はnullを返す
}

/**
 * ユーザー入力から予定情報を抽出し、常に予定オブジェクトの配列で返します。
 * @param {string} userInput - ユーザーが入力したテキスト。
 * @returns {Promise<Array<{type: string, task: string, due: string}>>} 抽出された予定情報の配列。
 */
async function extractScheduleInfoWithAI(userInput) {
    const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
    
    const prompt = `
        以下のユーザー入力を分析し、含まれる全ての予定について「種別」「内容」「期限」を抽出してください。
        ユーザーが複数の予定を記述している場合（例：改行区切り、箇条書き、「と」「や」での接続など）、それぞれを個別の予定として認識してください。
        種別の記述がない場合は「課題」「テスト」「その他」の中から考えて選んでください。
        漢数字はすべて半角算用数字に書き換えること。内容は冗長にならないように気をつけること。
        「明日」「明後日」は今日 (${today}) からの日付で期限を考えてください。
        結果は必ず以下のJSON形式の文字列（予定オブジェクトの配列）で出力してください。単一の予定の場合でも、要素数1の配列としてください。
        他の説明や前置きは一切不要です。抽出できる予定がない場合は空の配列 "[]" を返してください。

        例1 (単一予定):
        ユーザー入力: "明日の数学の宿題 P10-15"
        出力: [{"type": "宿題", "task": "数学 P10-15", "due": "${tomorrow}"}]

        例2 (複数予定):
        ユーザー入力: "国語の教科書を読む 明日まで。あと、来週の月曜に英語の単語テスト"
        出力: [{"type": "課題", "task": "国語の教科書を読む", "due": "${tomorrow}"}, {"type": "テスト", "task": "英語の単語テスト", "due": "来週の月曜日"}]

        ユーザー入力: "${userInput}"
    `;

    const parsedResult = await tryModelsForTask(TRY_MODELS, prompt, (json, modelName, rawText) => {
        if (json.startsWith('[') && json.endsWith(']')) {
            try {
                const parsedArray = JSON.parse(json);
                if (Array.isArray(parsedArray)) return parsedArray;
                console.warn(`[${modelName} - ScheduleAI] AIの応答がJSON配列形式ではありません（パース後）: ${json}`);
            } catch (e) {
                console.warn(`[${modelName} - ScheduleAI] JSON配列のパースに失敗: ${e.message}. 応答: ${rawText}`);
            }
        } else {
             console.warn(`[${modelName} - ScheduleAI] AIの応答がJSON配列形式ではありません: ${json}. 応答: ${rawText}`);
        }
        return null;
    }, 'ScheduleAI');

    return parsedResult || []; // 失敗時は空配列を返す
}

/**
 * ユーザー入力と現在の予定リストから、削除対象のインデックスを特定します。
 * @param {string} userInput - ユーザーが入力した削除リクエスト。
 * @param {Array<Array<string>>} currentSchedules - 現在の予定リスト (スプレッドシートから取得したままの形式)。
 * @returns {Promise<{indicesToDelete: number[], reason: string}>} 削除対象のインデックス配列と理由。
 */
async function extractDeletionTargetWithAI(userInput, currentSchedules) {
    const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const formattedSchedules = currentSchedules.map((item, index) => ({
        index,
        type: item[0] || 'N/A',
        task: item[1] || 'N/A',
        due: item[2] || 'N/A',
    }));

    const prompt = `
        以下の予定リストの中から、ユーザーが削除したい全ての予定を特定し、0始まりのインデックス番号を抽出してください。
        ユーザー入力の日付表現（「明日」など）は、今日が ${today} であることを考慮して解釈してください。
        結果は必ず以下のJSON形式で出力してください。
        - "indicesToDelete": 抽出したインデックスの配列。
        - "reason": インデックスが特定できなかった場合の理由や補足情報（日本語）。特定できた場合は不要。
        ユーザーが指定した予定がリストにない場合や曖昧な場合も、reasonに記述してください。
        特定できる予定がない場合は "indicesToDelete" は空の配列 [] としてください。他の説明や前置きは一切不要です。

        予定リスト: ${JSON.stringify(formattedSchedules, null, 2)}
        ユーザーの削除リクエスト: "${userInput}"
        JSON出力: {"indicesToDelete": [index1, index2, ...], "reason": "理由や補足"}
    `;
    
    const parsedResult = await tryModelsForTask(TRY_MODELS, prompt, (json, modelName, rawText) => {
        if (json.startsWith('{') && json.endsWith('}')) {
            try {
                const parsed = JSON.parse(json);
                if (!Array.isArray(parsed.indicesToDelete)) {
                    console.warn(`[${modelName} - DeletionAI] indicesToDeleteが配列ではありません。応答: ${rawText}`);
                    parsed.indicesToDelete = [];
                    if (!parsed.reason) parsed.reason = "AIの応答でindicesToDeleteが配列形式ではありませんでした。";
                }
                return parsed;
            } catch (e) {
                console.warn(`[${modelName} - DeletionAI] JSONのパースに失敗: ${e.message}. 応答: ${rawText}`);
            }
        } else {
            console.warn(`[${modelName} - DeletionAI] AIの応答がJSON形式ではありません: ${json}. 応答: ${rawText}`);
        }
        return null;
    }, 'DeletionAI');

    return parsedResult || { indicesToDelete: [], reason: "AIモデルでの処理中にエラーが発生しました。" };
}


// =================================================================================
// Discord UI 関連 (Embed, Button)
// =================================================================================

/**
 * 1件の予定情報からDiscord用のEmbedを作成します。
 * @param {Array<string>} scheduleItem - [種別, 内容, 期限] の予定データ。
 * @param {number} currentIndex - 現在表示している予定のインデックス。
 * @param {number} totalSchedules - 全予定数。
 * @returns {EmbedBuilder} 作成されたEmbedオブジェクト。
 */
function createScheduleEmbed(scheduleItem, currentIndex, totalSchedules) {
    const [type, task, dueDate] = [scheduleItem[0] || 'N/A', scheduleItem[1] || 'N/A', scheduleItem[2] || 'N/A'];
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
 * 現在の状態に基づいてナビゲーションボタン（ActionRow）を作成・更新します。
 * @param {number} currentIndex - 現在表示している予定のインデックス。
 * @param {number} totalSchedules - 全予定数。
 * @param {boolean} schedulesExist - 予定が1件以上存在するかどうか。
 * @returns {ActionRowBuilder<ButtonBuilder>} 作成されたActionRowオブジェクト。
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
    return row;
}

// =================================================================================
// メインコマンド (/schedule)
// =================================================================================
module.exports = {
    data: new SlashCommandBuilder()
        .setName('schedule')
        .setDescription('登録されている予定をボタンで確認・追加・編集・削除します。'),

    /**
     * /schedule コマンドのメイン処理。
     * @param {import('discord.js').ChatInputCommandInteraction} interaction - Discordインタラクションオブジェクト。
     */
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
            console.error('Google API認証エラー (Schedule View):', authError);
            await interaction.editReply({ content: '❌ Google APIへの認証に失敗しました。設定を確認してください。' });
            return;
        }

        let schedules = [];
        try {
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SHEET_ID,
                range: LIST_RANGE,
            });
            schedules = response.data.values || [];
        } catch (error) {
            console.error('スプレッドシートからの予定読み込みエラー:', error);
            await interaction.editReply({ content: '❌ スプレッドシートからの予定の読み込みに失敗しました。' });
            return;
        }

        let currentIndex = 0;
        const totalSchedules = schedules.length;
        const schedulesExist = totalSchedules > 0;

        // 初期表示のEmbedとボタンを準備
        const initialEmbed = schedulesExist ? createScheduleEmbed(schedules[currentIndex], currentIndex, totalSchedules) : null;
        const initialRow = updateScheduleButtons(currentIndex, totalSchedules, schedulesExist);
        
        const replyOptions = { components: [initialRow] };
        if (initialEmbed) {
            replyOptions.embeds = [initialEmbed];
        } else {
            replyOptions.content = 'ℹ️ 登録されている予定はありません。「追加」ボタンから新しい予定を登録できます。';
        }
        
        const message = await interaction.editReply(replyOptions);
        
        // --- ボタン操作のコレクターを設定 ---
        const filter = (i) => {
            if (!i.isButton()) return false;
            if (i.user.id !== interaction.user.id) {
                i.reply({ content: 'このボタンはコマンドの実行者のみ操作できます。', ephemeral: true });
                return false;
            }
            return true; // IDチェックはコレクター内で行う
        };

        const collector = message.createMessageComponentCollector({ filter, time: 300000 }); // 5分間

        collector.on('collect', async (i) => {
            try {
                const actionHandlers = {
                    'schedule_previous': async () => {
                        if (!schedulesExist) return;
                        currentIndex = Math.max(0, currentIndex - 1);
                        const newEmbed = createScheduleEmbed(schedules[currentIndex], currentIndex, totalSchedules);
                        const newRow = updateScheduleButtons(currentIndex, totalSchedules, schedulesExist);
                        await i.update({ embeds: [newEmbed], components: [newRow] });
                    },
                    'schedule_next': async () => {
                        if (!schedulesExist) return;
                        currentIndex = Math.min(totalSchedules - 1, currentIndex + 1);
                        const newEmbed = createScheduleEmbed(schedules[currentIndex], currentIndex, totalSchedules);
                        const newRow = updateScheduleButtons(currentIndex, totalSchedules, schedulesExist);
                        await i.update({ embeds: [newEmbed], components: [newRow] });
                    },
                    'schedule_add_modal_trigger': async () => {
                         const modal = new ModalBuilder()
                            .setCustomId('schedule_add_text_modal')
                            .setTitle('新しい予定を文章で追加');
                        const scheduleInput = new TextInputBuilder()
                            .setCustomId('schedule_text_input')
                            .setLabel('予定の詳細を文章で入力')
                            .setStyle(TextInputStyle.Paragraph)
                            .setPlaceholder('例:\n・明日の数学の宿題 P10-15\n・国語の音読 来週月曜まで')
                            .setRequired(true);
                        modal.addComponents(new ActionRowBuilder().addComponents(scheduleInput));
                        await i.showModal(modal);
                    },
                    'schedule_edit_modal_trigger': async () => {
                        if (!schedulesExist || !schedules[currentIndex]) {
                            await i.reply({ content: '編集対象の予定がありません。', ephemeral: true });
                            return;
                        }
                        const currentSchedule = schedules[currentIndex];
                        const [type, task, due] = [currentSchedule[0] || '', currentSchedule[1] || '', currentSchedule[2] || ''];

                        const editModal = new ModalBuilder()
                            .setCustomId(`schedule_edit_modal_submit_${currentIndex}`) // インデックスをIDに含める
                            .setTitle('予定を編集');
                        editModal.addComponents(
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder().setCustomId('edit_type_input').setLabel('種別').setStyle(TextInputStyle.Short).setValue(type).setPlaceholder('例: 課題, テスト').setRequired(false)
                            ),
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder().setCustomId('edit_task_input').setLabel('内容').setStyle(TextInputStyle.Paragraph).setValue(task).setPlaceholder('例: 数学の宿題 P10-15').setRequired(true)
                            ),
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder().setCustomId('edit_due_input').setLabel('期限').setStyle(TextInputStyle.Short).setValue(due).setPlaceholder('例: 明日, 2024-12-31').setRequired(false)
                            )
                        );
                        await i.showModal(editModal);
                    },
                    'schedule_delete_modal_trigger': async () => {
                        const deleteModal = new ModalBuilder()
                            .setCustomId('schedule_delete_text_modal')
                            .setTitle('削除する予定の情報を入力');
                        const deleteInput = new TextInputBuilder()
                            .setCustomId('schedule_delete_description_input')
                            .setLabel('削除したい予定の特徴を教えてください')
                            .setStyle(TextInputStyle.Paragraph)
                            .setPlaceholder('例: 「数学の宿題」と「来週のレポート」')
                            .setRequired(true);
                        deleteModal.addComponents(new ActionRowBuilder().addComponents(deleteInput));
                        await i.showModal(deleteModal);
                    }
                };

                const handler = actionHandlers[i.customId];
                if (handler) {
                    await handler();
                } else {
                    await i.deferUpdate().catch(console.error);
                }

            } catch (error) {
                console.error('ボタン操作中のエラー:', error);
                if (i.isRepliable() && !i.replied && !i.deferred) {
                    await i.reply({ content: '⚠️ ボタンの処理中にエラーが発生しました。', ephemeral: true }).catch(console.error);
                } else if(i.isRepliable()) {
                    await i.followUp({ content: '⚠️ ボタンの処理中にエラーが発生しました。', ephemeral: true }).catch(console.error);
                }
            }
        });

        collector.on('end', () => {
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

    // =================================================================================
    // モーダル処理
    // =================================================================================
    
    /**
     * [追加]モーダルからの送信を処理します。
     * @param {import('discord.js').ModalSubmitInteraction} modalInteraction - モーダル送信インタラクション。
     */
    async handleScheduleModalSubmit(modalInteraction) {
        await modalInteraction.deferReply({ ephemeral: true });
        const userInput = modalInteraction.fields.getTextInputValue('schedule_text_input');
        const extractedSchedules = await extractScheduleInfoWithAI(userInput);

        if (!extractedSchedules || extractedSchedules.length === 0) {
            await modalInteraction.editReply({ content: '❌ AIが予定情報を抽出できませんでした。入力形式を確認し、より具体的に入力してください。\n例: 「明日の国語の音読」と「金曜日までの数学ドリルP5」' });
            return;
        }

        let sheets;
        try {
            sheets = await getSheetsClient();
        } catch (authError) {
            console.error('Google API認証エラー (Modal Add):', authError);
            await modalInteraction.editReply({ content: '❌ Google API認証に失敗しました。' });
            return;
        }

        const valuesToAppend = extractedSchedules
            .map(({ type = '未分類', task, due = '不明' }) => task ? [type, task, due] : null)
            .filter(Boolean); // 不正なデータを除外

        if (valuesToAppend.length === 0) {
            await modalInteraction.editReply({ content: '❌ 有効な予定を作成できませんでした。「内容」は必須です。' });
            return;
        }

        try {
            await sheets.spreadsheets.values.append({
                spreadsheetId: SHEET_ID,
                range: APPEND_RANGE,
                valueInputOption: 'USER_ENTERED',
                resource: { values: valuesToAppend },
            });
            await modalInteraction.editReply({ content: `✅ ${valuesToAppend.length}件の予定を追加しました！\nリストを更新するには、再度 \`/schedule\` コマンドを実行してください。` });
        } catch (sheetError) {
            console.error('スプレッドシートへの追記エラー:', sheetError);
            await modalInteraction.editReply({ content: '❌ スプレッドシートへの予定追加中にエラーが発生しました。' });
        }
    },

    /**
     * [削除]モーダルからの送信を処理します。
     * @param {import('discord.js').ModalSubmitInteraction} modalInteraction - モーダル送信インタラクション。
     */
    async handleScheduleDeleteModal(modalInteraction) {
        await modalInteraction.deferReply({ ephemeral: true });

        const userInput = modalInteraction.fields.getTextInputValue('schedule_delete_description_input');
        let sheets;
        let currentSchedules;

        try {
            sheets = await getSheetsClient();
            const response = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: LIST_RANGE });
            currentSchedules = response.data.values || [];
            if (currentSchedules.length === 0) {
                await modalInteraction.editReply({ content: 'ℹ️ 削除対象の予定がありません。' });
                return;
            }
        } catch (error) {
            console.error('削除のための予定読み込みエラー:', error);
            await modalInteraction.editReply({ content: '❌ スプレッドシートからの予定読み込みに失敗しました。' });
            return;
        }

        const { indicesToDelete, reason } = await extractDeletionTargetWithAI(userInput, currentSchedules);

        if (!indicesToDelete || indicesToDelete.length === 0) {
            let replyMessage = '❌ AIが削除対象の予定を特定できませんでした。';
            if (reason) replyMessage += `\n> **AIからの理由:** ${reason}`;
            replyMessage += '\nもう少し具体的に入力するか、内容が正しいか確認してください。';
            await modalInteraction.editReply({ content: replyMessage });
            return;
        }

        // インデックスを検証し、降順にソート（行削除時のインデックスずれを防ぐため）
        const validSortedIndices = [...new Set(indicesToDelete)]
            .filter(idx => typeof idx === 'number' && idx >= 0 && idx < currentSchedules.length)
            .sort((a, b) => b - a);
        
        if (validSortedIndices.length === 0) {
            await modalInteraction.editReply({ content: `❌ 有効な削除対象が見つかりませんでした。${reason ? `\n> **AIからの注記:** ${reason}` : ''}` });
            return;
        }

        try {
            // シートのGIDを取得（より堅牢な行削除のため）
            const spreadsheetInfo = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
            const sheet1 = spreadsheetInfo.data.sheets.find(s => s.properties.title === 'シート1');
            const targetSheetGid = sheet1?.properties?.sheetId ?? 0;

            const deleteRequests = validSortedIndices.map(index => ({
                deleteDimension: {
                    range: {
                        sheetId: targetSheetGid,
                        dimension: 'ROWS',
                        startIndex: index + 1, // listRangeがA2からなので、index+1行目を削除
                        endIndex: index + 2,
                    },
                },
            }));
            
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: SHEET_ID,
                resource: { requests: deleteRequests },
            });
            
            let replyMessage = `✅ ${deleteRequests.length}件の予定を削除しました。\nリストを更新するには、再度 \`/schedule\` コマンドを実行してください。`;
            if (reason && indicesToDelete.length > validSortedIndices.length) {
                replyMessage += `\n> **AIからの注記:** ${reason}`;
            }
            await modalInteraction.editReply({ content: replyMessage });

        } catch (sheetError) {
            console.error('スプレッドシートからの複数予定削除エラー:', sheetError.errors || sheetError.message);
            await modalInteraction.editReply({ content: '❌ スプレッドシートからの予定削除中にエラーが発生しました。' });
        }
    },
    
    /**
     * [編集]モーダルからの送信を処理します。
     * @param {import('discord.js').ModalSubmitInteraction} modalInteraction - モーダル送信インタラクション。
     * @param {number} targetIndex - 編集対象の予定のインデックス。
     */
    async handleScheduleEditModal(modalInteraction, targetIndex) {
        await modalInteraction.deferReply({ ephemeral: true });

        const newType = modalInteraction.fields.getTextInputValue('edit_type_input').trim() || 'その他';
        const newTask = modalInteraction.fields.getTextInputValue('edit_task_input').trim();
        const newDueRaw = modalInteraction.fields.getTextInputValue('edit_due_input').trim() || '不明';

        if (!newTask) {
            await modalInteraction.editReply({ content: '❌ 「内容」は必須です。' });
            return;
        }
        
        let newDue = newDueRaw;
        try {
            // AIで日付表現を解析
            const scheduleLikeString = `${newType} ${newTask} ${newDueRaw}`;
            const extractedInfo = await extractScheduleInfoWithAI(scheduleLikeString);
            if (extractedInfo.length > 0 && extractedInfo[0].due && extractedInfo[0].due !== '不明') {
                newDue = extractedInfo[0].due;
            }
        } catch (aiError) {
            console.warn(`編集時の期限解析でAIエラー: ${aiError.message}. 元の入力を期限として使用します。`);
        }

        try {
            const sheets = await getSheetsClient();
            const rangeToUpdate = `'シート1'!A${targetIndex + 2}:C${targetIndex + 2}`;
            
            await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: rangeToUpdate,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [[newType, newTask, newDue]] },
            });

            await modalInteraction.editReply({ content: `✅ 予定を更新しました。\nリストを最新の状態にするには、再度 \`/schedule\` コマンドを実行してください。` });
        } catch (error) {
            console.error('スプレッドシートの予定更新エラー:', error);
            await modalInteraction.editReply({ content: '❌ スプレッドシートの予定更新中にエラーが発生しました。' });
        }
    }
};