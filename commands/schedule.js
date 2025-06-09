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

const SHEET_NAME = 'シート1';
const TRY_MODELS = ['gemini-1.5-flash'];

// --- ヘルパー関数群 ---
async function getSheetsClient(credentialsJson) {
    if (!credentialsJson) throw new Error('GoogleサービスアカウントのJSON認証情報が設定されていません。');
    const serviceAccountCreds = JSON.parse(credentialsJson);
    const jwtClient = new JWT({
        email: serviceAccountCreds.client_email,
        key: serviceAccountCreds.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return google.sheets({ version: 'v4', auth: jwtClient });
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function tryModelsForTask(prompt, responseParser, taskName) { /* ... (変更なし) ... */ }
async function extractScheduleInfoWithAI(userInput) { /* ... (変更なし) ... */ }
async function extractDeletionTargetWithAI(userInput, currentSchedules) { /* ... (変更なし) ... */ }

async function cleanupExpiredSchedules(sheets, sheetId) {
    const LIST_RANGE = `${SHEET_NAME}!A2:C`;
    // ... (この関数の内部ロジックも変更なし、引数でsheetIdを受け取るだけ)
}

function createScheduleEmbed(scheduleItem, currentIndex, totalSchedules) { /* ... (変更なし) ... */ }
function updateScheduleButtons(currentIndex, totalSchedules, schedulesExist) { /* ... (変更なし) ... */ }


// --- リマインダー機能 ---
async function scheduleDailyReminder(client, db) {
    const logPrefix = '[定時リマインダー]';
    console.log(`\n${logPrefix} 処理を開始します。`);
    
    let settings;
    try {
        const settingsDoc = await db.collection('bot_settings').doc('schedule_settings').get();
        if (!settingsDoc.exists || !settingsDoc.data().remindersEnabled) {
            console.log(`${logPrefix} リマインダーが無効化されているか、設定が存在しないためスキップします。`);
            return null;
        }
        settings = settingsDoc.data();
    } catch (error) {
        console.error(`${logPrefix} 設定の読み込みに失敗しました。`, error);
        return null;
    }

    const { googleSheetId, googleServiceAccountJson, reminderGuildId, reminderRoleId } = settings;
    if (!googleSheetId || !googleServiceAccountJson || !reminderGuildId || !reminderRoleId) {
        console.error(`${logPrefix} スケジュール設定に必要な項目（シートID, サービスアカウント, サーバーID, ロールID）が不足しています。`);
        return null;
    }

    const getTomorrowDateString = () => {
        const nowInJST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
        const tomorrow = new Date(nowInJST);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const year = tomorrow.getFullYear();
        const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
        const day = String(tomorrow.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    const tomorrowStr = getTomorrowDateString();
    console.log(`${logPrefix} 明日の日付 (${tomorrowStr}) の宿題をチェックします...`);

    let sheets;
    try {
        sheets = await getSheetsClient(googleServiceAccountJson);
    } catch (authError) {
        console.error(`${logPrefix} Google API認証エラー:`, authError);
        return null;
    }

    let allSchedules;
    try {
        const response = await sheets.spreadsheets.values.get({ spreadsheetId: googleSheetId, range: `${SHEET_NAME}!A2:C` });
        allSchedules = response.data.values || [];
    } catch (error) {
        console.error(`${logPrefix} スプレッドシート読み込みエラー:`, error);
        return null;
    }

    const cleanedSchedules = allSchedules.map(row => ({
        type: (row[0] || '').trim(), task: (row[1] || '').trim(), due: (row[2] || '').trim()
    })).filter(s => s.task);

    const homeworkDueTomorrow = cleanedSchedules.filter(s => s.due === tomorrowStr && s.type === '課題');
    
    if (homeworkDueTomorrow.length === 0) {
        console.log(`${logPrefix} 通知対象の宿題はありませんでした。処理を終了します。`);
        return null;
    }
    
    const reminderEmbed = new EmbedBuilder()
        .setTitle(`📢 明日提出の宿題リマインダー (${tomorrowStr})`)
        .setColor(0xFFB700)
        .setDescription('以下の宿題が明日提出です。忘れずに取り組みましょう！✨')
        .setTimestamp()
        .addFields(homeworkDueTomorrow.map(({ type, task }) => ({
            name: `📝 ${task}`, value: `種別: ${type}`, inline: false
        })));

    try {
        const guild = await client.guilds.fetch(reminderGuildId);
        const role = await guild.roles.fetch(reminderRoleId);
        if (!role) { console.error(`${logPrefix} ロールID (${reminderRoleId}) が見つかりませんでした。`); return null; }

        await guild.members.fetch();
        const membersWithRole = role.members;
        if (membersWithRole.size === 0) { console.log(`${logPrefix} 通知対象のロールを持つメンバーがいません。`); return; }

        let successCount = 0, failureCount = 0;
        for (const member of membersWithRole.values()) {
            if (member.user.bot) continue;
            try {
                await member.send({ embeds: [reminderEmbed] });
                successCount++;
            } catch (dmError) {
                console.warn(`${logPrefix} ⚠️ ${member.user.tag} へのDM送信に失敗しました。(DMブロックの可能性)`);
                failureCount++;
            }
        }
        console.log(`${logPrefix} 送信完了: 成功 ${successCount}件, 失敗 ${failureCount}件`);
    } catch (error) {
        console.error(`${logPrefix} 送信処理中にエラーが発生しました:`, error);
    }
}


// =================================================================================
// メインコマンド
// =================================================================================
module.exports = {
    data: new SlashCommandBuilder()
        .setName('schedule')
        .setDescription('予定を確認・追加・編集・削除します。(DB設定で動作)'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const db = interaction.client.db;

        const settingsDoc = await db.collection('bot_settings').doc('schedule_settings').get();
        if (!settingsDoc.exists) {
            return interaction.editReply({ content: '❌ スケジュール機能の設定がデータベースに見つかりません。管理パネルから設定してください。' });
        }
        const settings = settingsDoc.data();
        const { googleSheetId, googleServiceAccountJson } = settings;

        if (!googleSheetId || !googleServiceAccountJson) {
            return interaction.editReply({ content: '❌ Google Sheet IDまたはサービスアカウント情報が設定されていません。' });
        }
        
        let sheets;
        try {
            sheets = await getSheetsClient(googleServiceAccountJson);
        } catch (authError) {
            return interaction.editReply({ content: '❌ Google APIへの認証に失敗しました。サービスアカウントのJSON情報を確認してください。' });
        }

        // (以降のexecute関数のロジックは変更なし。googleSheetId変数などを使う)
    },
    
    // (モーダル処理も同様に、Firestoreから設定を読み込んで動作するように修正)
    async handleScheduleModalSubmit(interaction) { /* ... */ },
    async handleScheduleDeleteModal(interaction) { /* ... */ },
    async handleScheduleEditModal(interaction, targetIndex) { /* ... */ },
    
    scheduleDailyReminder
};