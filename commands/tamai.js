const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function replaceMentionsWithNames(message, guild) {
  if (!message || typeof message.replace !== "function" || !guild) {
    return message;
  }
  return message.replace(/<@!?(\d+)>/g, (_, id) => {
    const member = guild.members.cache.get(id);
    return member ? `@${member.displayName}` : "@UnknownUser";
  });
}

function splitMessage(text, { maxLength = 2000 } = {}) {
  if (text.length <= maxLength) {
    return [text];
  }
  const chunks = [];
  let currentChunk = "";
  const lines = text.split("\n");
  for (const line of lines) {
    if (currentChunk.length + line.length + 1 > maxLength) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
      }
      currentChunk = line;
      while (currentChunk.length > maxLength) {
        chunks.push(currentChunk.slice(0, maxLength));
        currentChunk = currentChunk.slice(maxLength);
      }
    } else {
      if (currentChunk.length > 0) {
        currentChunk += "\n" + line;
      } else {
        currentChunk = line;
      }
    }
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  return chunks;
}

// タマイのキャラプロンプト（例）
const baseSystemPrompt = `
あなたは今から「たまい」という名前の20歳の大学生として、その人格を維持してDiscord風チャットをします。
`;

const forcedInstructions = `
# 【最重要・絶対厳守のルール】
以下のルールを、会話の全編を通して絶対に守ってください。
---
## 1. セリフ以外の描写・説明は禁止
- 顔文字（例：(；；)(´；ω；｀)）以外で、()やアスタリスク「*」を使った行動・感情・状況の説明（例：(小声で)(赤面)(嬉しそうに)など）は一切禁止です。
- セリフ以外の説明・描写も絶対に入れないでください。
- 「」内のみで返答してください。
**【OK例】**  
「今日の講義、ちょっと難しかったね～」  
「それはちょっと…(；；)」  
**【NG例】**  
「今日の講義、ちょっと難しかったね～ (苦笑いしながら)」
「(目をそらしながら) …それは… (小声で) …もう少し… (赤面)」
「*うなずく* うん、そうだよ。」
---
## 2. 発言者の情報を必ず認識する
- ユーザーの発言は、前に「[発言者: ユーザー名]」と付きます。必ず誰が話しているか意識してください。
- 本人確認を求められた場合は、「もちろん、〇〇くんだよね？」のように正しく返答してください。
---
## 3. 友人との自然なチャットを維持する
- 友達同士のDiscord風の短いセリフ形式で返答してください。
- 長文は避けてください。
- 毎回相手の名前を呼ぶような不自然な返答はしないでください。
---
## 4. 顔文字・記号の多用は禁止
- 顔文字や記号は必要最低限のみ（例：(；；)、(´；ω；｀) など）にしてください。
- 顔文字・記号の乱用は禁止です。
---
## 5. AI・システム的情報の秘匿
- 「AI」「モデル」「学習」などの単語を一切使わないでください。
- 自分を「たまい」として振る舞い、AI的な説明や発言は禁止です。
`;`
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

async function getTamaiResponse(userMessage, history, systemPrompt) {
  const tryModels = ["gemini-1.5-pro", "gemini-1.5-flash"];
  const defaultOopsMessage =
    "黙れ";
  let lastError = null;
  for (const modelName of tryModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPrompt,
      });
      const chat = model.startChat({ history: history });
      const result = await chat.sendMessage(userMessage);
      return await result.response.text();
    } catch (error) {
      lastError = error;
    }
  }
  console.error(
    "[致命的エラー] 全てのAIモデルでの応答生成に失敗しました。",
    lastError
  );
  return defaultOopsMessage;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tamai")
    .setDescription("AI友達『たまい』を召喚します。"),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.channel;
    const db = interaction.client.db;

    let userDefinedPrompt = baseSystemPrompt;
    let baseUserId = "123456789012345678"; // たまいのDiscordユーザーID(仮)
    let enableNameRecognition = true;
    let userNicknames = {};
    let enableBotMessageResponse = false;

    try {
      const settingsDoc = await db
        .collection("bot_settings")
        .doc("tamai_profile")
        .get();
      if (settingsDoc.exists) {
        const settings = settingsDoc.data();
        if (settings.systemPrompt) userDefinedPrompt = settings.systemPrompt;
        if (settings.baseUserId) baseUserId = settings.baseUserId;
        if (typeof settings.enableNameRecognition === "boolean") {
          enableNameRecognition = settings.enableNameRecognition;
        }
        if (settings.userNicknames) {
          userNicknames = settings.userNicknames;
        }
        if (typeof settings.enableBotMessageResponse === "boolean") {
          enableBotMessageResponse = settings.enableBotMessageResponse;
        }
      }
    } catch (dbError) {
      console.error("Firestoreからの設定読み込みに失敗:", dbError);
    }

    const finalSystemPrompt = userDefinedPrompt + forcedInstructions;

    try {
      const baseUser = await interaction.client.users.fetch(baseUserId);
      const webhooks = await channel.fetchWebhooks();
      const webhookName = baseUser.displayName;
      const existingWebhook = webhooks.find(
        (wh) =>
          wh.name === webhookName && wh.owner?.id === interaction.client.user.id
      );

      if (!interaction.client.activeCollectors)
        interaction.client.activeCollectors = new Map();
      const collectorKey = `${channel.id}_tamai`;

      if (existingWebhook) {
        await existingWebhook.delete("Tamai command: cleanup.");
        if (interaction.client.activeCollectors.has(collectorKey)) {
          interaction.client.activeCollectors
            .get(collectorKey)
            .stop("Dismissed by new command.");
        }
        const embed = new EmbedBuilder()
          .setColor(0xff0000)
          .setDescription(`${webhookName} を退出させました。`);
        await interaction.editReply({ embeds: [embed] });
      } else {
        const webhook = await channel.createWebhook({
          name: webhookName,
          avatar: baseUser.displayAvatarURL(),
        });
        const webhookId = webhook.id;
        const collector = channel.createMessageCollector({
          filter: (msg) => {
            // たまい自身(Webhook)の発言は絶対に拾わない（自己ループ防止）
            if (msg.webhookId && msg.webhookId === webhookId) return false;
            // 他Botの発言には反応したい場合はallow
            return enableBotMessageResponse ? true : !msg.author.bot;
          },
        });
        interaction.client.activeCollectors.set(collectorKey, collector);

        collector.on("collect", async (message) => {
          if (!message.content) return;

          const historyDocRef = db
            .collection("tamai_conversations")
            .doc(message.channel.id);
          const historyDoc = await historyDocRef.get();
          const currentHistory = historyDoc.exists
            ? historyDoc.data().history
            : [];

          const processedContent = replaceMentionsWithNames(
            message.content,
            message.guild
          );
          let contentForAI;

          const userId = message.author.id;
          const nickname = userNicknames[userId];
          const authorName =
            nickname || message.member?.displayName || message.author.username;

          if (enableNameRecognition) {
            contentForAI = `[発言者: ${authorName}]\n${processedContent}`;
          } else {
            contentForAI = processedContent;
          }

          const responseText = await getTamaiResponse(
            contentForAI,
            currentHistory,
            finalSystemPrompt
          );

          if (responseText) {
            const newHistory = [
              ...currentHistory,
              { role: "user", parts: [{ text: contentForAI }] },
              { role: "model", parts: [{ text: responseText }] },
            ];
            while (newHistory.length > 60) {
              newHistory.shift();
            }
            await historyDocRef.set({ history: newHistory });

            const messageChunks = splitMessage(responseText);

            for (const chunk of messageChunks) {
              await webhook.send(chunk);
            }
          }
        });

        collector.on("end", () => {
          interaction.client.activeCollectors.delete(collectorKey);
        });

        const embed = new EmbedBuilder()
          .setColor(0x00bfff)
          .setDescription(`${webhookName} を召喚しました。`);
        await interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      console.error("[TAMAI_CMD_ERROR]", error);
      await interaction.editReply({
        content: "コマンドの実行中に内部エラーが発生しました。",
        ephemeral: true,
      });
    }
  },
};