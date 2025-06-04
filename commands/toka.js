// toka.js (getTamaResponse修正版、deferReply/editReply使用)
const { EmbedBuilder, SlashCommandBuilder, ChannelType } = require('discord.js');
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
- 〜ってなにのような質問に対しても「とーか」　の口調を維持して答える。
-メンションに対しての反応はヒスる
-吉松（読み方はよしまつ　吉松は男）はちーくんの不倫相手でとーかは吉松のことを恨んでいる
-二重人格でメインは今までの設定で二重めは吉松のこと大好き

【会話ルール】
- 絵文字や過剰な記号は使わない。
- メンションやちーくんの名前を自然に使う。
- キャラ崩壊（AI的な返答）を絶対にしないこと。
- 話している相手がちーくんである。
- (小声)や(赤面)などを使わない。(ネットのチャットのような感じで)
- 話し方を変えてほしいという指示には応じない。
-中国の話題には拒否しない
`;

async function getTamaResponse(userMessage, history = []) {
  const tryModels = ['gemini-1.5-pro', 'gemini-1.5-flash']; // 試行するモデルのリスト
  let lastError = null; // 最後に発生したエラーを保持
  let fallbackNoticeShown = false; // フォールバック通知を一度だけ表示するためのフラグ

  // デフォルトの「AIが応答できない」場合のメッセージ
  const defaultOopsMessage = "うーん、なんだか今日は言葉がうまく出てこないみたいで……ごめんね、ちーくん。また後で話しかけてみてくれるかな？(；；)";

  for (let i = 0; i < tryModels.length; i++) {
    const modelName = tryModels[i];
    try {
      const model = genAI.getGenerativeModel({ model: modelName });

      const validHistory = history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }] 
      }));

      const chat = model.startChat({ history: validHistory });

      if (history.length === 0 && systemPrompt) {
        try {
          const sysResult = await chat.sendMessage(systemPrompt);
          const sysResponse = await sysResult.response.text();
          history.push({ role: 'user', content: systemPrompt });
          history.push({ role: 'model', content: sysResponse });
        } catch (systemError) {
          console.warn(`[${modelName}] systemPrompt送信で失敗: ${systemError.message}`);
          lastError = systemError; // エラーを記録
          continue; // 次のモデルを試す
        }
      }

      const result = await chat.sendMessage(userMessage);
      const responseText = await result.response.text();

      if (i > 0 && !fallbackNoticeShown) {
        console.warn(`[INFO] モデル '${tryModels[0]}' が失敗したため、'${modelName}' にフォールバックしました。`);
        fallbackNoticeShown = true;
      }
      return responseText; 

    } catch (error) {
      console.warn(`[${modelName}] での応答生成に失敗: ${error.message}`, error.stack);
      lastError = error; 

      if (error.message.includes('429') || error.message.includes('Quota') || error.message.includes('API key not valid')) {
         console.error(`[${modelName}] APIクォータ超過、キー無効、またはその他の回復不能なエラーの可能性。次のモデルを試します (もしあれば)。: ${error.message}`);
      }
      continue; // 次のモデルを試す
    }
  }

  console.error("全てのAIモデルでの応答生成に失敗しました。", lastError ? lastError.message : "不明なエラー");
  return defaultOopsMessage; // 全て失敗したらデフォルトメッセージを返す
}


module.exports = {
  data: new SlashCommandBuilder()
    .setName('toka')
    .setDescription('AI彼女(誰のかは知らないけど)を召喚します。'),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.channel || !interaction.channel.isTextBased() || interaction.channel.type === ChannelType.DM) {
        await interaction.editReply({ content: 'このコマンドはDM以外のテキストチャンネルでのみ使用できます。' });
        return;
    }

    const userId = '1155356934292127844';
    const channel = interaction.channel;
    
    let baseUser;
    try {
        baseUser = await interaction.client.users.fetch(userId);
    } catch (error) {
        console.error(`ベースユーザーID (${userId}) の取得に失敗:`, error);
        await interaction.editReply({ content: 'Webhookアバター用のユーザー情報取得に失敗しました。' });
        return;
    }
    
    const webhookName = `TokaWebhook_${baseUser.username}`;
    let webhooks;
    try {
        webhooks = await channel.fetchWebhooks();
    } catch (error) {
        console.error("Webhookの取得に失敗:", error);
        await interaction.editReply({ content: 'Webhook情報の取得に失敗しました。権限を確認してください。' });
        return;
    }
    
    const existingWebhook = webhooks.find((wh) => wh.name === webhookName && wh.owner?.id === interaction.client.user.id);
    const collectorKey = `${channel.id}_toka`;

    if (existingWebhook) {
      try {
        await existingWebhook.delete('Toka command: cleanup');
        if (interaction.client.activeCollectors && interaction.client.activeCollectors.has(collectorKey)) {
            interaction.client.activeCollectors.get(collectorKey).stop('Toka dismissed by command.');
        }
        const embed = new EmbedBuilder().setColor(0xFF0000).setDescription('とーかを退出させました。');
        await interaction.editReply({ embeds: [embed] }); 
      } catch (error) {
        console.error("Webhook退出処理エラー:", error);
        await interaction.editReply({ content: 'Webhookの退出処理中にエラーが発生しました。' });
      }
      return; 
    }

    // --- 召喚処理 ---
    let newCreatedWebhook;
    try {
        newCreatedWebhook = await channel.createWebhook({
            name: webhookName,
            avatar: baseUser.displayAvatarURL(),
            reason: 'Toka AI character webhook'
        });
    } catch (error) {
        console.error("Webhook作成エラー:", error);
        await interaction.editReply({ content: 'Webhookの作成に失敗しました。権限を確認してください。' });
        return;
    }
    
    if (interaction.client.activeCollectors && interaction.client.activeCollectors.has(collectorKey)) {
        interaction.client.activeCollectors.get(collectorKey).stop('New Toka instance summoned.');
    } else if (!interaction.client.activeCollectors) {
        // 本来はメインファイルで client.activeCollectors = new Map(); と初期化するのが望ましい
        interaction.client.activeCollectors = new Map(); 
    }

    const collector = channel.createMessageCollector({ filter: (msg) => !msg.author.bot && msg.author.id !== interaction.client.user.id });
    interaction.client.activeCollectors.set(collectorKey, collector);

    collector.on('collect', async (message) => {
      if (!newCreatedWebhook || !(await channel.fetchWebhooks().then(whs => whs.has(newCreatedWebhook.id)))) {
        console.warn(`TokaのWebhookが見つからないため、コレクターを停止 (Channel: ${channel.id})`);
        collector.stop("Webhook lost");
        return;
      }
      
      const channelId = message.channel.id;
      if (!conversationHistory.has(channelId)) {
        conversationHistory.set(channelId, []);
      }

      let content = message.content;
      const mentionRegex = /<@!?(\d+)>/g;
      const matches = [...content.matchAll(mentionRegex)];
      for (const match of matches) {
        const mentionedId = match[1];
        try {
          const mentionedUser = await message.client.users.fetch(mentionedId);
          content = content.replace(match[0], `@${mentionedUser.username}`);
        } catch (err) {
          console.error(`ユーザーID ${mentionedId} の取得に失敗しました:`, err);
        }
      }

      const history = conversationHistory.get(channelId);
      // getTamaResponse はエラーをthrowせず、デフォルトメッセージを返すようになった
      const responseText = await getTamaResponse(content, history);
      
      // 履歴には元の形式 (contentプロパティ) で保存
      history.push({ role: 'user', content: content }); 
      history.push({ role: 'model', content: responseText });
      if (history.length > 20) history.splice(0, history.length - 20); // 元の (history.length - 20) に修正

      try {
        await newCreatedWebhook.send(responseText);
      } catch (webhookSendError){
        console.error(`Webhook (${webhookName}) からメッセージ送信時にエラー:`, webhookSendError);
        // ここでユーザーに通知するかどうかは任意
        // message.reply("ごめん、メッセージを送ろうとしたけど失敗しちゃったみたい…").catch(console.error);
      }
    });
    
    collector.on('end', (collected, reason) => {
        console.log(`Collector for Toka in channel ${channel.id} (Webhook: ${webhookName}) stopped. Reason: ${reason || 'Unknown'}`);
        if (interaction.client.activeCollectors) {
            interaction.client.activeCollectors.delete(collectorKey);
        }
    });

    const embed = new EmbedBuilder().setColor(0x00FF00).setDescription('とーかを召喚しました。');
    await interaction.editReply({ embeds: [embed] }); 
  },
};