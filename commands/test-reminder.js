const { SlashCommandBuilder } = require('discord.js');
const { default: fetch } = require('node-fetch'); // このように修正

const API_BASE_URL = `http://localhost:${process.env.PORT || 80}`;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test-reminder')
        .setDescription('リマインダーDMの送信をテストします。明日の宿題があれば自分だけにDMが届きます。')
        .setDMPermission(false),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            console.log(`[テストリマインダー] ${interaction.user.tag} がリマインダーテストを開始しました。`);

            let response;
            try {
                response = await fetch(`${API_BASE_URL}/api/schedule/public`);
                if (!response.ok) {
                    throw new Error(`API response was not ok: ${response.status}`);
                }
            } catch (fetchError) {
                console.error('[テストリマインダー] APIフェッチエラー:', fetchError);
                throw new Error('スケジュールデータの取得に失敗しました。');
            }

            const { items: allSchedules, settings } = await response.json();
            
            if (!settings.remindersEnabled) {
                return await interaction.editReply('[ERROR] リマインダー機能は現在無効になっています。');
            }

            const tomorrow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = tomorrow.toISOString().slice(0, 10);

            const cleanedSchedules = allSchedules.map(row => ({
                type: (row[0] || '').trim(),
                task: (row[1] || '').trim(),
                due: (row[2] || '').trim()
            })).filter(s => s.task);

            const homeworkDueTomorrow = cleanedSchedules.filter(s =>
                s.due === tomorrowStr && s.type === '課題'
            );

            if (homeworkDueTomorrow.length === 0) {
                return await interaction.editReply('ℹ️ 明日の提出期限の宿題は見つかりませんでした。');
            }

            const { EmbedBuilder } = require('discord.js');
            const reminderEmbed = new EmbedBuilder()
                .setTitle(`📢 明日提出の宿題リマインダー (${tomorrowStr})`)
                .setColor(0xFFB700)
                .setDescription('以下の宿題が明日提出です。')
                .setTimestamp()
                .addFields(homeworkDueTomorrow.map(({ task, type }) => ({
                    name: `📝 ${task}`,
                    value: `種別: ${type}`
                })));

            try {
                await interaction.user.send({ embeds: [reminderEmbed] });
                await interaction.editReply('[SUCCESS] テストDMを送信しました。DMを確認してください！');
            } catch (dmError) {
                console.warn(`[テストリマインダー] DMの送信に失敗: ${dmError.message}`);
                await interaction.editReply({
                    content: '[ERROR] DMの送信に失敗しました。DMの受信設定を確認してください。',
                    ephemeral: true
                });
            }

        } catch (error) {
            console.error('[テストリマインダー] 実行中にエラーが発生:', error);
            await interaction.editReply({
                content: '[ERROR] エラーが発生しました。\n' +
                        'エラーの詳細: ' + (error.message || '不明なエラー'),
                ephemeral: true
            });
        }
    }
};