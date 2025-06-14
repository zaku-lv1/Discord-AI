const { SlashCommandBuilder } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// とーかコマンドと同様の補助関数
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

async function getAIResponse(
  userMessage,
  history,
  character,
  errorOopsMessage
) {
  const tryModels = ["gemini-1.5-pro", "gemini-1.5-flash"];
  const defaultOopsMessage =
    errorOopsMessage ||
    "うーん、なんだか今日は言葉がうまく出てこないみたいで……ごめんね。(；；)";
  let lastError = null;

  for (const modelName of tryModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: character.systemPrompt,
      });
      const chat = model.startChat({ history: history });
      const result = await chat.sendMessage(userMessage);
      return await result.response.text();
    } catch (error) {
      lastError = error;
      continue;
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
    .setName("ai")
    .setDescription("AIキャラクターを召喚します。")
    .addStringOption((option) =>
      option
        .setName("character")
        .setDescription("AIキャラクターのコマンドID")
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.channel;
    const db = interaction.client.db;
    const characterId = interaction.options.getString("character");

    try {
      // AIキャラクターの取得
      const charactersSnapshot = await db
        .collection("ai_characters")
        .where("commandId", "==", characterId)
        .where("active", "==", true)
        .get();

      if (charactersSnapshot.empty) {
        await interaction.editReply({
          content:
            "指定されたAIキャラクターが見つからないか、無効になっています。",
          ephemeral: true,
        });
        return;
      }

      const character = {
        id: charactersSnapshot.docs[0].id,
        ...charactersSnapshot.docs[0].data(),
      };

      // Webhookの設定
      const webhooks = await channel.fetchWebhooks();
      const webhookName = character.name;
      const existingWebhook = webhooks.find(
        (wh) =>
          wh.name === webhookName && wh.owner?.id === interaction.client.user.id
      );

      if (!interaction.client.activeCollectors)
        interaction.client.activeCollectors = new Map();
      const collectorKey = `${channel.id}_${character.id}`;

      if (existingWebhook) {
        await existingWebhook.delete("AI command: cleanup.");
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
        const baseUser = await interaction.client.users.fetch(
          character.baseUserId
        );
        const webhook = await channel.createWebhook({
          name: webhookName,
          avatar: baseUser.displayAvatarURL(),
        });

        const webhookId = webhook.id;
        const collector = channel.createMessageCollector({
          filter: (msg) => {
            if (msg.webhookId && msg.webhookId === webhookId) return false;
            return character.enableBotMessageResponse ? true : !msg.author.bot;
          },
        });
        interaction.client.activeCollectors.set(collectorKey, collector);

        collector.on("collect", async (message) => {
          if (!message.content) return;

          const historyDocRef = db
            .collection("ai_conversations")
            .doc(`${channel.id}_${character.id}`);
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
          const nickname = character.userNicknames[userId];
          const authorName =
            nickname || message.member?.displayName || message.author.username;

          if (character.enableNameRecognition) {
            contentForAI = `[発言者: ${authorName}]\n${processedContent}`;
          } else {
            contentForAI = processedContent;
          }

          const responseText = await getAIResponse(
            contentForAI,
            currentHistory,
            character,
            character.errorOopsMessage
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
              if (character.replyDelayMs > 0) {
                await new Promise((resolve) =>
                  setTimeout(resolve, character.replyDelayMs)
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
      console.error("[AI_CMD_ERROR]", error);
      await interaction.editReply({
        content: "コマンドの実行中に内部エラーが発生しました。",
        ephemeral: true,
      });
    }
  },
};
