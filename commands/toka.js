const { EmbedBuilder, SlashCommandBuilder } = require('discord.js'); // WebhookClientを削除、EmbedBuilderとSlashCommandBuilderを使用
// node-fetch と global.fetch の設定を削除 (Node.js v18+のため)

const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const conversationHistory = new Map();

// systemPrompt は変更なし
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

// getTamaResponse 関数は、履歴の形式を含め、元のコードのままとします。
// 内部の history.push で 'content' を使っている点も元のままです。
async function getTamaResponse(userMessage, history = []) {
  const tryModels = ['gemini-1.5-pro', 'gemini-1.5-flash'];
  let lastError = null;
  let fallbackNoticeShown = false;

  for (let i = 0; i < tryModels.length; i++) {
    const modelName = tryModels[i];
    try {
      const model = genAI.getGenerativeModel({ model: modelName });

      const validHistory = history.map(msg => ({ // msg.content を parts にマッピング
        role: msg.role,
        parts: [{ text: msg.content }] 
      }));

      const chat = model.startChat({ history: validHistory });

      if (history.length === 0 && systemPrompt) { // systemPromptの存在チェックを追加
        try {
          const sysResult = await chat.sendMessage(systemPrompt);
          const sysResponse = await sysResult.response.text();
          // 元のコード通り、contentプロパティで履歴に追加
          history.push({ role: 'user', content: systemPrompt });
          history.push({ role: 'model', content: sysResponse });
        } catch (systemError) {
          console.warn(`[${modelName}] systemPrompt送信で失敗: ${systemError.message}`);
          // systemPromptの失敗は致命的かもしれないので、エラーを再スローするかどうか検討
          // throw systemError; // ここで投げると、ユーザーメッセージ処理に進まない
        }
      }

      const result = await chat.sendMessage(userMessage);
      const responseText = await result.response.text(); // 変数名を responseText に変更

      if (i > 0 && !fallbackNoticeShown) {
        console.warn(`[INFO] ${tryModels[0]} が失敗したため、${modelName} にフォールバックしました。`);
        fallbackNoticeShown = true;
      }
      return responseText; // responseText を返す
    } catch (error) {
      console.warn(`[${modelName}] で失敗: ${error.message}`);
      lastError = error;
      // Gemini APIのクォータエラー等を考慮
      if (error.message.includes('429') || error.message.includes('Quota') || error.message.includes('API key not valid')) {
        console.error(`[${modelName}] 回復不能なAPIエラー。getTamaResponse処理を中断します。: ${error.message}`);
        // この場合、呼び出し元にエラーを伝搬させる
        throw error; // エラーを再スローして、呼び出し元で処理できるようにする
      }
      continue;
    }
  }
  if (lastError) { // lastErrorがnullでない場合のみエラーメッセージを構築
    throw new Error(`全てのモデルで応答に失敗しました: ${lastError.message}`);
  }
  throw new Error(`全てのモデルで応答に失敗しました (不明なエラー)`);
}


module.exports = {
  // data を SlashCommandBuilder に変更
  data: new SlashCommandBuilder()
    .setName('toka')
    .setDescription('AI彼女(誰のかは知らないけど)を召喚します。'),
  async execute(interaction) {
    // チャンネルの存在と種類を最初に確認
    if (!interaction.channel || !interaction.channel.isTextBased() || interaction.channel.isDMBased()) {
        // この時点で reply が使えるので、ephemeral: true を使用
        // ただし、このコマンドの主たる応答はephemeralではないため、ここでは警告が出る可能性あり
        await interaction.reply({ content: 'このコマンドはDM以外のテキストチャンネルでのみ使用できます。', ephemeral: true });
        return;
    }

    const userId = '1155356934292127844';
    const channel = interaction.channel;
    
    let webhooks;
    try {
        webhooks = await channel.fetchWebhooks();
    } catch (error) {
        console.error("Webhookの取得に失敗:", error);
        await interaction.reply({ content: 'Webhook情報の取得に失敗しました。権限を確認してください。', ephemeral: true });
        return;
    }

    let baseUser; // userからbaseUserへ変数名変更（衝突を避けるため）
    try {
        baseUser = await interaction.client.users.fetch(userId);
    } catch (error) {
        console.error(`ベースユーザーID (${userId}) の取得に失敗:`, error);
        await interaction.reply({ content: 'Webhookアバター用のユーザー情報取得に失敗しました。', ephemeral: true });
        return;
    }
    
    // Webhook名は元のコードに合わせて user.displayName を使用
    const webhookName = baseUser.displayName;
    let tamaWebhook = webhooks.find((webhook) => webhook.name === webhookName && webhook.owner?.id === interaction.client.user.id);

    if (tamaWebhook) {
      try {
        await tamaWebhook.delete('Toka command: cleanup');
        // MessageEmbed を EmbedBuilder に変更
        const embed = new EmbedBuilder().setDescription('とーかを退出させました。');
        await interaction.reply({ embeds: [embed] }); // 元のコード通り、ephemeralなし
      } catch (error) {
        console.error("Webhook退出処理エラー:", error);
        await interaction.reply({ content: 'Webhookの退出処理中にエラーが発生しました。', ephemeral: true });
      }
      return; // 処理終了
    }

    // --- 召喚処理 ---
    let newCreatedWebhook; // 変数名を変更して明確化
    try {
        newCreatedWebhook = await channel.createWebhook(webhookName, { // user.displayName を webhookName に
            avatar: baseUser.displayAvatarURL(),
        });
    } catch (error) {
        console.error("Webhook作成エラー:", error);
        await interaction.reply({ content: 'Webhookの作成に失敗しました。権限を確認してください。', ephemeral: true });
        return; // 作成失敗時はここで終了
    }
    
    // コレクターのキーは、以前の提案通りユニークなものを使用
    const collectorKey = `${channel.id}_toka`;
    if (interaction.client.activeCollectors && interaction.client.activeCollectors.has(collectorKey)) {
        interaction.client.activeCollectors.get(collectorKey).stop('New Toka instance summoned.');
    } else if (!interaction.client.activeCollectors) {
        interaction.client.activeCollectors = new Map(); // なければ初期化 (メインファイルでの初期化が望ましい)
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
      try {
        const responseText = await getTamaResponse(content, history); // 変数名を responseText に
        // 元のコード通り、contentプロパティで履歴に追加
        history.push({ role: 'user', content: content }); // content を使用
        history.push({ role: 'model', content: responseText }); // responseText を使用
        if (history.length > 20) history.splice(0, history.length - 20); // 元のコード通りsplice(0, 2)から変更

        await newCreatedWebhook.send(responseText); // responseText を送信
      } catch (error) {
        console.error('Gemini応答取得またはWebhook送信時のエラー (Toka):', error.message); // error.messageで詳細表示
        // Gemini APIエラーの場合は collector.stop() しない方が良いかもしれない（一時的なクォータ超過など）
        // ただし、元のコードではstopしていたので、それに合わせるか、エラー内容で分岐するか
        if (error.message.includes('Quota') || error.message.includes('429')) {
            message.reply("ごめんね、とーか今ちょっと疲れちゃったみたい…少し時間をおいて話しかけてくれる？").catch(console.error);
        } else {
            collector.stop(); // それ以外の致命的なエラーの可能性
        }
      }
    });
    
    collector.on('end', (collected, reason) => {
        console.log(`Collector for Toka in channel ${channel.id} (Webhook: ${webhookName}) stopped. Reason: ${reason || 'Unknown'}`);
        if (interaction.client.activeCollectors) {
            interaction.client.activeCollectors.delete(collectorKey);
        }
    });

    // MessageEmbed を EmbedBuilder に変更
    const embed = new EmbedBuilder().setDescription('とーかを召喚しました。');
    await interaction.reply({ embeds: [embed] }); // 元のコード通り、ephemeralなし
  },
};