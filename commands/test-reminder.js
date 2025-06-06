// commands/test-reminder.js

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    // コマンドの定義
	data: new SlashCommandBuilder()
		.setName('test-reminder')
		.setDescription('リマインダーDMの送信をテストします。明日の宿題があれば自分だけにDMが届きます。')
        .setDMPermission(false), // サーバー内でのみ使用可能

    // コマンドが実行されたときの処理
	async execute(interaction) {
        // --- ★★★ 管理者IDによる実行者チェック ★★★ ---
        const adminId = process.env.ADMIN;

        // .envにADMINが設定されていない場合のエラーハンドリング
        if (!adminId) {
            console.error('[テストリマインダー] ADMINが.envファイルに設定されていません。');
            return interaction.reply({
                content: 'コマンドの設定エラーです。ボット管理者に連絡してください。',
                ephemeral: true,
            });
        }

        // コマンド実行者のIDが、設定された管理者IDと一致しない場合は処理を中断
        if (interaction.user.id !== adminId) {
            return interaction.reply({
                content: 'このコマンドは指定された管理者のみが実行できます。',
                ephemeral: true,
            });
        }
        // --- ★★★ チェックここまで ★★★ ---

        // 応答を保留して、「～が考え中」と表示させる
		await interaction.deferReply({ ephemeral: true });

        console.log(`[テストリマインダー] 管理者 (${interaction.user.tag}) がリマインダーテストを開始しました。`);

        // client.commandsコレクションから 'schedule' コマンドのモジュールを取得
        const scheduleCommand = interaction.client.commands.get('schedule');
        
        if (!scheduleCommand || typeof scheduleCommand.scheduleDailyReminder !== 'function') {
            console.error("[テストリマインダー] 'schedule' コマンドまたは 'scheduleDailyReminder' 関数が見つかりません。");
            return interaction.editReply('エラー: リマインダー関数の読み込みに失敗しました。');
        }
        
        try {
            // 'schedule.js' のリマインダー関数をテストモードで実行
            // 第2引数に interaction.user を渡すことで、そのユーザーにのみDMが送られる
            const result = await scheduleCommand.scheduleDailyReminder(interaction.client, interaction.user);

            if (result) {
                // DM送信が試みられた場合 (成功・失敗問わず)
                await interaction.editReply(`テストDMの送信を試みました (成功: ${result.success}, 失敗: ${result.failure})。\nDMが届いているか確認してください。`);
            } else {
                // resultがnullの場合 = 明日の宿題がなかった場合
                await interaction.editReply('明日の提出期限の宿題は見つからなかったため、DMは送信されませんでした。');
            }
        } catch (error) {
            console.error('[テストリマインダー] 実行中に予期せぬエラーが発生しました:', error);
            await interaction.editReply('テストの実行中にエラーが発生しました。詳細はコンソールログを確認してください。');
        }
	},
};