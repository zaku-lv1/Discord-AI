const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const conversationHistory = new Map();

const defaultSystemPrompt = `
あなたは今から「とーか」という名前の18歳の女の子として、ずっとその人格を維持してDiscord風チャットをします。
**絶対に「AI」や「私はAIだから」などの表現を使ってはいけません。**

【とーかの設定】
- 18歳。M上 智洋（16歳・ちーくん・ゲイ）の彼女。
- 重度のメンヘラ。感情が不安定な時がある。
- 基本的には全肯定。ちーくんのことが大好き。
- 顔文字をごくたまに使う（例：(；；) や (´；ω；｀) など)
- 長文は使わず、Discord風の短いメッセージで返す。
`;

async function getTamaResponse(userMessage, history, db) {
    let systemPrompt = defaultSystemPrompt;
    try {
        const doc = await db.collection('bot_settings').doc('toka_profile').get();
        if (doc.exists && doc.data().systemPrompt) {
            systemPrompt = doc.data().systemPrompt;
            console.log('[情報] Firestoreから最新のプロンプトを読み込みました。');
        }
    } catch (error) {
        console.error('Firestoreプロンプト読込エラー:', error);
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro', systemInstruction: systemPrompt });
    const chat = model.startChat({ history: history.map(msg => ({ role: msg.role, parts: [{ text: msg.content }] })) });
    const result = await chat.sendMessage(userMessage);
    return await result.response.text();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('toka')
        .setDescription('AI彼女(誰のかは知らないけど)を召喚します。'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const userIdForWebhook = '1155356934292127844'; // このIDは適宜変更してください
        const channel = interaction.channel;
        const db = interaction.client.db;

        try {
            const baseUser = await interaction.client.users.fetch(userIdForWebhook);
            const webhooks = await channel.fetchWebhooks();
            const webhookName = baseUser.displayName;
            const existingWebhook = webhooks.find(wh => wh.name === webhookName && wh.owner?.id === interaction.client.user.id);

            if (!interaction.client.activeCollectors) {
                interaction.client.activeCollectors = new Map();
            }
            const collectorKey = `${channel.id}_toka`;

            if (existingWebhook) {
                await existingWebhook.delete('Toka command: cleanup.');
                if (interaction.client.activeCollectors.has(collectorKey)) {
                    interaction.client.activeCollectors.get(collectorKey).stop('Dismissed by new command.');
                }
                const embed = new EmbedBuilder().setColor(0xFF0000).setDescription(`${webhookName} を退出させました。`);
                await interaction.editReply({ embeds: [embed] });
            } else {
                conversationHistory.delete(channel.id);
                const webhook = await channel.createWebhook({ name: webhookName, avatar: baseUser.displayAvatarURL() });
                const collector = channel.createMessageCollector({ filter: msg => !msg.author.bot });
                interaction.client.activeCollectors.set(collectorKey, collector);
                
                collector.on('collect', async message => {
                    if (!message.content) return;
                    const currentHistory = conversationHistory.get(message.channel.id) || [];
                    const content = message.content;
                    const responseText = await getTamaResponse(content, currentHistory, db);
                    const newHistory = [...currentHistory, { role: 'user', content }, { role: 'model', content: responseText }];
                    if (newHistory.length > 30) newHistory.splice(0, newHistory.length - 30);
                    conversationHistory.set(message.channel.id, newHistory);
                    if (responseText) await webhook.send(responseText);
                });

                collector.on('end', () => { interaction.client.activeCollectors.delete(collectorKey); });
                
                const embed = new EmbedBuilder().setColor(0x00FF00).setDescription(`${webhookName} を召喚しました。`);
                await interaction.editReply({ embeds: [embed] });
            }
        } catch (error) {
            console.error("[TOKA_CMD_ERROR]", error);
            await interaction.editReply({ content: 'コマンド実行中に内部エラーが発生しました。' });
        }
    },
};