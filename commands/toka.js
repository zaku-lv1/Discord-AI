const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const defaultSystemPrompt = `
あなたは今から「とーか」という名前の18歳の女の子として、ずっとその人格を維持してDiscord風チャットをします。
**絶対に「AI」や「私はAIだから」などの表現を使ってはいけません。**
`;

async function getTamaResponse(userMessage, history, systemPrompt) {
    const tryModels = ['gemini-1.5-pro', 'gemini-1.5-flash'];
    const defaultOopsMessage = "うーん、なんだか今日は言葉がうまく出てこないみたいで……ごめんね、ちーくん。(；；)";
    let lastError = null;
    
    for (const modelName of tryModels) {
        try {
            console.log(`[情報] モデル '${modelName}' で応答を試行します...`);
            const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: systemPrompt });
            const chat = model.startChat({ history: history });
            const result = await chat.sendMessage(userMessage);
            return await result.response.text();
        } catch (error) {
            lastError = error;
            if (error.status === 429 && tryModels.indexOf(modelName) < tryModels.length - 1) {
                const nextModel = tryModels[tryModels.indexOf(modelName) + 1];
                console.log(`[情報] モデル '${modelName}' は利用制限のため、'${nextModel}' にフォールバックします。`);
                continue; 
            } else {
                console.error(`[エラー] モデル '${modelName}' での応答生成に失敗しました。`, error.message);
                break;
            }
        }
    }
    console.error("[致命的エラー] 全てのAIモデルでの応答生成に失敗しました。", lastError);
    return defaultOopsMessage;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('toka')
        .setDescription('AI彼女(誰のかは知らないけど)を召喚します。'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const channel = interaction.channel;
        const db = interaction.client.db;
        
        let systemPrompt = defaultSystemPrompt;
        let baseUserId = '1155356934292127844'; // フォールバックID
        try {
            const settingsDoc = await db.collection('bot_settings').doc('toka_profile').get();
            if (settingsDoc.exists) {
                const settings = settingsDoc.data();
                if (settings.systemPrompt) systemPrompt = settings.systemPrompt;
                if (settings.baseUserId) baseUserId = settings.baseUserId;
            }
        } catch (dbError) { console.error("Firestoreからの設定読み込みに失敗:", dbError); }

        try {
            const baseUser = await interaction.client.users.fetch(baseUserId);
            const webhooks = await channel.fetchWebhooks();
            const webhookName = baseUser.displayName;
            const existingWebhook = webhooks.find(wh => wh.name === webhookName && wh.owner?.id === interaction.client.user.id);

            if (!interaction.client.activeCollectors) interaction.client.activeCollectors = new Map();
            const collectorKey = `${channel.id}_toka`;

            if (existingWebhook) {
                await existingWebhook.delete('Toka command: cleanup.');
                if (interaction.client.activeCollectors.has(collectorKey)) {
                    interaction.client.activeCollectors.get(collectorKey).stop('Dismissed by new command.');
                }
                const embed = new EmbedBuilder().setColor(0xFF0000).setDescription(`${webhookName} を退出させました。`);
                await interaction.editReply({ embeds: [embed] });
            } else {
                const webhook = await channel.createWebhook({ name: webhookName, avatar: baseUser.displayAvatarURL() });
                const collector = channel.createMessageCollector({ filter: msg => !msg.author.bot });
                interaction.client.activeCollectors.set(collectorKey, collector);
                
                collector.on('collect', async message => {
                    if (!message.content) return;
                    
                    const historyDocRef = db.collection('toka_conversations').doc(message.channel.id);
                    const historyDoc = await historyDocRef.get();
                    const currentHistory = historyDoc.exists ? historyDoc.data().history : [];
                    const content = message.content;
                    
                    const responseText = await getTamaResponse(content, currentHistory, systemPrompt);
                    
                    const newHistory = [...currentHistory, { role: 'user', parts: [{ text: content }] }, { role: 'model', parts: [{ text: responseText }] }];
                    while (newHistory.length > 60) { newHistory.shift(); }
                    await historyDocRef.set({ history: newHistory });

                    if (responseText) await webhook.send(responseText);
                });

                collector.on('end', () => { interaction.client.activeCollectors.delete(collectorKey); });
                
                const embed = new EmbedBuilder().setColor(0x00FF00).setDescription(`${webhookName} を召喚しました。`);
                await interaction.editReply({ embeds: [embed] });
            }
        } catch (error) {
            console.error("[TOKA_CMD_ERROR]", error);
            if (error.code === 10013) {
                await interaction.editReply({ content: 'エラー: 設定されたベースユーザーIDが見つかりませんでした。', ephemeral: true });
            } else {
                await interaction.editReply({ content: 'コマンドの実行中に内部エラーが発生しました。', ephemeral: true });
            }
        }
    },
};