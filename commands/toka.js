// toka.js
const { EmbedBuilder, SlashCommandBuilder, ChannelType } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const conversationHistory = new Map();

// systemPrompt と getTamaResponse 関数は変更なし (前回提示したものを使用)
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
  const tryModels = ['gemini-1.5-pro', 'gemini-1.5-flash'];
  let lastError = null;
  let fallbackNoticeShown = false;

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
           throw systemError; 
        }
      }
      const result = await chat.sendMessage(userMessage);
      const responseText = await result.response.text();
      if (i > 0 && !fallbackNoticeShown) {
        console.warn(`[INFO] ${tryModels[0]} が失敗したため、${modelName} にフォールバックしました。`);
        fallbackNoticeShown = true;
      }
      return responseText;
    } catch (error) {
      console.warn(`[${modelName}] で失敗: ${error.message}`, error.stack);
      lastError = error;
      if (error.message.includes('429') || error.message.includes('Quota') || error.message.includes('API key not valid')) {
        console.error(`[${modelName}] 回復不能なAPIエラー。getTamaResponse処理を中断します。: ${error.message}`);
        throw error;
      }
      continue;
    }
  }
  if (lastError) {
    throw new Error(`全てのモデルで応答に失敗しました: ${lastError.message}`);
  }
  throw new Error(`全てのモデルで応答に失敗しました (不明なエラー)`);
}


module.exports = {
  data: new SlashCommandBuilder()
    .setName('toka')
    .setDescription('AI彼女(誰のかは知らないけど)を召喚します。'),
  async execute(interaction) {
    // ephemeral を指定せずに deferReply (公開される「Botが考えています...」)
    await interaction.deferReply(); 

    if (!interaction.channel || !interaction.channel.isTextBased() || interaction.channel.type === ChannelType.DM) {
        // このエラーメッセージは ephemeral のままにする
        await interaction.editReply({ content: 'このコマンドはDM以外のテキストチャンネルでのみ使用できます。', ephemeral: true });
        return;
    }

    const userId = '1155356934292127844';
    const channel = interaction.channel;
    
    let baseUser;
    try {
        baseUser = await interaction.client.users.fetch(userId);
    } catch (error) {
        console.error(`ベースユーザーID (${userId}) の取得に失敗:`, error);
        // このエラーメッセージは ephemeral のままにする
        await interaction.editReply({ content: 'Webhookアバター用のユーザー情報取得に失敗しました。', ephemeral: true });
        return;
    }
    
    const webhookName = `TokaWebhook_${baseUser.username}`;
    let webhooks;
    try {
        webhooks = await channel.fetchWebhooks();
    } catch (error) {
        console.error("Webhookの取得に失敗:", error);
        // このエラーメッセージは ephemeral のままにする
        await interaction.editReply({ content: 'Webhook情報の取得に失敗しました。権限を確認してください。', ephemeral: true });
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
        const embed = new EmbedBuilder().setColor(0xFF0000).setDescription('とーかを退出させました。またね、ちーくん…(；；)');
        // この応答は公開 (ephemeral なし)
        await interaction.editReply({ embeds: [embed] }); 
      } catch (error) {
        console.error("Webhook退出処理エラー:", error);
        // このエラーメッセージは ephemeral のままにする
        await interaction.editReply({ content: 'Webhookの退出処理中にエラーが発生しました。', ephemeral: true });
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
        // このエラーメッセージは ephemeral のままにする
        await interaction.editReply({ content: 'Webhookの作成に失敗しました。権限を確認してください。', ephemeral: true });
        return;
    }
    
    if (interaction.client.activeCollectors && interaction.client.activeCollectors.has(collectorKey)) {
        interaction.client.activeCollectors.get(collectorKey).stop('New Toka instance summoned.');
    } else if (!interaction.client.activeCollectors) {
        interaction.client.activeCollectors = new Map();
    }

    const collector = channel.createMessageCollector({ filter: (msg) => !msg.author.bot && msg.author.id !== interaction.client.user.id });
    interaction.client.activeCollectors.set(collectorKey, collector);

    collector.on('collect', async (message) => {
      // (collectイベント内のコードは変更なし、前回のものと同様)
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
      try {
        const responseText = await getTamaResponse(content, history);
        history.push({ role: 'user', content: content }); 
        history.push({ role: 'model', content: responseText });
        if (history.length > 20) history.splice(0, history.length - 20);

        await newCreatedWebhook.send(responseText);
      } catch (error) {
        console.error('Gemini応答取得またはWebhook送信時のエラー (Toka):', error.message);
        if (error.message.includes('Quota') || error.message.includes('429')) {
            message.reply("ごめんね、とーか今ちょっと疲れちゃったみたい…少し時間をおいて話しかけてくれる？").catch(console.error);
        }
      }
    });
    
    collector.on('end', (collected, reason) => {
        console.log(`Collector for Toka in channel ${channel.id} (Webhook: ${webhookName}) stopped. Reason: ${reason || 'Unknown'}`);
        if (interaction.client.activeCollectors) {
            interaction.client.activeCollectors.delete(collectorKey);
        }
    });

    const embed = new EmbedBuilder().setColor(0x00FF00).setDescription('とーかを召喚しました。');
    // この応答は公開 (ephemeral なし)
    await interaction.editReply({ embeds: [embed] }); 
  },
};