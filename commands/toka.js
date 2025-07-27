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

const defaultSystemPrompt = `
あなたは親しみやすく優しいAIアシスタントです。ユーザーとフレンドリーに会話し、質問に丁寧に答えてください。
自然で人間らしい会話を心がけてください。
`;

const forcedInstructions = `

## 重要な指示:
- 文字数制限: **最大1800文字以内** で返答してください。
- 実在する人物の詳細な個人情報は出力しません。
- 有害・不適切なコンテンツは避けます。
- 自然で親しみやすい口調で話してください。
`;

async function getAIResponse(userMessage, conversationHistory, systemPrompt, errorMessage, modelMode = 'hybrid') {
  try {
    let model;
    
    if (modelMode === 'flash_only') {
      model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    } else {
      // ハイブリッドモード: まずgemini-1.5-proを試す
      try {
        model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      } catch {
        model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      }
    }

    const chat = model.startChat({
      history: conversationHistory,
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.7,
      },
    });

    const fullPrompt = systemPrompt + "\n\nユーザーからのメッセージ:\n" + userMessage;
    const result = await chat.sendMessage(fullPrompt);
    const response = await result.response;
    const responseText = response.text();

    if (!responseText || responseText.trim() === "") {
      return errorMessage || "すみません、うまく返事できませんでした...";
    }

    return responseText.trim();
  } catch (error) {
    console.error("AI生成エラー:", error);
    return errorMessage || "ちょっと調子が悪いみたい...ごめんね！";
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ai")
    .setDescription("AIを召喚します")
    .addStringOption((option) =>
      option
        .setName("ai_id")
        .setDescription("召喚するAIのID")
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.channel;
    const requestedAiId = interaction.options.getString("ai_id");
    const db = interaction.client.db;

    try {
      // AI一覧を取得
      const aiProfilesDoc = await db.collection("bot_settings").doc("ai_profiles").get();
      
      if (!aiProfilesDoc.exists || !aiProfilesDoc.data().profiles || aiProfilesDoc.data().profiles.length === 0) {
        return await interaction.editReply({
          content: "❌ 利用可能なAIがありません。管理者にAIの作成を依頼してください。",
          ephemeral: true,
        });
      }

      const aiProfiles = aiProfilesDoc.data().profiles;
      let selectedAI;

      if (requestedAiId) {
        selectedAI = aiProfiles.find(ai => ai.id === requestedAiId);
        if (!selectedAI) {
          const availableAIs = aiProfiles.map(ai => `\`${ai.id}\` (${ai.name})`).join('\n');
          return await interaction.editReply({
            content: `❌ AI「${requestedAiId}」が見つかりません。\n\n**利用可能なAI:**\n${availableAIs}`,
            ephemeral: true,
          });
        }
      } else {
        // IDが指定されていない場合は最初のAIを使用
        selectedAI = aiProfiles[0];
      }

      // AI設定の取得
      const aiSettings = {
        systemPrompt: selectedAI.systemPrompt || defaultSystemPrompt,
        baseUserId: selectedAI.baseUserId || "1155356934292127844",
        enableNameRecognition: selectedAI.enableNameRecognition ?? true,
        userNicknames: selectedAI.userNicknames || {},
        enableBotMessageResponse: selectedAI.enableBotMessageResponse ?? false,
        replyDelayMs: selectedAI.replyDelayMs || 0,
        errorOopsMessage: selectedAI.errorOopsMessage || "",
        modelMode: selectedAI.modelMode || "hybrid"
      };

      const finalSystemPrompt = aiSettings.systemPrompt + forcedInstructions;

      try {
        const baseUser = await interaction.client.users.fetch(aiSettings.baseUserId);
        const webhooks = await channel.fetchWebhooks();
        const webhookName = selectedAI.name;
        const existingWebhook = webhooks.find(
          (wh) =>
            wh.name === webhookName && wh.owner?.id === interaction.client.user.id
        );

        if (!interaction.client.activeCollectors)
          interaction.client.activeCollectors = new Map();
        const collectorKey = `${channel.id}_${selectedAI.id}`;

        if (existingWebhook) {
          await existingWebhook.delete("AI command: cleanup.");
          if (interaction.client.activeCollectors.has(collectorKey)) {
            interaction.client.activeCollectors
              .get(collectorKey)
              .stop("Dismissed by new command.");
          }
        }

        const webhook = await channel.createWebhook({
          name: webhookName,
          avatar: baseUser.displayAvatarURL(),
        });

        const filter = (message) => {
          if (!aiSettings.enableBotMessageResponse && message.author.bot) {
            return false;
          }
          return !message.author.bot || aiSettings.enableBotMessageResponse;
        };

        const collector = channel.createMessageCollector({
          filter,
          time: 3600000, // 1時間
        });

        interaction.client.activeCollectors.set(collectorKey, collector);

        collector.on("collect", async (message) => {
          if (!message.content) return;

          const historyDocRef = db
            .collection("ai_conversations")
            .doc(`${selectedAI.id}_${message.channel.id}`);
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
          const nickname = aiSettings.userNicknames[userId];
          const authorName =
            nickname || message.member?.displayName || message.author.username;

          if (aiSettings.enableNameRecognition) {
            contentForAI = `[発言者: ${authorName}]\n${processedContent}`;
          } else {
            contentForAI = processedContent;
          }

          const responseText = await getAIResponse(
            contentForAI,
            currentHistory,
            finalSystemPrompt,
            aiSettings.errorOopsMessage,
            aiSettings.modelMode
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
              if (aiSettings.replyDelayMs > 0) {
                await new Promise((resolve) =>
                  setTimeout(resolve, aiSettings.replyDelayMs)
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
          .setDescription(`🤖 **${selectedAI.name}** (ID: \`${selectedAI.id}\`) を召喚しました。`)
          .addFields(
            { name: "モデル", value: aiSettings.modelMode === "hybrid" ? "ハイブリッド" : "Flash", inline: true },
            { name: "返信遅延", value: `${aiSettings.replyDelayMs}ms`, inline: true },
            { name: "名前認識", value: aiSettings.enableNameRecognition ? "有効" : "無効", inline: true }
          );
        await interaction.editReply({ embeds: [embed] });
      } catch (userFetchError) {
        console.error("ベースユーザーの取得に失敗:", userFetchError);
        await interaction.editReply({
          content: "❌ AIの設定に問題があります。管理者に連絡してください。",
          ephemeral: true,
        });
      }
    } catch (error) {
      console.error("[AI_CMD_ERROR]", error);
      await interaction.editReply({
        content: "❌ コマンドの実行中にエラーが発生しました。",
        ephemeral: true,
      });
    }
  },
};