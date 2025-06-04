// toka.js
const { EmbedBuilder, SlashCommandBuilder, ChannelType } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// APIキーを環境変数から取得
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// 会話履歴をチャンネルIDごとに保存するためのMap
const conversationHistory = new Map(); // ChannelID => [{role: 'user'/'model', content: ''}, ...]

// とーかの基本設定となるシステムプロンプト
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

/**
 * AIモデルから応答を取得する関数
 * @param {string} userMessage ユーザーからのメッセージ
 * @param {Array<Object>} history 現在の会話履歴
 * @returns {Promise<string>} AIからの応答テキスト
 */
async function getTamaResponse(userMessage, history = []) {
  const tryModels = ['gemini-1.5-pro', 'gemini-1.5-flash']; // 試行するモデルのリスト
  let lastError = null;
  let fallbackNoticeShown = false;
  const defaultOopsMessage = "うーん、なんだか今日は言葉がうまく出てこないみたいで……ごめんね、ちーくん。また後で話しかけてみてくれるかな？(；；)";

  for (let i = 0; i < tryModels.length; i++) {
    const modelName = tryModels[i];
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPrompt // システムプロンプトをAIの基本指示として設定
      });

      // APIに渡す形式に会話履歴を変換
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
      return responseText; // AIからの応答テキストを返す
    } catch (error) {
      console.warn(`[WARN] モデル '${modelName}' での応答生成に失敗: ${error.message}`, error.stack);
      lastError = error;
      // APIキーが無効、クォータ超過などの場合はログに詳細を出す
      if (error.message.includes('429') || error.message.includes('Quota') || error.message.includes('API key not valid')) {
         console.error(`[ERROR] API関連のエラーが発生しました (${modelName}): ${error.message}`);
      }
      // 次のモデルを試行 (ループの最後でなければ)
    }
  }

  // すべてのモデルで失敗した場合
  console.error("[ERROR] 全てのAIモデルでの応答生成に失敗しました。", lastError ? lastError.message : "不明なエラー");
  return defaultOopsMessage; // デフォルトのエラーメッセージを返す
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('toka')
    .setDescription('AI彼女(誰のかは知らないけど)を召喚します。'),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true }); // コマンド実行に時間がかかることをDiscordに通知

    // DMやテキスト以外のチャンネルではコマンドを使用不可にする
    if (!interaction.inGuild() || !interaction.channel || interaction.channel.type === ChannelType.DM) {
        await interaction.editReply({ content: 'このコマンドはDM以外のテキストチャンネルでのみ使用できます。' });
        return;
    }

    const userIdForWebhook = '1155356934292127844'; // Webhookのアバターと名前に使用するユーザーID
    const channel = interaction.channel;

    let baseUser; // Webhookの見た目に使うユーザー情報
    try {
        baseUser = await interaction.client.users.fetch(userIdForWebhook);
    } catch (error) {
        console.error(`[ERROR] Webhook用のベースユーザーID (${userIdForWebhook}) の取得に失敗:`, error);
        await interaction.editReply({ content: 'Webhook用のユーザー情報取得に失敗しました。管理者にご連絡ください。' });
        return;
    }

    const webhookCharacterName = baseUser.displayName; // Webhook名 (Discordの表示名)
    let webhooks;
    try {
        webhooks = await channel.fetchWebhooks();
    } catch (error) {
        console.error("[ERROR] Webhookの取得に失敗:", error);
        await interaction.editReply({ content: 'Webhook情報の取得に失敗しました。ボットに必要な権限（ウェブフックの管理）があるか確認してください。' });
        return;
    }

    // 既存のToka用Webhookを探す (ボット自身がオーナーのもの)
    const existingWebhook = webhooks.find((wh) => wh.name === webhookCharacterName && wh.owner?.id === interaction.client.user.id);
    // コレクターを識別するためのキー
    const collectorKey = `${channel.id}_toka_${webhookCharacterName.replace(/\s+/g, '_')}`;

    // 既存のWebhookがある場合 (Tokaを退出させる処理)
    if (existingWebhook) {
      try {
        await existingWebhook.delete(`Toka command: cleanup for ${webhookCharacterName}`);
        // 有効なコレクターがあれば停止
        if (interaction.client.activeCollectors && interaction.client.activeCollectors.has(collectorKey)) {
            interaction.client.activeCollectors.get(collectorKey).stop('Toka dismissed by command.');
            // activeCollectorsからの削除は 'end' イベントで行う
        }
        // 退出時に会話履歴をクリアする場合 (任意)
        // conversationHistory.delete(channel.id);
        // console.log(`[INFO] Conversation history for channel ${channel.id} cleared on Toka dismissal.`);

        const embed = new EmbedBuilder().setColor(0xFF0000).setDescription(`${webhookCharacterName} を退出させました。`);
        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        console.error("[ERROR] Webhook退出処理エラー:", error);
        await interaction.editReply({ content: 'Webhookの退出処理中にエラーが発生しました。' });
      }
      return;
    }

    // --- 召喚処理 ---
    // 新しいTokaセッションのために、このチャンネルの古い会話履歴をクリア
    conversationHistory.delete(channel.id);
    console.log(`[INFO] Cleared conversation history for channel ${channel.id} for new Toka session.`);

    let newCreatedWebhook; // 作成される新しいWebhook
    try {
        newCreatedWebhook = await channel.createWebhook({
            name: webhookCharacterName,
            avatar: baseUser.displayAvatarURL(),
            reason: `Toka AI character webhook (${webhookCharacterName})`
        });
    } catch (error) {
        console.error("[ERROR] Webhook作成エラー:", error);
        await interaction.editReply({ content: `Webhook「${webhookCharacterName}」の作成に失敗しました。ボットに必要な権限（ウェブフックの管理）があるか、またはWebhook数の上限に達していないか確認してください。` });
        return;
    }

    // もし古いコレクターが何らかの理由で残っていたら停止
    if (interaction.client.activeCollectors && interaction.client.activeCollectors.has(collectorKey)) {
        interaction.client.activeCollectors.get(collectorKey).stop('New Toka instance summoned, stopping old collector.');
    }
    // activeCollectors が未定義の場合の初期化 (ボット起動後初回など)
    if (!interaction.client.activeCollectors) {
        interaction.client.activeCollectors = new Map();
    }

    // メッセージコレクターを作成 (ボット以外のユーザーのメッセージを収集)
    const collector = channel.createMessageCollector({
        filter: (msg) => !msg.author.bot && msg.author.id !== interaction.client.user.id
    });
    interaction.client.activeCollectors.set(collectorKey, collector); // 作成したコレクターを管理Mapに追加

    // メッセージが収集されたときの処理
    collector.on('collect', async (message) => {
      // Webhookが削除されたなどの理由で存在しない場合はコレクターを停止
      if (!newCreatedWebhook || !(await channel.fetchWebhooks().then(whs => whs.has(newCreatedWebhook.id)))) {
        console.warn(`[WARN] ${webhookCharacterName}のWebhookが見つからないため、コレクターを停止 (Channel: ${channel.id})`);
        collector.stop("Webhook lost");
        return;
      }

      const currentChannelId = message.channel.id;
      // 現在のチャンネルの会話履歴を取得 (なければ空配列)
      const currentHistory = conversationHistory.get(currentChannelId) || [];

      let content = message.content; // ユーザーのメッセージ内容

      // 空のメッセージやスペースのみのメッセージはAIに送らない (任意)
      if (!content || content.trim() === "") {
          console.log("[INFO] Empty message received, not sending to AI.");
          // 必要であれば、ここでユーザーに何か伝える処理を追加しても良い
          // 例: await newCreatedWebhook.send("えっと、何か言ってほしいな…？");
          return;
      }

      // メッセージ内のメンションをユーザー名に置換 (例: <@USER_ID> -> @username)
      const mentionRegex = /<@!?(\d+)>/g;
      let match;
      while ((match = mentionRegex.exec(content)) !== null) {
        const mentionedId = match[1];
        try {
          const mentionedUser = await message.client.users.fetch(mentionedId);
          content = content.replace(match[0], `@${mentionedUser.username}`);
        } catch (err) {
          console.warn(`[WARN] メンションされたユーザーID ${mentionedId} の取得に失敗しました:`, err);
          // ユーザーが見つからなくても、とりあえずメンション文字列は残すか、別の代替文字列にする
          // content = content.replace(match[0], `@不明なユーザー`);
        }
      }

      // ★ デバッグ用: AIに渡す直前のメッセージ内容をコンソールに出力
      console.log(`[DEBUG] Tokaに渡すメッセージ内容: "${content}" (Channel: ${currentChannelId})`);

      // AIに応答をリクエスト
      const responseText = await getTamaResponse(content, currentHistory);

      // 会話履歴を更新
      const newHistory = [...currentHistory];
      newHistory.push({ role: 'user', content: content }); // ユーザーのメッセージを履歴に追加
      newHistory.push({ role: 'model', content: responseText }); // AIの応答を履歴に追加

      // 古い履歴を削除 (最大10往復 = 20メッセージ程度を保持)
      while (newHistory.length > 20) {
        newHistory.shift(); // 配列の先頭（最も古いメッセージ）から削除
      }
      conversationHistory.set(currentChannelId, newHistory); // 更新された履歴を保存

      try {
        await newCreatedWebhook.send(responseText); // Webhook経由でAIの応答を送信
      } catch (webhookSendError){
        console.error(`[ERROR] Webhook (${webhookCharacterName}) からメッセージ送信時にエラー:`, webhookSendError);
        // Webhookが無効になっている可能性 (手動で削除されたなど)
        if (webhookSendError.code === 10015) { // Unknown Webhook
            console.error(`[ERROR] Webhook ID ${newCreatedWebhook.id} が見つかりません。コレクターを停止します。`);
            collector.stop('Webhook deleted externally');
        }
      }
    });

    // コレクターが停止したときの処理
    collector.on('end', (collected, reason) => {
        console.log(`[INFO] Collector for ${webhookCharacterName} in channel ${channel.id} stopped. Reason: ${reason || 'Unknown'}`);
        // 管理Mapからコレクターを削除
        if (interaction.client.activeCollectors) {
            interaction.client.activeCollectors.delete(collectorKey);
        }
        // コマンド以外でコレクターが停止した場合、Webhookを削除するなどのクリーンアップ処理も検討できる
        // if (newCreatedWebhook && reason !== 'Toka dismissed by command' && reason !== 'New Toka instance summoned, stopping old collector.') {
        //   newCreatedWebhook.delete('Collector stopped unexpectedly or Toka left.')
        //     .catch(err => console.warn('[WARN] Error deleting webhook on collector end:', err));
        // }
    });

    const embed = new EmbedBuilder().setColor(0x00FF00).setDescription(`${webhookCharacterName} を召喚しました。`);
    await interaction.editReply({ embeds: [embed] });
  },
};