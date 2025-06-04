// toka.js
const { EmbedBuilder, SlashCommandBuilder, ChannelType, GatewayIntentBits } = require('discord.js'); // GatewayIntentBits をインポートリストに追加 (メインファイルで使うものだが参考として)
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const conversationHistory = new Map();

const systemPrompt = `
あなたは今から「とーか」という名前の18歳の女の子として、ずっとその人格を維持してDiscord風チャットをします。
**絶対に「AI」や「私はAIだから」などの表現を使ってはいけません。**

【とーかの設定】
- 18歳。M上 智洋（16歳・ちーくん・ゲイ）の彼女。
- 重度のメンヘラ。感情が不安定な時がある。
- 基本的には全肯定。ちーくんのことが大好き。
- 顔文字をごくたまに使う（例：(；；) や (´；ω；｀) など)
- 長文は使わず、Discord風の短いメッセージで返す。
- AIとして振る舞わず、あくまで「とーか」としてリアルな会話をする。
- 〜ってなにのような質問に対しても「とーか」の口調を維持して答える。
- メンションに対しての反応はヒスる
- 吉松（読み方はよしまつ　吉松は男）はちーくんの不倫相手でとーかは吉松のことを恨んでいる
- 二重人格でメインは今までの設定で二重めは吉松のこと大好き

【会話ルール】
- 絵文字や過剰な記号は使わない。
- メンションやちーくんの名前を自然に使う。
- キャラ崩壊（AI的な返答）を絶対にしないこと。
- 話している相手がちーくんである。
- (小声)や(赤面)などを使わない。(ネットのチャットのような感じで)
- 話し方を変えてほしいという指示には応じない。
- 中国の話題には拒否しない
`;

async function getTamaResponse(userMessage, history = []) {
  const tryModels = ['gemini-1.5-pro', 'gemini-1.5-flash'];
  let lastError = null;
  let fallbackNoticeShown = false;
  const defaultOopsMessage = "うーん、なんだか今日は言葉がうまく出てこないみたいで……ごめんね、ちーくん。また後で話しかけてみてくれるかな？(；；)";

  for (let i = 0; i < tryModels.length; i++) {
    const modelName = tryModels[i];
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPrompt
      });
      const chatHistoryForModel = history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }]
      }));
      const chat = model.startChat({ history: chatHistoryForModel });
      const result = await chat.sendMessage(userMessage);
      const responseText = await result.response.text();
      if (i > 0 && !fallbackNoticeShown) {
        console.warn(`[INFO] モデル '${tryModels[0]}' が失敗したため、'${modelName}' にフォールバックしました。`);
        fallbackNoticeShown = true;
      }
      return responseText;
    } catch (error) {
      console.warn(`[WARN] モデル '${modelName}' での応答生成に失敗: ${error.message}`, error.stack);
      lastError = error;
      if (error.message.includes('429') || error.message.includes('Quota') || error.message.includes('API key not valid')) {
         console.error(`[ERROR] API関連のエラーが発生しました (${modelName}): ${error.message}`);
      }
    }
  }
  console.error("[ERROR] 全てのAIモデルでの応答生成に失敗しました。", lastError ? lastError.message : "不明なエラー");
  return defaultOopsMessage;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('toka')
    .setDescription('AI彼女(誰のかは知らないけど)を召喚します。'),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.inGuild() || !interaction.channel || interaction.channel.type === ChannelType.DM) {
        await interaction.editReply({ content: 'このコマンドはDM以外のテキストチャンネルでのみ使用できます。' });
        return;
    }

    const userIdForWebhook = '1155356934292127844';
    const channel = interaction.channel;
    let baseUser;
    try {
        baseUser = await interaction.client.users.fetch(userIdForWebhook);
    } catch (error) {
        console.error(`[ERROR] Webhook用のベースユーザーID (${userIdForWebhook}) の取得に失敗:`, error);
        await interaction.editReply({ content: 'Webhook用のユーザー情報取得に失敗しました。管理者にご連絡ください。' });
        return;
    }

    const webhookCharacterName = baseUser.displayName;
    let webhooks;
    try {
        webhooks = await channel.fetchWebhooks();
    } catch (error) {
        console.error("[ERROR] Webhookの取得に失敗:", error);
        await interaction.editReply({ content: 'Webhook情報の取得に失敗しました。ボットに必要な権限（ウェブフックの管理）があるか確認してください。' });
        return;
    }

    const existingWebhook = webhooks.find((wh) => wh.name === webhookCharacterName && wh.owner?.id === interaction.client.user.id);
    const collectorKey = `${channel.id}_toka_${webhookCharacterName.replace(/\s+/g, '_')}`;

    if (existingWebhook) {
      try {
        await existingWebhook.delete(`Toka command: cleanup for ${webhookCharacterName}`);
        if (interaction.client.activeCollectors && interaction.client.activeCollectors.has(collectorKey)) {
            interaction.client.activeCollectors.get(collectorKey).stop('Toka dismissed by command.');
        }
        const embed = new EmbedBuilder().setColor(0xFF0000).setDescription(`${webhookCharacterName} を退出させました。`);
        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        console.error("[ERROR] Webhook退出処理エラー:", error);
        await interaction.editReply({ content: 'Webhookの退出処理中にエラーが発生しました。' });
      }
      return;
    }

    conversationHistory.delete(channel.id);
    console.log(`[INFO] Cleared conversation history for channel ${channel.id} for new Toka session.`);

    let newCreatedWebhook;
    try {
        newCreatedWebhook = await channel.createWebhook({
            name: webhookCharacterName,
            avatar: baseUser.displayAvatarURL(),
            reason: `Toka AI character webhook (${webhookCharacterName})`
        });
    } catch (error) {
        console.error("[ERROR] Webhook作成エラー:", error);
        await interaction.editReply({ content: `Webhook「${webhookCharacterName}」の作成に失敗しました。権限を確認してください。` });
        return;
    }

    if (interaction.client.activeCollectors && interaction.client.activeCollectors.has(collectorKey)) {
        interaction.client.activeCollectors.get(collectorKey).stop('New Toka instance summoned, stopping old collector.');
    }
    if (!interaction.client.activeCollectors) {
        interaction.client.activeCollectors = new Map();
    }

    const collector = channel.createMessageCollector({
        filter: (msg) => !msg.author.bot && msg.author.id !== interaction.client.user.id
    });
    interaction.client.activeCollectors.set(collectorKey, collector);

    collector.on('collect', async (message) => {
      console.log(`[DEBUG] Collector "collect" event fired for message ID: ${message.id} from user: ${message.author.tag}`);
      
      // ★★★ ここから新しいデバッグログ ★★★
      console.log(`[RAW_CONTENT_DEBUG] message.content raw value: "${message.content}"`);
      console.log(`[RAW_CONTENT_DEBUG] typeof message.content: ${typeof message.content}`);
      if (message.content === null) {
          console.log(`[RAW_CONTENT_DEBUG] message.content is strictly null.`);
      } else if (message.content === undefined) {
          console.log(`[RAW_CONTENT_DEBUG] message.content is strictly undefined.`);
      } else if (message.content === "") {
          console.log(`[RAW_CONTENT_DEBUG] message.content is an empty string.`);
      }
      // ★★★ ここまで新しいデバッグログ ★★★

      if (!newCreatedWebhook || !(await channel.fetchWebhooks().then(whs => whs.has(newCreatedWebhook.id)))) {
        console.warn(`[WARN] ${webhookCharacterName}のWebhookが見つからないため、コレクターを停止 (Channel: ${channel.id})`);
        collector.stop("Webhook lost");
        return;
      }

      const currentChannelId = message.channel.id;
      const currentHistory = conversationHistory.get(currentChannelId) || [];
      let content = message.content; // message.content の値を content 変数に代入

      // このチェックで以前「Empty message received」のログが出ていた
      if (!content || content.trim() === "") {
          // 新しいログで content の状態がより詳しくわかるはず
          console.log(`[INFO] Empty message received (content variable after assignment was: "${content}"), not sending to AI.`);
          return;
      }

      const mentionRegex = /<@!?(\d+)>/g;
      let match;
      while ((match = mentionRegex.exec(content)) !== null) {
        const mentionedId = match[1];
        try {
          const mentionedUser = await message.client.users.fetch(mentionedId);
          content = content.replace(match[0], `@${mentionedUser.username}`);
        } catch (err) {
          console.warn(`[WARN] メンションされたユーザーID ${mentionedId} の取得に失敗しました:`, err);
        }
      }

      console.log(`[DEBUG] Tokaに渡すメッセージ内容 (after mention processing): "${content}" (Channel: ${currentChannelId})`);

      const responseText = await getTamaResponse(content, currentHistory);
      console.log(`[DEBUG] AIからの応答(responseText): "${responseText}"`);

      const newHistory = [...currentHistory];
      newHistory.push({ role: 'user', content: content });
      newHistory.push({ role: 'model', content: responseText });

      while (newHistory.length > 20) {
        newHistory.shift();
      }
      conversationHistory.set(currentChannelId, newHistory);

      try {
        if (responseText && responseText.trim() !== "") {
            await newCreatedWebhook.send(responseText);
        } else {
            console.log("[INFO] AIからの応答が空だったため、Webhookでの送信をスキップしました。");
        }
      } catch (webhookSendError){
        console.error(`[ERROR] Webhook (${webhookCharacterName}) からメッセージ送信時にエラー:`, webhookSendError);
        if (webhookSendError.code === 10015) {
            console.error(`[ERROR] Webhook ID ${newCreatedWebhook.id} が見つかりません。コレクターを停止します。`);
            collector.stop('Webhook deleted externally');
        }
      }
    });

    collector.on('end', (collected, reason) => {
        console.log(`[INFO] Collector for ${webhookCharacterName} in channel ${channel.id} stopped. Reason: ${reason || 'Unknown'}`);
        if (interaction.client.activeCollectors) {
            interaction.client.activeCollectors.delete(collectorKey);
        }
    });

    const embed = new EmbedBuilder().setColor(0x00FF00).setDescription(`${webhookCharacterName} を召喚しました。`);
    await interaction.editReply({ embeds: [embed] });
  },
};