// toka.js (ephemeral: true を使用する修正版)
const { EmbedBuilder, SlashCommandBuilder, ChannelType } = require('discord.js'); // InteractionResponseFlags を一旦削除
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

// getTamaResponse 関数は変更なし (前回のものを使用)
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
        parts: msg.parts.map(part => ({ text: part.text }))
      })).filter(Boolean);

      const chat = model.startChat({ history: validHistory });

      if (history.length === 0 && systemPrompt) {
        try {
          await chat.sendMessage(systemPrompt);
        } catch (systemError) {
          console.warn(`[${modelName}] systemPrompt送信で失敗: ${systemError.message}`);
        }
      }

      const result = await chat.sendMessage(userMessage);
      const response = await result.response.text();

      if (i > 0 && !fallbackNoticeShown) {
        console.warn(`[INFO] ${tryModels[0]} が失敗したため、${modelName} にフォールバックしました。`);
        fallbackNoticeShown = true;
      }
      return response;
    } catch (error) {
      let errorMessage = error.message;
      if (error.response && error.response.data && error.response.data.error && error.response.data.error.message) {
        errorMessage = error.response.data.error.message;
      }
      console.warn(`[${modelName}] で失敗: ${errorMessage}`, error.stack);
      lastError = new Error(`[${modelName}] ${errorMessage}`);
      if (error.message.includes('429') || error.message.includes('Quota') || error.message.includes('API key not valid')) {
        console.error(`[${modelName}] 回復不能なAPIエラー。処理を中断します。: ${error.message}`);
        break; 
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
    // ephemeral: true を使用する
    await interaction.deferReply({ ephemeral: true }); // これが toka.js:102 付近

    const userId = '1155356934292127844';
    const channel = interaction.channel;

    if (!channel || !channel.isTextBased() || channel.type === ChannelType.DM) {
        await interaction.editReply({ content: 'このコマンドはDM以外のテキストチャンネルでのみ使用できます。' });
        return;
    }

    let originalUser;
    try {
        originalUser = await interaction.client.users.fetch(userId);
    } catch (fetchError) {
        console.error(`ベースユーザーID (${userId}) の取得に失敗:`, fetchError);
        await interaction.editReply({ content: 'Webhookの元となるユーザー情報の取得に失敗しました。' });
        return;
    }
    
    const webhookName = `TokaWebhook_${originalUser.username}`;
    let webhooks;
    try {
        webhooks = await channel.fetchWebhooks();
    } catch (fetchWebhookError) {
        console.error(`Webhookの取得に失敗 (Channel: ${channel.id}):`, fetchWebhookError);
        await interaction.editReply({ content: 'Webhook情報の取得に失敗しました。ボットに「ウェブフックの管理」権限があるか確認してください。'});
        return;
    }
    
    const tamaWebhook = webhooks.find((wh) => wh.name === webhookName && wh.owner?.id === interaction.client.user.id);
    const collectorKey = `${channel.id}_toka`;

    if (tamaWebhook) {
      try {
        await tamaWebhook.delete('Toka command: cleanup');
        if (interaction.client.activeCollectors && interaction.client.activeCollectors.has(collectorKey)) {
            interaction.client.activeCollectors.get(collectorKey).stop('Toka dismissed by command.');
        }
        const embed = new EmbedBuilder().setColor(0xFF0000).setDescription('とーかを退出させました。またね、ちーくん…(；；)');
        await interaction.editReply({ embeds: [embed] });
      } catch (deleteError) {
        console.error("Webhook削除エラー:", deleteError);
        await interaction.editReply({ content: 'Webhookの退出処理中にエラーが発生しました。' });
      }
      return; 
    }

    let newTamaWebhook;
    try {
      newTamaWebhook = await channel.createWebhook({
          name: webhookName,
          avatar: originalUser.displayAvatarURL(),
          reason: 'Toka AI character webhook'
      });
    } catch (createError) {
        console.error("Webhook作成エラー:", createError);
        await interaction.editReply({ content: 'Webhookの作成に失敗しました。ボットに「ウェブフックの管理」権限があるか確認してください。'});
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
      // (collectイベント内のコードは前回のものと同様)
      if (!newTamaWebhook || !(await channel.fetchWebhooks().then(whs => whs.has(newTamaWebhook.id)))) {
        console.warn(`TokaのWebhookが見つからないため、コレクターを停止 (Channel: ${channel.id})`);
        collector.stop("Webhook lost");
        return;
      }

      const currentChannelId = message.channel.id;
      if (!conversationHistory.has(currentChannelId)) {
        conversationHistory.set(currentChannelId, []);
      }
      const history = conversationHistory.get(currentChannelId);
      
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

      try {
        const responseText = await getTamaResponse(content, history);
        history.push({ role: 'user', parts: [{ text: content }] });
        history.push({ role: 'model', parts: [{ text: responseText }] });
        if (history.length > 20) {
            history.splice(0, history.length - 20);
        }
        await newTamaWebhook.send(responseText);
      } catch (error) {
        console.error('Gemini応答取得またはWebhook送信時のエラー (Toka):', error);
      }
    });

    collector.on('end', (collected, reason) => {
        console.log(`Collector for Toka in channel ${channel.id} stopped. Reason: ${reason || 'Unknown'}`);
        if (interaction.client.activeCollectors) {
            interaction.client.activeCollectors.delete(collectorKey);
        }
    });

    const summonEmbed = new EmbedBuilder().setColor(0x00FF00).setDescription('ちーくん、とーかだよっ！呼んでくれてありがと！いっぱいお話できるの嬉しいなっ (*´꒳`*)');
    await interaction.editReply({ embeds: [summonEmbed] });
  },
};