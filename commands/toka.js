// toka.js (ニックネーム認識機能を追加)
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// (replaceMentionsWithNames, プロンプト定義, getTokaResponse 関数は変更なし)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
function replaceMentionsWithNames(message, guild) { /* ... */ }
const baseSystemPrompt = `...`;
const forcedInstructions = `...`;
async function getTokaResponse(userMessage, history, systemPrompt) { /* ... */ }

module.exports = {
    data: new SlashCommandBuilder()
        .setName('toka')
        .setDescription('AI彼女(誰のかは知らないけど)を召喚します。'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const channel = interaction.channel;
        const db = interaction.client.db;

        let userDefinedPrompt = baseSystemPrompt;
        let baseUserId = '1155356934292127844';
        let enableNameRecognition = true;
        let userNicknames = {}; // ★ ニックネーム設定を保存する変数を追加

        try {
            const settingsDoc = await db.collection('bot_settings').doc('toka_profile').get();
            if (settingsDoc.exists) {
                const settings = settingsDoc.data();
                if (settings.systemPrompt) userDefinedPrompt = settings.systemPrompt;
                if (settings.baseUserId) baseUserId = settings.baseUserId;
                if (typeof settings.enableNameRecognition === 'boolean') {
                    enableNameRecognition = settings.enableNameRecognition;
                }
                // ▼▼▼ ニックネーム設定を読み込む ▼▼▼
                if (settings.userNicknames) {
                    userNicknames = settings.userNicknames;
                }
            }
        } catch (dbError) { console.error("Firestoreからの設定読み込みに失敗:", dbError); }

        const finalSystemPrompt = userDefinedPrompt + forcedInstructions;

        try {
            // (Webhook取得などの処理は変更なし)
            const baseUser = await interaction.client.users.fetch(baseUserId);
            const webhooks = await channel.fetchWebhooks();
            const webhookName = baseUser.displayName;
            // ... (以下、Webhook関連の処理)

            if (existingWebhook) {
                // ...
            } else {
                const webhook = await channel.createWebhook({ name: webhookName, avatar: baseUser.displayAvatarURL() });
                const collector = channel.createMessageCollector({ filter: msg => !msg.author.bot });
                interaction.client.activeCollectors.set(collectorKey, collector);
                
                collector.on('collect', async message => {
                    if (!message.content) return;

                    // (履歴取得の部分は変更なし)
                    const historyDocRef = db.collection('toka_conversations').doc(message.channel.id);
                    const historyDoc = await historyDocRef.get();
                    const currentHistory = historyDoc.exists ? historyDoc.data().history : [];
                    const processedContent = replaceMentionsWithNames(message.content, message.guild);
                    
                    let contentForAI;
                    
                    // ▼▼▼ 発言者名の決定ロジックを修正 ▼▼▼
                    const userId = message.author.id;
                    const nickname = userNicknames[userId]; // 設定されたニックネームを探す
                    
                    // ニックネームがあればそれを使い、なければDiscordの表示名/ユーザー名を使う
                    const authorName = nickname || message.member?.displayName || message.author.username;
                    
                    if (enableNameRecognition) {
                        contentForAI = `[発言者: ${authorName}]\n${processedContent}`;
                    } else {
                        contentForAI = processedContent;
                    }
                    
                    console.log(`[情報] AIへの入力:\n---\n${contentForAI}\n---`);
                    const responseText = await getTokaResponse(contentForAI, currentHistory, finalSystemPrompt);
                    
                    // (履歴保存とメッセージ送信の部分は変更なし)
                    const newHistory = [...currentHistory, { role: 'user', parts: [{ text: contentForAI }] }, { role: 'model', parts: [{ text: responseText }] }];
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
            await interaction.editReply({ content: 'コマンドの実行中に内部エラーが発生しました。', ephemeral: true });
        }
    },
};