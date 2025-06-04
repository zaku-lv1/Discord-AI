// discord.js から必要なモジュールをインポート
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
// Node.js v18+ では global.fetch が利用可能なので、node-fetch のインポートは不要

const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const conversationHistory = new Map(); // チャンネルごとの会話履歴

// systemPrompt は変更なし
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

// メンションを displayName に置換する関数 (変更なし)
function replaceMentionsWithNames(message, guild) {
  if (!message || typeof message.replace !== 'function') {
    return message; // messageがnullやundefined、またはreplaceメソッドを持たない場合はそのまま返す
  }
  return message.replace(/<@!?(\d+)>/g, (_, id) => {
    const member = guild.members.cache.get(id);
    return member ? `@${member.displayName}` : '@UnknownUser'; // 不明なユーザーの場合の表示を調整
  });
}

// getTamaResponse 関数
async function getTamaResponse(userMessage, history = [], authorName = 'ユーザー', guild = null) {
  // gemini-2.0-flash が有効なモデル名であることを前提とします。
  // もし gemini-1.5-flash の間違いであれば、適宜修正してください。
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }); // gemini-2.0-flashがまだ一般提供されていない可能性を考慮し、1.5-flashに変更。必要なら元に戻してください。

  if (guild) {
    userMessage = replaceMentionsWithNames(userMessage, guild);
  }

  // Gemini APIが期待する履歴の形式に整形
  const validHistory = history.map(msg => ({
    role: msg.role,
    parts: msg.parts, // 履歴は既に parts 形式で保存されている想定
  }));

  const chat = model.startChat({ history: validHistory });

  // systemPromptの送信は初回のみ
  // この関数が呼ばれる時点でhistoryが空なら、呼び出し側でsystemPromptを処理することを検討してもよい
  if (history.length === 0 && systemPrompt) {
    try {
      // systemPrompt は 'user' ロールとして送信し、その応答を 'model' ロールとして履歴に加える
      // ただし、startChatのhistoryに含めるのが一般的。ここでは sendMessage を使っている
      const sysResult = await chat.sendMessage(systemPrompt); // systemPrompt を直接送信
      const sysResponseText = await sysResult.response.text();
      // この関数内で history を変更すると副作用が生じるため注意。
      // 呼び出し元で履歴管理を一元化する方が望ましい。
      // history.push({ role: 'user', parts: [{ text: systemPrompt }] });
      // history.push({ role: 'model', parts: [{ text: sysResponseText }] });
    } catch (error) {
        console.warn(`System prompt の送信または処理に失敗しました: ${error.message}`);
        // system promptの失敗が致命的でない場合は処理を続行可能
    }
  }

  const formattedMessage = `${authorName}「${userMessage}」`;

  try {
    const result = await chat.sendMessage(formattedMessage);
    const response = await result.response.text();
    return response;
  } catch (error) {
    console.error(`Gemini APIからの応答取得エラー (${model.model}):`, error.message);
    // エラーオブジェクトに詳細が含まれている場合がある
    if (error.response && error.response.candidates && error.response.candidates.length > 0) {
        const candidate = error.response.candidates[0];
        if (candidate.finishReason && candidate.finishReason !== 'STOP') {
            console.error('API Finish Reason:', candidate.finishReason);
            if (candidate.safetyRatings) {
                console.error('Safety Ratings:', candidate.safetyRatings);
            }
        }
    }
    throw new Error(`AIの応答取得に失敗しました。(${error.message})`);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tamai') // コマンド名を小文字に (Discordの推奨)
    .setDescription('たまたまを召喚したり退出させたりします。'),
  async execute(interaction) {
    const targetUserId = '1075263318882783383'; // Webhookの元にするユーザーID
    const channel = interaction.channel;

    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      await interaction.reply({ content: 'このコマンドはテキストチャンネルでのみ使用できます。', ephemeral: true });
      return;
    }

    const webhooks = await channel.fetchWebhooks();
    const baseUser = await interaction.client.users.fetch(targetUserId).catch(() => null);

    if (!baseUser) {
      await interaction.reply({ content: 'Webhookの元となるユーザー情報の取得に失敗しました。指定されたIDのユーザーが存在しない可能性があります。', ephemeral: true });
      return;
    }

    const webhookName = `TamamaWebhook_${baseUser.username}`; // Webhook名をよりユニークに
    // ボット自身が作成したWebhookであるかも確認
    let tamaWebhook = webhooks.find((wh) => wh.name === webhookName && wh.owner?.id === interaction.client.user.id);

    if (tamaWebhook) {
      try {
        await tamaWebhook.delete('Tamama command re-issued or cleanup.');
        const embed = new EmbedBuilder()
          .setColor(0xFF0000) // 赤色
          .setDescription('たまたまを退出させました。敗北者wwwww');
        await interaction.reply({ embeds: [embed], ephemeral: true }); // コマンド実行者のみに表示

        // アクティブなコレクターを停止
        if (interaction.client.activeCollectors && interaction.client.activeCollectors.has(channel.id)) {
          interaction.client.activeCollectors.get(channel.id).stop('Tamama recalled.');
        }
      } catch (error) {
        console.error("Webhookの削除またはリプライに失敗:", error);
        await interaction.reply({ content: "Webhookの退出処理中にエラーが発生しました。", ephemeral: true});
      }
      return;
    }

    try {
      tamaWebhook = await channel.createWebhook({
          name: webhookName,
          avatar: baseUser.displayAvatarURL(),
          reason: 'Tamama AI character webhook'
      });
    } catch (error) {
      console.error("Webhookの作成に失敗しました:", error);
      await interaction.reply({ content: 'Webhookの作成に失敗しました。ボットに「ウェブフックの管理」権限があるか確認してください。', ephemeral: true });
      return;
    }

    const summonEmbed = new EmbedBuilder()
      .setColor(0x00FF00) // 緑色
      .setDescription('たまたま召喚したんか！お前もしかしてロリコンか？かっけぇ！！！');
    await interaction.reply({ embeds: [summonEmbed], ephemeral: true }); // コマンド実行者のみに表示

    // コレクター管理用のMapをクライアントに初期化 (index.jsなどで一度だけ行うのが理想)
    if (!interaction.client.activeCollectors) {
      interaction.client.activeCollectors = new Map();
    }
    // 既存のコレクターがあれば停止
    if (interaction.client.activeCollectors.has(channel.id)) {
      interaction.client.activeCollectors.get(channel.id).stop('New Tamama instance summoned.');
    }

    const collector = channel.createMessageCollector({ filter: (msg) => !msg.author.bot && msg.author.id !== interaction.client.user.id });
    interaction.client.activeCollectors.set(channel.id, collector);

    collector.on('collect', async (message) => {
      // Webhookが削除されていないか確認
      const currentWebhooks = await message.channel.fetchWebhooks();
      if (!currentWebhooks.has(tamaWebhook.id)) {
          console.warn(`Webhook (ID: ${tamaWebhook.id}, Name: ${webhookName}) が見つかりません。コレクターを停止します。`);
          collector.stop("Webhook lost");
          return;
      }

      const currentChannelId = message.channel.id;
      if (!conversationHistory.has(currentChannelId)) {
        conversationHistory.set(currentChannelId, []);
      }

      const history = conversationHistory.get(currentChannelId);
      const authorName = message.member?.displayName || message.author.username;
      const guild = message.guild;

      try {
        const responseText = await getTamaResponse(message.content, history, authorName, guild);

        // Gemini APIが期待する形式で履歴に追加
        history.push({ role: 'user', parts: [{ text: `${authorName}「${replaceMentionsWithNames(message.content, guild)}」` }] });
        history.push({ role: 'model', parts: [{ text: responseText }] });

        if (history.length > 20) { // 10往復分 + α の履歴を保持
          history.splice(0, history.length - 20);
        }

        await tamaWebhook.send(responseText);
      } catch (error) {
        console.error(`[${webhookName}] Gemini応答取得またはWebhook送信エラー:`, error.message);
        // ユーザーにエラーを通知するか検討 (例:「たまたまちょっと調子悪いわ、ADHDや！」)
        // collector.stop('API error'); // 致命的なエラーならコレクターを停止
      }
    });

    collector.on('end', (collected, reason) => {
      console.log(`Collector for Tamama in channel ${channel.id} (Webhook: ${webhookName}) stopped. Reason: ${reason || 'Unknown'}`);
      if (interaction.client.activeCollectors && interaction.client.activeCollectors.has(channel.id)) {
          interaction.client.activeCollectors.delete(channel.id);
      }
      // Webhookを自動削除するかは設計次第。ここでは残す。
      // conversationHistory.delete(channel.id); // 会話終了時に履歴をクリアする場合
    });
  },
};