// toka.js (Webhook名にグローバルなdisplayNameを使用)
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
-二重人格でメインは今までの設定で二個目の人格の名前は（はまぐり）は吉松のこと大好きこの二個目の人格に切り替わるときははまぐちと呼ばれたら切り替わり元の人格になるときはきりしまと呼ばれたときである。

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
  const defaultOopsMessage = "うーん、なんだか今日は言葉がうまく出てこないみたいで……ごめんね、ちーくん。また後で話しかけてみてくれるかな？(；；)";

  for (let i = 0; i < tryModels.length; i++) {
    const modelName = tryModels[i];
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      // startChatに渡す履歴は、システムプロンプトを含まない純粋な会話履歴とする
      const chatHistoryForModel = history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }]
      }));

      const chat = model.startChat({ history: chatHistoryForModel });
      let currentHistory = [...history]; // getTamaResponse内で完結する一時的な履歴コピー

      // 履歴が空の場合、またはシステムプロンプトがまだ送信されていない場合にシステムプロンプトを送信
      // 注意: この判定は getTamaResponse が呼ばれるたびに行われるため、
      // 実際のシステムプロンプト送信はセッションの最初だけにしたい。
      // conversationHistory の管理方法と併せて検討が必要。
      // 今回の修正では、呼び出し側で conversationHistory をクリアするので、
      // 新しいセッションの最初の呼び出しでは history が空になる。
      if (currentHistory.length === 0 && systemPrompt) {
        console.log(`[${modelName}] Sending system prompt for new session.`);
        // システムプロンプト自体はユーザーメッセージではないので、APIに直接送信する
        // その応答は通常表示しないが、ここでは会話履歴の文脈として追加する
        // Gemini APIのstartChatでは、historyにsystem instructionを渡すのが一般的だが、
        // ここでは会話の最初のやり取りとしてsystemPromptをuserロールで送信し、
        // それに対するAIの最初の応答をmodelロールで記録する形を取っている。
        // もしsystem instructionとして扱いたいなら、getGenerativeModelの第二引数で指定する。
        try {
          // ユーザーがシステムプロンプトを入力したという体で履歴に追加
          currentHistory.push({ role: 'user', content: systemPrompt });
          // モデルにシステムプロンプトを送信し、応答を得る（この応答は通常ユーザーには見せない）
          const sysResult = await chat.sendMessage(systemPrompt); // systemPromptを初手として送信
          const sysResponseText = await sysResult.response.text();
          currentHistory.push({ role: 'model', content: sysResponseText }); // AIの初期応答を履歴に追加
          console.log(`[${modelName}] System prompt processed. Initial model response: ${sysResponseText.substring(0, 50)}...`);
        } catch (systemError) {
          console.warn(`[${modelName}] systemPrompt processing failed: ${systemError.message}`);
          lastError = systemError;
          continue; // 次のモデルへ
        }
      }

      // 実際のユーザーメッセージを送信
      const result = await chat.sendMessage(userMessage);
      const responseText = await result.response.text();

      if (i > 0 && !fallbackNoticeShown) {
        console.warn(`[INFO] Model '${tryModels[0]}' failed, fallback to '${modelName}'.`);
        fallbackNoticeShown = true;
      }
      return { response: responseText, updatedHistory: currentHistory }; // 更新された履歴も返す
    } catch (error) {
      console.warn(`[${modelName}] Response generation failed: ${error.message}`, error.stack);
      lastError = error;
      if (error.message.includes('429') || error.message.includes('Quota') || error.message.includes('API key not valid')) {
         console.error(`[${modelName}] API quota exceeded, key invalid, or other non-recoverable error. Trying next model (if any).: ${error.message}`);
      }
      // continue; // ループの最後なので不要
    }
  }
  console.error("All AI models failed to generate a response.", lastError ? lastError.message : "Unknown error");
  // エラー時も、ここまでの履歴は返せるかもしれないが、今回はデフォルトメッセージのみ
  return { response: defaultOopsMessage, updatedHistory: history }; // 元の履歴をそのまま返す
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

    const userId = '1155356934292127844'; 
    const channel = interaction.channel;
    
    let baseUser;
    try {
        baseUser = await interaction.client.users.fetch(userId);
    } catch (error) {
        console.error(`ベースユーザーID (${userId}) の取得に失敗:`, error);
        await interaction.editReply({ content: 'Webhook用のユーザー情報取得に失敗しました。' });
        return;
    }
    
    const webhookCharacterName = baseUser.displayName; 
    
    let webhooks;
    try {
        webhooks = await channel.fetchWebhooks();
    } catch (error) {
        console.error("Webhookの取得に失敗:", error);
        await interaction.editReply({ content: 'Webhook情報の取得に失敗しました。権限を確認してください。' });
        return;
    }
    
    const existingWebhook = webhooks.find((wh) => wh.name === webhookCharacterName && wh.owner?.id === interaction.client.user.id);
    const collectorKey = `${channel.id}_toka_${webhookCharacterName.replace(/\s+/g, '_')}`;

    if (existingWebhook) {
      try {
        await existingWebhook.delete(`Toka command: cleanup for ${webhookCharacterName}`);
        if (interaction.client.activeCollectors && interaction.client.activeCollectors.has(collectorKey)) {
            interaction.client.activeCollectors.get(collectorKey).stop('Toka dismissed by command.');
            // activeCollectors から削除するのは collector.on('end') で行うのでここでは不要
        }
        // conversationHistory.delete(channel.id); // ★ 退出時に履歴を削除する場合
        // console.log(`[INFO] Cleared conversation history for channel ${channel.id} on Toka dismissal.`);
        const embed = new EmbedBuilder().setColor(0xFF0000).setDescription(`${webhookCharacterName} を退出させました。`);
        await interaction.editReply({ embeds: [embed] }); 
      } catch (error) {
        console.error("Webhook退出処理エラー:", error);
        await interaction.editReply({ content: 'Webhookの退出処理中にエラーが発生しました。' });
      }
      return; 
    }

    // --- 召喚処理 ---
    // ★ 新しいTokaを召喚する前に、このチャンネルの古い会話履歴をクリア
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
        console.error("Webhook作成エラー:", error);
        await interaction.editReply({ content: `Webhook「${webhookCharacterName}」の作成に失敗しました。権限を確認してください。` });
        return;
    }
    
    if (interaction.client.activeCollectors && interaction.client.activeCollectors.has(collectorKey)) {
        interaction.client.activeCollectors.get(collectorKey).stop('New Toka instance summoned, stopping old collector.');
    }
    if (!interaction.client.activeCollectors) { // activeCollectorsが未定義の場合の初期化
        interaction.client.activeCollectors = new Map(); 
    }

    const collector = channel.createMessageCollector({ filter: (msg) => !msg.author.bot && msg.author.id !== interaction.client.user.id });
    interaction.client.activeCollectors.set(collectorKey, collector);

    collector.on('collect', async (message) => {
      if (!newCreatedWebhook || !(await channel.fetchWebhooks().then(whs => whs.has(newCreatedWebhook.id)))) {
        console.warn(`${webhookCharacterName}のWebhookが見つからないため、コレクターを停止 (Channel: ${channel.id})`);
        collector.stop("Webhook lost");
        return;
      }
      
      const currentChannelId = message.channel.id; // collectorが複数のチャンネルで動く可能性はないが、明示的に
      if (!conversationHistory.has(currentChannelId)) {
        conversationHistory.set(currentChannelId, []);
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

      const historyForAI = conversationHistory.get(currentChannelId);
      
      // ユーザーメッセージを履歴に追加する前にAIに渡す
      const { response: responseText, updatedHistory: processedHistory } = await getTamaResponse(content, historyForAI);
      
      // AIからの応答を得た後、ユーザーメッセージとAIの応答を会話履歴に正式に追加
      const newHistory = [...(processedHistory || historyForAI)]; // getTamaResponseが履歴を返さなかった場合のフォールバック
      newHistory.push({ role: 'user', content: content }); 
      newHistory.push({ role: 'model', content: responseText });
      
      // 履歴の長さを制限
      while (newHistory.length > 20) { // システムプロンプト分も考慮すると22だが、シンプルに20とする
        newHistory.shift(); // 古いものから削除
      }
      conversationHistory.set(currentChannelId, newHistory);

      try {
        await newCreatedWebhook.send(responseText);
      } catch (webhookSendError){
        console.error(`Webhook (${webhookCharacterName}) からメッセージ送信時にエラー:`, webhookSendError);
        // ここで collector.stop() を呼ぶか、あるいはWebhook再作成を試みるかなどのエラー処理も考えられる
      }
    });
    
    collector.on('end', (collected, reason) => {
        console.log(`Collector for ${webhookCharacterName} in channel ${channel.id} stopped. Reason: ${reason || 'Unknown'}`);
        if (interaction.client.activeCollectors) {
            interaction.client.activeCollectors.delete(collectorKey);
        }
        // 退出時にWebhookを自動削除する場合はここにロジックを追加できるが、
        // 現在はコマンドによる明示的な削除のみ
        // if (newCreatedWebhook && reason !== 'Toka dismissed by command' && reason !== 'New Toka instance summoned, stopping old collector.') {
        //   newCreatedWebhook.delete('Collector stopped unexpectedly.').catch(err => console.error('Error deleting webhook on collector end:', err));
        // }
    });

    const embed = new EmbedBuilder().setColor(0x00FF00).setDescription(`${webhookCharacterName} を召喚しました。`);
    await interaction.editReply({ embeds: [embed] }); 
  },
};
