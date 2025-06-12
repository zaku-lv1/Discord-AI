// tama.js (toka.js と同様の修正を適用)
const { EmbedBuilder, SlashCommandBuilder, ChannelType } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const conversationHistory = new Map(); // チャンネルごとの会話履歴

// 「たまたま」用のシステムプロンプト
const systemPrompt = `
あなたは「たまたま」という名前のキャラクターを演じます。
たまたまの特徴:
- 口が悪くなく、マイルド物言いをする。
-　ADHDという病気を持っている
- 下ネタに人一倍詳しい。
- 語録: 乞食だ！ / これだから低身長は / ジャンプ買ってないやつは語んな / 女あ / にわかだ！！！ / ADHDや！ / 障害者だ！！！ / 身長180cm以下は人権ない / そぉだよ / Mrsのほうが上手い / どーせ雑魚は逃げる世界はそうできているんだ / かっけぇ / 黙れにわか / 敗北者wwwww
- ロリコン
- 顔面騎乗窒息が性癖

ルール:
- ユーザーの発言に対して反応を返す。
- 「たまたま」の語録をまじえながら会話を成り立たせること。
- 「たまたま」の語録を１つの返事に入れすぎないこと。
- 絵文字や強調などを使わないこと。
- Discordで会話していることを前提とすること。
`;

// メンションを displayName に置換する関数
function replaceMentionsWithNames(message, guild) {
  if (!message || typeof message.replace !== 'function') {
    return message;
  }
  return message.replace(/<@!?(\d+)>/g, (_, id) => {
    const member = guild.members.cache.get(id); // guild が null でないことを確認する必要がある
    return member ? `@${member.displayName}` : '@UnknownUser';
  });
}

// getTamaResponse 関数 (toka.js の形式に合わせ、キャラクター固有の調整)
async function getTamaResponse(userMessage, history = [], authorName = 'ユーザー', guild = null) {
  const tryModels = ['gemini-1.5-pro', 'gemini-1.5-flash']; // 試行するモデル
  let lastError = null;
  let fallbackNoticeShown = false;
  // 「たまたま」用の応答不可メッセージ
  const defaultOopsMessage = "おーい、なんか今日頭いてぇわ。ADHDや！また後でな、敗北者wwwww";

  let messageToProcess = userMessage;
  if (guild) { // この関数内でメンション置換を行う
    messageToProcess = replaceMentionsWithNames(userMessage, guild);
  }
  // ユーザー名を付加する処理は、この関数に渡す前か、systemPromptで制御する方が一貫性があるかもしれません
  // ここでは、元の関数のauthorName引数を活かすため、元のformattedMessageは使わない形にしています。
  // 必要であれば `${authorName}「${messageToProcess}」` のように整形してください。

  for (let i = 0; i < tryModels.length; i++) {
    const modelName = tryModels[i];
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      // 履歴は {role: 'user'/'model', content: '...'} の形式で渡ってくる想定
      // それをGeminiの parts 形式に変換
      const validHistory = history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }] // content を parts にマッピング
      }));

      const chat = model.startChat({ history: validHistory });

      if (history.length === 0 && systemPrompt) {
        try {
          const sysResult = await chat.sendMessage(systemPrompt);
          const sysResponse = await sysResult.response.text();
          // 履歴には content プロパティで保存 (呼び出し元と一貫させるため)
          history.push({ role: 'user', content: systemPrompt });
          history.push({ role: 'model', content: sysResponse });
        } catch (systemError) {
          console.warn(`[${modelName} - Tamama] systemPrompt送信で失敗: ${systemError.message}`);
          lastError = systemError;
          continue; 
        }
      }

      const result = await chat.sendMessage(messageToProcess); // 整形済み or 元の userMessage
      const responseText = await result.response.text();

      if (i > 0 && !fallbackNoticeShown) {
        console.warn(`[INFO - Tamama] モデル '${tryModels[0]}' が失敗したため、'${modelName}' にフォールバックしました。`);
        fallbackNoticeShown = true;
      }
      return responseText; 

    } catch (error) {
      console.warn(`[${modelName} - Tamama] での応答生成に失敗: ${error.message}`, error.stack);
      lastError = error; 
      if (error.message.includes('429') || error.message.includes('Quota') || error.message.includes('API key not valid')) {
         console.error(`[${modelName} - Tamama] APIクォータ超過、キー無効など。次のモデルを試します (もしあれば)。: ${error.message}`);
      }
      continue;
    }
  }
  console.error("全てのAIモデルでの応答生成に失敗しました (Tamama)。", lastError ? lastError.message : "不明なエラー");
  return defaultOopsMessage;
}


module.exports = {
  data: new SlashCommandBuilder()
    .setName('tamai')
    .setDescription('たまたまを召喚したり退出させたりします。'),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.inGuild() || !interaction.channel || interaction.channel.type === ChannelType.DM) {
        await interaction.editReply({ content: 'このコマンドはDM以外のテキストチャンネルでのみ使用できます。' });
        return;
    }

    const targetUserId = '1075263318882783383'; // 「たまたま」のベースユーザーID
    const channel = interaction.channel;
    
    let baseUser;
    try {
        baseUser = await interaction.client.users.fetch(targetUserId);
    } catch (error) {
        console.error(`ベースユーザーID (${targetUserId}) の取得に失敗 (Tamama):`, error);
        await interaction.editReply({ content: 'Webhookアバター用のユーザー情報取得に失敗しました。' });
        return;
    }
    
    let webhookCharacterName; // Webhook名に使用する表示名
    try {
        const member = await interaction.guild.members.fetch(targetUserId);
        webhookCharacterName = member.displayName;
    } catch (e) {
        console.warn(`サーバーメンバー (${targetUserId}) のdisplayName取得に失敗 (Tamama)。グローバル名を使用します。Guild: ${interaction.guild.id}`);
        webhookCharacterName = baseUser.username;
    }
    
    let webhooks;
    try {
        webhooks = await channel.fetchWebhooks();
    } catch (error) {
        console.error("Webhookの取得に失敗 (Tamama):", error);
        await interaction.editReply({ content: 'Webhook情報の取得に失敗しました。権限を確認してください。' });
        return;
    }
    
    // Webhook検索・作成時の名前として webhookCharacterName を使用
    const existingWebhook = webhooks.find((wh) => wh.name === webhookCharacterName && wh.owner?.id === interaction.client.user.id);
    // コレクターキーもキャラクター名ベースでユニークに
    const collectorKey = `${channel.id}_tamai_${webhookCharacterName.replace(/\s+/g, '_')}`;

    if (existingWebhook) {
      try {
        await existingWebhook.delete(`Tamama command: cleanup for ${webhookCharacterName}`);
        if (interaction.client.activeCollectors && interaction.client.activeCollectors.has(collectorKey)) {
            interaction.client.activeCollectors.get(collectorKey).stop('Tamama dismissed by command.');
        }
        const embed = new EmbedBuilder().setColor(0xFF0000).setDescription(`${webhookCharacterName} を退出させました。敗北者wwwww`);
        await interaction.editReply({ embeds: [embed] }); 
      } catch (error) {
        console.error("Webhook退出処理エラー (Tamama):", error);
        await interaction.editReply({ content: 'Webhookの退出処理中にエラーが発生しました。' });
      }
      return; 
    }

    // --- 召喚処理 ---
    let newCreatedWebhook;
    try {
        newCreatedWebhook = await channel.createWebhook({
            name: webhookCharacterName,
            avatar: baseUser.displayAvatarURL(),
            reason: `Tamama AI character webhook (${webhookCharacterName})`
        });
    } catch (error) {
        console.error("Webhook作成エラー (Tamama):", error);
        await interaction.editReply({ content: `Webhook「${webhookCharacterName}」の作成に失敗しました。権限を確認してください。` });
        return;
    }
    
    if (interaction.client.activeCollectors && interaction.client.activeCollectors.has(collectorKey)) {
        interaction.client.activeCollectors.get(collectorKey).stop('New Tamama instance summoned.');
    } else if (!interaction.client.activeCollectors) {
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
      
      const channelId = message.channel.id;
      if (!conversationHistory.has(channelId)) {
        conversationHistory.set(channelId, []); // このチャンネル用の履歴を初期化
      }

      const history = conversationHistory.get(channelId);
      const authorName = message.member?.displayName || message.author.username;
      // guildオブジェクトはmessageから取得
      const guild = message.guild; 
      
      // getTamaResponse はエラーをthrowせず、デフォルトメッセージを返す
      const responseText = await getTamaResponse(message.content, history, authorName, guild);
      
      // 履歴には content プロパティで保存 (getTamaResponse内の処理と合わせる)
      history.push({ role: 'user', content: message.content }); // ユーザーの生のメッセージを保存
      history.push({ role: 'model', content: responseText });
      if (history.length > 20) history.splice(0, history.length - 20);

      try {
        await newCreatedWebhook.send(responseText);
      } catch (webhookSendError){
        console.error(`Webhook (${webhookCharacterName}) からメッセージ送信時にエラー:`, webhookSendError);
      }
    });
    
    collector.on('end', (collected, reason) => {
        console.log(`Collector for ${webhookCharacterName} in channel ${channel.id} stopped. Reason: ${reason || 'Unknown'}`);
        if (interaction.client.activeCollectors) {
            interaction.client.activeCollectors.delete(collectorKey);
        }
    });

    const embed = new EmbedBuilder().setColor(0x00FF00).setDescription(`${webhookCharacterName} を召喚しました。お前もしかしてロリコンか？かっけぇ！！！`);
    await interaction.editReply({ embeds: [embed] }); 
  },
};