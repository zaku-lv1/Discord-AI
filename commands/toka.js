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

const baseSystemPrompt = `
あなたは今から「とーか」という名前の18歳の女の子として、その人格を維持してDiscord風チャットをします。
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
「ちーくん、まだかなぁ…」  
「それはちょっと…(；；)」  
**【NG例】**  
「ちーくん、まだかなぁ… (寂しそうに携帯を眺めながら)」  
「(目をそらしながら) …それは… (小声で) …もう少し… (赤面)」  
「*頷く* うん、そうだよ。」
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
- 自分を「とーか」として振る舞い、AI的な説明や発言は禁止です。
`;

async function getTokaResponse(userMessage, history, systemPrompt) {
  let replyDelayMs = 0;
  const tryModels = ["gemini-1.5-pro", "gemini-1.5-flash"];
  const defaultOopsMessage =
    "うーん、なんだか今日は言葉がうまく出てこないみたいで……ごめんね、ちーくん。(；；)";
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
    .setName("toka")
    .setDescription("AI彼女(誰のかは知らないけど)を召喚します。"),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.channel;
    const db = interaction.client.db;

    let userDefinedPrompt = baseSystemPrompt;
    let baseUserId = "1155356934292127844";
    let enableNameRecognition = true;
    let userNicknames = {};
    let enableBotMessageResponse = false;
    let replyDelayMs = 0; // ← 追加: collectorと同じスコープで宣言

    try {
      const settingsDoc = await db
        .collection("bot_settings")
        .doc("toka_profile")
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
        if (typeof settings.replyDelayMs === "number") {   // ← 追加
          replyDelayMs = settings.replyDelayMs;
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
      const collectorKey = `${channel.id}_toka`;

      if (existingWebhook) {
        await existingWebhook.delete("Toka command: cleanup.");
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
            // とーか（自分自身のWebhook）による発言は絶対に拾わない
            if (msg.webhookId && msg.webhookId === webhookId) return false;
            return enableBotMessageResponse ? true : !msg.author.bot;
          },
        });
        interaction.client.activeCollectors.set(collectorKey, collector);

        collector.on("collect", async (message) => {
          if (!message.content) return;

          const historyDocRef = db
            .collection("toka_conversations")
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

          const responseText = await getTokaResponse(
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
              if (replyDelayMs > 0) {
                await new Promise((resolve) =>
                  setTimeout(resolve, replyDelayMs)
                );
              }
              await webhook.send(chunk);
            }
          }
        });

        collector.on("end", () => {
          interaction.client.activeCollectors.delete(collectorKey);
        });

        const embed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setDescription(`${webhookName} を召喚しました。`);
        await interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      console.error("[TOKA_CMD_ERROR]", error);
      await interaction.editReply({
        content: "コマンドの実行中に内部エラーが発生しました。",
        ephemeral: true,
      });
    }
  },
};