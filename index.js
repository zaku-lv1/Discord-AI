// =================================================================================
// モジュールのインポート
// =================================================================================
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const dotenv = require('dotenv');
const cron = require('node-cron'); // ★ cronライブラリをインポート

// .envファイルから環境変数を読み込む
dotenv.config();

// =================================================================================
// Discordクライアントの初期化
// =================================================================================
// ボットが必要とする権限(Intents)を指定してクライアントを作成
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,           // サーバー関連のイベント
        GatewayIntentBits.GuildMembers,     // ★ リマインダーのためにメンバー情報を取得する権限を追加
        GatewayIntentBits.GuildMessages,    // サーバーでのメッセージ関連
        GatewayIntentBits.DirectMessages,   // ダイレクトメッセージ関連
        GatewayIntentBits.MessageContent,   // メッセージの内容を読み取る権限
        GatewayIntentBits.GuildIntegrations // サーバーのインテグレーション関連
    ]
});

// =================================================================================
// コマンドの読み込み
// =================================================================================
// コマンドを格納するためのCollectionを作成
client.commands = new Collection();

// 'commands'ディレクトリのパスを解決
const commandsPath = path.join(__dirname, 'commands');
// 'commands'ディレクトリ内の.jsファイルをフィルタリングして取得
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// 各コマンドファイルをループ処理で読み込む
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    // コマンドに必要な 'data' と 'execute' プロパティが存在するかチェック
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.log(`[警告] ${filePath} のコマンドには、必須の "data" または "execute" プロパティがありません。`);
    }
}

// =================================================================================
// ヘルスチェック用HTTPサーバー
// =================================================================================
// RenderなどのホスティングサービスでBotを常時起動させるための設定
if (process.env.PORT) {
    require('node:http').createServer((_, res) => res.end('Bot is running')).listen(process.env.PORT);
    console.log(`[情報] HTTPサーバーがポート ${process.env.PORT} で起動しました。`);
}

// =================================================================================
// イベントハンドラ
// =================================================================================

/**
 * ClientReadyイベント: ボットがDiscordに正常にログインし、準備が完了したときに一度だけ実行される
 */
client.once(Events.ClientReady, async c => {
    console.log(`\n✅ Botが起動しました。ログインユーザー: ${c.user.tag}`);
    console.log('--------------------------');
    console.log('【参加サーバー情報】');
    
    // 参加している全サーバーの情報を取得して表示
    for (const guild of c.guilds.cache.values()) {
        try {
            const updatedGuild = await guild.fetch();
            const owner = await c.users.fetch(updatedGuild.ownerId);
            console.log(`- サーバー名: ${updatedGuild.name} (ID: ${updatedGuild.id}), オーナー: ${owner.tag} (ID: ${updatedGuild.ownerId})`);
        } catch (err) {
            console.error(`[エラー] サーバー ${guild.name} (ID: ${guild.id}) の情報取得に失敗:`, err.message);
        }
    }
    console.log('--------------------------');

    // 読み込んだ全コマンドの定義(data)をDiscordに登録する
    const data = client.commands.map(command => command.data.toJSON());

    try {
        await client.application.commands.set(data);
        console.log('[情報] スラッシュコマンドが正常にDiscordに登録されました。');
    } catch (error) {
        console.error('[致命的エラー] スラッシュコマンドの登録中にエラーが発生しました:', error);
    }
    console.log('--------------------------');
    
    // ★★★ ここからリマインダーのスケジュール設定 ★★★
    const scheduleCommand = client.commands.get('schedule');
    if (scheduleCommand && typeof scheduleCommand.scheduleDailyReminder === 'function') {
        // 毎日日本時間の20:00に実行するタスクをスケジュール
        cron.schedule('0 7 * * *', () => {
            console.log('\n[定時タスク] 毎日の宿題リマインダーを実行します...');
            // 'schedule.js' からインポートしたリマインダー関数を実行
            scheduleCommand.scheduleDailyReminder(c); // clientオブジェクトを渡す
        }, {
            scheduled: true,
            timezone: "Asia/Tokyo"
        });
        console.log('[情報] 毎日の宿題リマインダーが日本時間20時に設定されました。');
    } else {
        console.error('[致命的エラー] schedule.js または scheduleDailyReminder 関数が見つからないため、リマインダーを設定できません。');
    }
    console.log('--------------------------');
});

/**
 * InteractionCreateイベント: ユーザーがスラッシュコマンドやボタン、モーダルなどを使用したときに実行される
 */
client.on(Events.InteractionCreate, async interaction => {
    const timestamp = () => `[${new Date().toISOString()}]`;

    // --- スラッシュコマンドの場合の処理 ---
    if (interaction.isChatInputCommand()) {
        console.log(`${timestamp()} [Log] ChatCommand: /${interaction.commandName} (User: ${interaction.user.tag}, Guild: ${interaction.guild?.name || 'DM'})`);

        const command = client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`${timestamp()} [Error] コマンド "${interaction.commandName}" が見つかりません。`);
            await interaction.reply({ content: '不明なコマンドです。', ephemeral: true });
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`${timestamp()} [Error] コマンド実行エラー (${interaction.commandName}):`, error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'コマンド実行中にエラーが発生しました。', ephemeral: true });
            } else {
                await interaction.reply({ content: 'コマンド実行中にエラーが発生しました。', ephemeral: true });
            }
        }
    }
    // --- モーダル送信の場合の処理 ---
    else if (interaction.isModalSubmit()) {
        console.log(`${timestamp()} [Log] ModalSubmit: ID=${interaction.customId} (User: ${interaction.user.tag}, Guild: ${interaction.guild?.name || 'DM'})`);

        // モーダル処理は 'schedule' コマンドに集約されていることを前提とする
        const scheduleCommand = client.commands.get('schedule');

        if (!scheduleCommand) {
            console.error(`${timestamp()} [Error] 'schedule' コマンドが見つかりません。モーダル処理をスキップします。`);
            if (interaction.isRepliable()) {
                await interaction.reply({ content: 'エラーが発生しました。コマンドの処理関数が見つかりません。', ephemeral: true }).catch(e => console.error(`${timestamp()} [Error] Fallback reply failed:`, e));
            }
            return;
        }

        try {
            // モーダルの customId に応じて、scheduleコマンド内の適切な関数を呼び出す
            if (interaction.customId === 'schedule_add_text_modal') {
                await scheduleCommand.handleScheduleModalSubmit?.(interaction);
            } else if (interaction.customId === 'schedule_delete_text_modal') {
                await scheduleCommand.handleScheduleDeleteModal?.(interaction);
            } else if (interaction.customId.startsWith('schedule_edit_modal_submit_')) {
                const targetIndexString = interaction.customId.split('_').pop();
                const targetIndex = parseInt(targetIndexString, 10);

                if (isNaN(targetIndex)) {
                    console.error(`${timestamp()} [Error] 編集モーダルのIDからインデックスの解析に失敗: ${interaction.customId}`);
                    if (interaction.isRepliable()) await interaction.reply({ content: 'エラー: 編集対象の特定に失敗しました。', ephemeral: true });
                    return;
                }
                
                await scheduleCommand.handleScheduleEditModal?.(interaction, targetIndex);
            }
        } catch (modalError) {
            console.error(`${timestamp()} [Error] モーダル処理中の予期せぬエラー (ID: ${interaction.customId}):`, modalError);
            
            // deferReply済みか、まだ応答可能かによってエラーメッセージの送信方法を変える
            if (interaction.isRepliable()) {
                 if (interaction.deferred && !interaction.replied) {
                    await interaction.editReply({ content: 'モーダル処理中に予期せぬエラーが発生しました。' }).catch(e => console.error(`${timestamp()} [Error] Fallback editReply failed:`, e));
                 } else if (!interaction.replied) {
                    await interaction.reply({ content: 'モーダル処理中に予期せぬエラーが発生しました。', ephemeral: true }).catch(e => console.error(`${timestamp()} [Error] Fallback reply failed:`, e));
                 }
            }
        }
    }
    // 他のインタラクションタイプ（ボタンなど）の処理は、各コマンドファイル内のコレクターで処理される
});

// =================================================================================
// Discordへのログイン
// =================================================================================
client.login(process.env.DISCORD_TOKEN);