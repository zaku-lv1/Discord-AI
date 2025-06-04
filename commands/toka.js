// WebhookClient は直接使っていないので不要、MessageEmbed を EmbedBuilder に変更
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
// Node.js v18+ では global.fetch が利用可能なので、node-fetch のインポートは不要
// const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
// global.fetch = fetch; // これも不要

const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const conversationHistory = new Map(); // チャンネルごとの会話履歴

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

// getTamaResponse 関数は変更なし (node-fetch 依存がなければ)
async function getTamaResponse(userMessage, history = []) {
  const tryModels = ['gemini-1.5-pro', 'gemini-1.5-flash'];
  let lastError = null;
  let fallbackNoticeShown = false;

  for (let i = 0; i < tryModels.length; i++) {
    const modelName = tryModels[i];
    try {
      const model = genAI.getGenerativeModel({ model: modelName });

      // Gemini APIに渡す履歴の形式を検証・整形
      const validHistory = history.map(msg => {
        if (!msg.role || !msg.parts || !Array.isArray(msg.parts) || !msg.parts.every(part => typeof part.text === 'string')) {
          // 履歴の形式が不正な場合はエラーを出すか、スキップする
          console.warn(`[${modelName}] 不正な履歴エントリをスキップ:`, msg);
          return null; // または適切なエラー処理
        }
        return {
          role: msg.role,
          parts: msg.parts.map(part => ({ text: part.content || part.text })) // content プロパティも考慮
        };
      }).filter(Boolean); // nullを除去


      const chat = model.startChat({ history: validHistory });

      // systemPromptの送信は初回のみでよい (この関数が呼ばれるたびに送信する必要はない場合もある)
      // 現在の実装では、historyが空の場合にsystemPromptを送信している
      if (history.length === 0 && systemPrompt) { // systemPromptが存在する場合のみ
        try {
          const sysResult = await chat.sendMessage(systemPrompt); // systemPromptがstringであることを確認
          const sysResponse = await sysResult.response.text();
          // history.push({ role: 'user', parts: [{ text: systemPrompt }] }); // Geminiの形式で履歴に追加
          // history.push({ role: 'model', parts: [{ text: sysResponse }] });
          // 注意: この関数内でhistoryを直接変更すると、呼び出し元のhistoryにも影響します。
          // 意図した動作か確認が必要です。getTamaResponseは応答を返すことに専念し、
          // 履歴管理は呼び出し元で行う方が分離が良いかもしれません。
          // ここでは、呼び出し元で履歴管理しているので、この関数内でのhistory.pushは不要かもしれません。
        } catch (systemError) {
          console.warn(`[${modelName}] systemPrompt送信で失敗: ${systemError.message}`);
          // systemPromptの送信失敗は致命的ではないかもしれないので、処理を続けるかエラーにするか選択
          // throw systemError; // ここでエラーにすると、ユーザーメッセージの処理に進まない
        }
      }

      const result = await chat.sendMessage(userMessage); // userMessageがstringであることを確認
      const response = await result.response.text();

      if (i > 0 && !fallbackNoticeShown) {
        console.warn(`[INFO] gemini-1.5-pro が失敗したため、gemini-1.5-flash にフォールバックしました。`);
        fallbackNoticeShown = true;
      }

      return response;

    } catch (error)
    {
      // APIからのエラーレスポンスに詳細が含まれている場合がある
      let errorMessage = error.message;
      if (error.response && error.response.data && error.response.data.error && error.response.data.error.message) {
        errorMessage = error.response.data.error.message;
      }
      console.warn(`[${modelName}] で失敗: ${errorMessage}`, error.stack);
      lastError = new Error(`[${modelName}] ${errorMessage}`); // エラーオブジェクトにモデル名を付与
      // APIのレート制限や認証エラーなどの場合、リトライしても無駄なことがある
      if (error.message.includes('429') || error.message.includes('Quota') || error.message.includes('API key not valid')) {
        console.error(`[${modelName}] 回復不能なAPIエラー。処理を中断します。: ${error.message}`);
        break; // リトライを中断
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
  // SlashCommandBuilder を使用
  data: new SlashCommandBuilder()
    .setName('toka')
    .setDescription('AI彼女(誰のかは知らないけど)を召喚します。'),
  async execute(interaction) {
    const userId = '1155356934292127844'; // Webhookの元にするユーザーID
    const channel = interaction.channel;

    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
        await interaction.reply({ content: 'このコマンドはテキストチャンネルでのみ使用できます。', ephemeral: true});
        return;
    }

    const webhooks = await channel.fetchWebhooks();
    const originalUser = await interaction.client.users.fetch(userId).catch(() => null);

    if (!originalUser) {
        await interaction.reply({ content: 'Webhookの元となるユーザー情報の取得に失敗しました。', ephemeral: true });
        return;
    }

    // Webhook名にユーザー名と識別子を含めるなどして、よりユニークにする
    const webhookName = `TokaWebhook_${originalUser.username}`;
    let tamaWebhook = webhooks.find((webhook) => webhook.name === webhookName && webhook.owner.id === interaction.client.user.id);


    if (tamaWebhook) {
      await tamaWebhook.delete('Toka command re-issued or cleanup.');
      // EmbedBuilder を使用
      const embed = new EmbedBuilder()
        .setColor(0xFF0000) // 例: 赤色
        .setDescription('とーかを退出させました。またね、ちーくん…(；；)');
      await interaction.reply({ embeds: [embed], ephemeral: true });
      // 古いコレクターが残っていれば停止 (Mapなどで管理が必要)
      // このコマンドの設計上、チャンネルごとに1つの「とーか」インスタンスを想定
      // もし古いコレクターを停止したい場合、collectorを外部で管理する必要がある
      return;
    }

    try {
      tamaWebhook = await channel.createWebhook({
          name: webhookName,
          avatar: originalUser.displayAvatarURL(),
          reason: 'Toka AI character webhook'
      });
    } catch (error) {
        console.error("Webhookの作成に失敗しました:", error);
        await interaction.reply({ content: 'Webhookの作成に失敗しました。ボットに「ウェブフックの管理」権限があるか確認してください。', ephemeral: true });
        return;
    }


    // EmbedBuilder を使用
    const summonEmbed = new EmbedBuilder()
        .setColor(0x00FF00) // 例: 緑色
        .setDescription('ちーくん、とーかだよっ！呼んでくれてありがと！いっぱいお話できるの嬉しいなっ (*´꒳`*)');
    await interaction.reply({ embeds: [summonEmbed], ephemeral:true }); // コマンド発行者のみに見せる

    // チャンネルIDをキーにしてコレクターを管理 (多重起動防止のため)
    // このMapはグローバルスコープか、clientオブジェクトに持たせるなどして永続化が必要
    if (!interaction.client.activeCollectors) {
        interaction.client.activeCollectors = new Map();
    }
    if (interaction.client.activeCollectors.has(channel.id)) {
        interaction.client.activeCollectors.get(channel.id).stop('New Toka instance summoned.');
    }


    const collector = channel.createMessageCollector({ filter: (msg) => !msg.author.bot && msg.author.id !== interaction.client.user.id });
    interaction.client.activeCollectors.set(channel.id, collector);


    collector.on('collect', async (message) => {
      // Webhookが何らかの理由で削除された場合などへの対処
      if (!tamaWebhook || !await channel.fetchWebhooks().then(whs => whs.has(tamaWebhook.id))) {
        console.warn("Webhookが見つからないため、コレクターを停止します。");
        collector.stop("Webhook lost");
        return;
      }

      const currentChannelId = message.channel.id; // message.channel.id を使う
      if (!conversationHistory.has(currentChannelId)) {
        conversationHistory.set(currentChannelId, []);
      }

      let content = message.content;

      // メンションの処理は変更なし
      const mentionRegex = /<@!?(\d+)>/g;
      const matches = [...content.matchAll(mentionRegex)];

      for (const match of matches) {
        const mentionedId = match[1];
        try {
          const mentionedUser = await message.client.users.fetch(mentionedId);
          // Discordの慣習に合わせて@ユーザー名
          const displayName = `@${mentionedUser.username}`;
          content = content.replace(match[0], displayName);
        } catch (err) {
          console.error(`ユーザーID ${mentionedId} の取得に失敗しました:`, err);
          // 失敗した場合は元のメンション文字列のままにするか、<@ID>のままにする
        }
      }

      const history = conversationHistory.get(currentChannelId);
      try {
        const responseText = await getTamaResponse(content, history);

        // 履歴をGemini APIの形式に合わせて保存
        history.push({ role: 'user', parts: [{ text: content }] });
        history.push({ role: 'model', parts: [{ text: responseText }] });
        // 履歴が長くなりすぎないように調整 (例: 直近10往復 = 20エントリ)
        if (history.length > 20) { // 20エントリ = 10往復 + system prompt (もしあれば)
            history.splice(0, history.length - 20);
        }

        await tamaWebhook.send(responseText);
      } catch (error) {
        console.error('Gemini応答取得またはWebhook送信時のエラー:', error);
        // エラーの種類によってユーザーに通知するかどうかを検討
        // message.channel.send('とーかちょっと調子悪いみたい…ごめんねちーくん(´；ω；｀)').catch(console.error);
        // 致命的なエラーの場合コレクターを停止することも検討
        // collector.stop('API error');
      }
    });

    collector.on('end', (collected, reason) => {
        console.log(`Collector for Toka in channel ${channel.id} stopped. Reason: ${reason || 'Unknown'}`);
        interaction.client.activeCollectors.delete(channel.id);
        // Webhookをここで削除するかどうかは設計次第
        // if (tamaWebhook && reason !== 'New Toka instance summoned.') { // 新規召喚以外で終了した場合
        //   tamaWebhook.delete('Toka conversation ended.').catch(console.error);
        // }
        // conversationHistory.delete(channel.id); // 会話履歴もクリア
    });
  },
};