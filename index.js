// toka.js (deferReplyを使わない場合のイメージ)
// ... (他の部分は前回と同じ) ...
module.exports = {
  data: new SlashCommandBuilder()
    .setName('toka')
    .setDescription('AI彼女(誰のかは知らないけど)を召喚します。'),
  async execute(interaction) {
    // ★★★ interaction.deferReply() をコメントアウト、または削除 ★★★
    // await interaction.deferReply({ ephemeral: true });

    const userIdForWebhook = '1155356934292127844';
    const channel = interaction.channel;
    let baseUser;

    try {
        // これらの処理が3秒以内に終わらないと、結局タイムアウトする可能性がある
        baseUser = await interaction.client.users.fetch(userIdForWebhook);
        const webhooks = await channel.fetchWebhooks();
        const webhookCharacterName = baseUser.displayName;
        const existingWebhook = webhooks.find((wh) => wh.name === webhookCharacterName && wh.owner?.id === interaction.client.user.id);
        const collectorKey = `${channel.id}_toka_${webhookCharacterName.replace(/\s+/g, '_')}`;

        if (existingWebhook) {
            await existingWebhook.delete(`Toka command: cleanup for ${webhookCharacterName}`);
            if (interaction.client.activeCollectors && interaction.client.activeCollectors.has(collectorKey)) {
                interaction.client.activeCollectors.get(collectorKey).stop('Toka dismissed by command.');
            }
            const embed = new EmbedBuilder().setColor(0xFF0000).setDescription(`${webhookCharacterName} を退出させました。`);
            // ★ 最初の応答 (ephemeral にしておくと良いかも)
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } else {
            conversationHistory.delete(channel.id);
            console.log(`[INFO] Cleared conversation history for channel ${channel.id} for new Toka session.`);
            const newCreatedWebhook = await channel.createWebhook({
                name: webhookCharacterName,
                avatar: baseUser.displayAvatarURL(),
                reason: `Toka AI character webhook (${webhookCharacterName})`
            });

            if (interaction.client.activeCollectors && interaction.client.activeCollectors.has(collectorKey)) {
                interaction.client.activeCollectors.get(collectorKey).stop('New Toka instance summoned, stopping old collector.');
            }
            if (!interaction.client.activeCollectors) {
                interaction.client.activeCollectors = new Map();
            }

            const collector = channel.createMessageCollector({ /* ...filter... */ });
            interaction.client.activeCollectors.set(collectorKey, collector);
            collector.on('collect', async (message) => { /* ...コレクター処理... */ });
            collector.on('end', (collected, reason) => { /* ...コレクター終了処理... */ });

            const embed = new EmbedBuilder().setColor(0x00FF00).setDescription(`${webhookCharacterName} を召喚しました。`);
            // ★ 最初の応答 (ephemeral にしておくと良いかも)
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    } catch (error) {
        console.error("[TOKA_CMD_ERROR] Error in execute:", error);
        // interaction.reply や followUp がまだ可能か確認してエラーメッセージを送る
        // ただし、最初の応答自体がタイムアウトしていたら、これも失敗する可能性がある
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'コマンド処理中にエラーが発生しました。ごめんなさい。', ephemeral: true });
        } else {
            await interaction.followUp({ content: 'コマンド処理中にエラーが発生しました。ごめんなさい。', ephemeral: true });
        }
    }
  },
};