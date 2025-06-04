const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, ActionRowBuilder, TextInputStyle, EmbedBuilder, InteractionResponseFlags } = require('discord.js');
const { google } = require('googleapis');
const { JWT } = require('google-auth-library');

// --- 設定値 ---
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON;

// スプレッドシートの範囲 (注意: 'シート1' のようなシート名は実際の名前に合わせてください)
const LIST_RANGE = 'シート1!A2:C';
const APPEND_RANGE = 'シート1!A:A'; // A列の最終行の次から追記

// --- Google Sheets API クライアント取得関数 ---
async function getSheetsClient() {
    const timestamp = new Date().toISOString();
    if (!GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON) {
        console.error(`[${timestamp}] [エラー] getSheetsClient: GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON が設定されていません。`);
        throw new Error('Google API 認証情報が設定されていません。管理者にお問い合わせください。');
    }
    if (!SPREADSHEET_ID) {
        console.error(`[${timestamp}] [エラー] getSheetsClient: SPREADSHEET_ID が設定されていません。`);
        throw new Error('スプレッドシートIDが設定されていません。管理者にお問い合わせください。');
    }

    try {
        const serviceAccountCreds = JSON.parse(GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON);
        const jwtClient = new JWT({
            email: serviceAccountCreds.client_email,
            key: serviceAccountCreds.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        console.log(`[${timestamp}] getSheetsClient: Google Sheets APIクライアントを正常に初期化しました。`);
        return google.sheets({ version: 'v4', auth: jwtClient });
    } catch (e) {
        console.error(`[${timestamp}] [エラー] getSheetsClient: Google Sheets APIクライアントの初期化に失敗しました:`, e);
        throw new Error('Google API クライアントの初期化に失敗しました。認証情報（JSONの形式など）を確認してください。');
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('schedule')
        .setDescription('宿題や小テストの予定を確認・追加します。')
        .addStringOption(option =>
            option
                .setName('action')
                .setDescription('操作を選択してください')
                .setRequired(true)
                .addChoices(
                    { name: '一覧表示', value: 'list' },
                    { name: '予定を追加', value: 'add' }
                )
        ),

    async execute(interaction) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] schedule.execute: 開始。Action: ${interaction.options.getString('action')}, User: ${interaction.user.tag}, Interaction ID: ${interaction.id}`);

        if (!interaction.inGuild()) {
            console.log(`[${timestamp}] schedule.execute: コマンドがDM内で使用されました。User: ${interaction.user.tag}`);
            await interaction.reply({ content: 'このコマンドはサーバー内でのみ使用できます。', flags: InteractionResponseFlags.EPHEMERAL });
            return;
        }

        const action = interaction.options.getString('action');

        if (action === 'list') {
            console.log(`[${timestamp}] schedule.list: "list" アクション開始。User: ${interaction.user.tag}`);
            // ephemeral: true にすると自分にしか見えない。公開する場合は flags を削除または適切なものに変更
            await interaction.deferReply({ flags: InteractionResponseFlags.EPHEMERAL });

            try {
                const sheets = await getSheetsClient();
                console.log(`[${timestamp}] schedule.list: スプレッドシートからデータを取得中... Range: ${LIST_RANGE}, Spreadsheet ID: ${SPREADSHEET_ID}`);
                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId: SPREADSHEET_ID,
                    range: LIST_RANGE,
                });
                console.log(`[${timestamp}] schedule.list: データ取得成功。行数: ${response.data.values ? response.data.values.length : 0}`);

                const rows = response.data.values;

                if (!rows || rows.length === 0) {
                    const emptyEmbed = new EmbedBuilder()
                        .setColor(0x0099FF)
                        .setTitle('🗓 スケジュール一覧')
                        .setDescription('📭 スケジュールは現在空です。');
                    await interaction.editReply({ embeds: [emptyEmbed] });
                    console.log(`[${timestamp}] schedule.list: スケジュール空のメッセージを送信しました。`);
                    return;
                }

                // 日付でソート (YYYY-MM-DD 形式を前提, C列が日付と仮定)
                rows.sort((a, b) => {
                    const dateA = new Date(a[2]); // C列 (0-indexed)
                    const dateB = new Date(b[2]); // C列
                    if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
                        return isNaN(dateA.getTime()) ? 1 : -1; // 無効な日付は末尾へ
                    }
                    return dateA - dateB;
                });
                console.log(`[${timestamp}] schedule.list: データを日付でソートしました。`);

                const embed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle('🗓 現在のスケジュール一覧')
                    .setDescription('締切が近い順に表示しています（最大10件）:');

                const fieldsToShow = rows.slice(0, 10);
                fieldsToShow.forEach(([type, task, due]) => { // A, B, C列を想定
                    embed.addFields({
                        name: `📌 ${type || '種別未設定'}「${task || '内容未設定'}」`,
                        value: `締切: ${due || '未定'}`,
                        inline: false
                    });
                });

                if (rows.length > 10) {
                    embed.setFooter({ text: `全 ${rows.length} 件中、${fieldsToShow.length} 件を表示しています。` });
                } else if (fieldsToShow.length === 0) { // ソート後、有効なデータが0件だった場合
                     embed.setDescription('表示できるスケジュールデータがありません。');
                }


                await interaction.editReply({ embeds: [embed] });
                console.log(`[${timestamp}] schedule.list: スケジュール一覧を送信しました。`);

            } catch (error) {
                console.error(`[${timestamp}] [エラー] schedule.list: "list" アクション処理中にエラーが発生しました:`, error);
                const errorMessage = `❌ データの取得中にエラーが発生しました: ${error.message || '詳細不明'}`;
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: errorMessage, flags: InteractionResponseFlags.EPHEMERAL }).catch(e => console.error(`[${timestamp}] [エラー] listアクションのエラー応答(reply)に失敗:`, e));
                } else {
                     await interaction.editReply({ content: errorMessage }).catch(e => console.error(`[${timestamp}] [エラー] listアクションのエラー応答(editReply)に失敗:`, e));
                }
            }

        } else if (action === 'add') {
            console.log(`[${timestamp}] schedule.add: "add" アクション開始。User: ${interaction.user.tag}`);

            const modalCustomId = `scheduleAddModal-${interaction.id}`; // Interaction IDを含めてユニークにする
            const modal = new ModalBuilder()
                .setCustomId(modalCustomId)
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

            console.log(`[${timestamp}] schedule.add: モーダル表示を試みます。User: ${interaction.user.tag}, Interaction ID: ${interaction.id}, Modal Custom ID: ${modalCustomId}`);
            try {
                await interaction.showModal(modal);
                console.log(`[${timestamp}] schedule.add: モーダル表示成功。User: ${interaction.user.tag}, Interaction ID: ${interaction.id}`);
            } catch (modalError) {
                console.error(`[${timestamp}] [エラー] schedule.add: モーダルの表示に失敗しました。User: ${interaction.user.tag}, Interaction ID: ${interaction.id}:`, modalError);
                return;
            }

            let submittedInteraction;
            try {
                console.log(`[${timestamp}] schedule.add: モーダル送信待機中... Filter CustomID: ${modalCustomId}, User: ${interaction.user.tag}`);
                const filter = (i) => i.customId === modalCustomId && i.user.id === interaction.user.id;
                submittedInteraction = await interaction.awaitModalSubmit({ filter, time: 300_000 }); // 5分間のタイムアウト
                console.log(`[${timestamp}] schedule.add: モーダル送信を受け付けました。Submitted Interaction ID: ${submittedInteraction.id}, User: ${interaction.user.tag}`);

                await submittedInteraction.deferReply({ flags: InteractionResponseFlags.EPHEMERAL });
                console.log(`[${timestamp}] schedule.add: モーダル送信をdeferReplyしました。Submitted Interaction ID: ${submittedInteraction.id}`);

                const type = submittedInteraction.fields.getTextInputValue('typeInput');
                const task = submittedInteraction.fields.getTextInputValue('taskInput');
                const due = submittedInteraction.fields.getTextInputValue('dueInput');
                console.log(`[${timestamp}] schedule.add: モーダル入力値: Type="${type}", Task="${task}", Due="${due}"`);

                const sheets = await getSheetsClient();
                console.log(`[${timestamp}] schedule.add: スプレッドシートにデータを追記中... Range: ${APPEND_RANGE}, Spreadsheet ID: ${SPREADSHEET_ID}`);
                await sheets.spreadsheets.values.append({
                    spreadsheetId: SPREADSHEET_ID,
                    range: APPEND_RANGE,
                    valueInputOption: 'USER_ENTERED', // ユーザーが入力したかのようにデータを解釈
                    resource: { values: [[type, task, due]] },
                });
                console.log(`[${timestamp}] schedule.add: データ追記成功。`);

                await submittedInteraction.editReply({ content: '✅ 予定をスプレッドシートに追加しました！' });
                console.log(`[${timestamp}] schedule.add: 成功メッセージを送信しました。Submitted Interaction ID: ${submittedInteraction.id}`);

            } catch (error) {
                const errorTimestamp = new Date().toISOString();
                if (error.name === 'InteractionCollectorError' || (error.code && error.code === 'InteractionCollectorError')) {
                    console.warn(`[${errorTimestamp}] [警告] schedule.add: モーダル入力がタイムアウトしました。User: ${interaction.user.tag}, Original Interaction ID: ${interaction.id}`);
                } else {
                    console.error(`[${errorTimestamp}] [エラー] schedule.add: モーダル送信処理またはGoogle Sheets API (append) でエラーが発生しました:`, error);
                    const errorMessage = `❌ 予定の追加中にエラーが発生しました: ${error.message || '詳細不明'}`;
                    if (submittedInteraction && (submittedInteraction.replied || submittedInteraction.deferred)) {
                        await submittedInteraction.editReply({ content: errorMessage }).catch(e => console.error(`[${errorTimestamp}] [エラー] addアクションのエラー応答(editReply)に失敗:`, e));
                    } else if (submittedInteraction && submittedInteraction.isRepliable()) {
                         await submittedInteraction.reply({ content: errorMessage, flags: InteractionResponseFlags.EPHEMERAL }).catch(e => console.error(`[${errorTimestamp}] [エラー] addアクションのエラー応答(reply)に失敗:`, e));
                    } else {
                        console.log(`[${errorTimestamp}] schedule.add: submittedInteractionが未定義または応答不能。元のインタラクション(${interaction.id})へのフォールバックは行いません (既にshowModalで応答済みのため)。`);
                    }
                }
            }
        }
        console.log(`[${timestamp}] schedule.execute: 終了。User: ${interaction.user.tag}, Interaction ID: ${interaction.id}`);
    },
};