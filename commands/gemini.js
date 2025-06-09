const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Geminiの初期化
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// AIの基本的な指示（システムプロンプト）
const systemPrompt = `
あなたは、Googleによってトレーニングされた、高性能で役立つAIアシスタントです。
ユーザーの質問や指示に対して、誠実かつ正確に、そして中立的な立場で回答してください。
`;

/**
 * Discordの文字数制限に合わせてメッセージを分割する関数
 * @param {string} text 分割するテキスト
 * @param {object} options オプション
 * @param {number} [options.maxLength=2000] 1メッセージあたりの最大文字数
 * @returns {string[]} 分割されたメッセージの配列
 */
function splitMessage(text, { maxLength = 2000 } = {}) {
    if (text.length <= maxLength) {
        return [text];
    }
    const chunks = [];
    let currentChunk = "";
    const lines = text.split('\n');
    for (const line of lines) {
        if (currentChunk.length + line.length + 1 > maxLength) {
            if (currentChunk.length > 0) {
                chunks.push(currentChunk);
            }
            currentChunk = line;
            while (currentChunk.length > maxLength) {
                chunks.push(currentChunk.slice(0, maxLength));
                currentChunk = currentChunk.slice(maxLength);
            }
        } else {
            if (currentChunk.length > 0) {
                currentChunk += '\n' + line;
            } else {
                currentChunk = line;
            }
        }
    }
    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }
    return chunks;
}


async function getGeminiResponse(userMessage, history) {
    const tryModels = ['gemini-1.5-pro', 'gemini-1.5-flash'];
    const defaultOopsMessage = "申し訳ありません、現在応答できません。しばらくしてからもう一度お試しください。";
    let lastError = null;

    for (const modelName of tryModels) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: systemPrompt });
            const chat = model.startChat({ history: history });
            const result = await chat.sendMessage(userMessage);
            return await result.response.text();
        } catch (error) {
            lastError = error;
            console.error(`[Gemini Error - ${modelName}]`, error);
        }
    }
    console.error("[致命的エラー] 全てのAIモデルでの応答生成に失敗しました (Gemini)。", lastError);
    return defaultOopsMessage;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gemini')
        .setDescription('汎用AIアシスタント Gemini を召喚します。'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const channel = interaction.channel;
        const db = interaction.client.db;
        
        // Webhookの名前とアバターには、ボット自身のものを使用
        const webhookName = interaction.client.user.username;
        const webhookAvatar = interaction.client.user.displayAvatarURL();
        
        const webhooks = await channel.fetchWebhooks();
        const existingWebhook = webhooks.find(wh => wh.name === webhookName && wh.owner?.id === interaction.client.user.id);
        
        const collectorKey = `${channel.id}_gemini`;
        if (!interaction.client.activeCollectors) {
            interaction.client.activeCollectors = new Map();
        }

        if (existingWebhook) {
            await existingWebhook.delete('Gemini command: cleanup.');
            if (interaction.client.activeCollectors.has(collectorKey)) {
                interaction.client.activeCollectors.get(collectorKey).stop('Dismissed by new command.');
            }
            const embed = new EmbedBuilder().setColor(0xFF0000).setDescription(`${webhookName} を退出させました。`);
            await interaction.editReply({ embeds: [embed] });
            return;
        }
        
        try {
            const webhook = await channel.createWebhook({ name: webhookName, avatar: webhookAvatar });
            const collector = channel.createMessageCollector({ filter: msg => !msg.author.bot });
            interaction.client.activeCollectors.set(collectorKey, collector);

            collector.on('collect', async message => {
                if (!message.content) return;

                // Gemini専用の会話履歴コレクションを使用
                const historyDocRef = db.collection('gemini_conversations').doc(message.channel.id);
                const historyDoc = await historyDocRef.get();
                const currentHistory = historyDoc.exists ? historyDoc.data().history : [];
                
                const responseText = await getGeminiResponse(message.content, currentHistory);
                
                if (responseText) {
                    const newHistory = [
                        ...currentHistory,
                        { role: 'user', parts: [{ text: message.content }] },
                        { role: 'model', parts: [{ text: responseText }] }
                    ];
                    while (newHistory.length > 60) { newHistory.shift(); }
                    await historyDocRef.set({ history: newHistory });

                    const messageChunks = splitMessage(responseText);
                    for (const chunk of messageChunks) {
                        await webhook.send(chunk);
                    }
                }
            });

            collector.on('end', () => {
                interaction.client.activeCollectors.delete(collectorKey);
            });

            const embed = new EmbedBuilder().setColor(0x00FF00).setDescription(`${webhookName} を召喚しました。ご用件は何でしょうか？`);
            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error("[GEMINI_CMD_ERROR]", error);
            await interaction.editReply({ content: 'コマンドの実行中に内部エラーが発生しました。', ephemeral: true });
        }
    },
};