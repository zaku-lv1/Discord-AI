const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const aiConfigStore = require("../services/ai-config-store");
const conversationHistoryStore = require("../services/conversation-history-store");

// Create a new GoogleGenerativeAI instance for each request to avoid conflicts
function createGeminiInstance() {
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

function replaceMentionsWithNames(message, guild, nickname = "") {
  if (!message || typeof message.replace !== "function" || !guild) {
    return message;
  }
  let result = message.replace(/<@!?(\d+)>/g, (_, id) => {
    const member = guild.members.cache.get(id);
    return member ? `@${member.displayName}` : "@UnknownUser";
  });
  
  // Replace bot mentions with nickname if available
  if (nickname && guild.members.me) {
    const botMention = `@${guild.members.me.displayName}`;
    const botMentionRegex = new RegExp(escapeRegExp(botMention), 'gi');
    result = result.replace(botMentionRegex, nickname);
  }
  
  return result;
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

// Import character presets
const characterPresets = require("../data/character-presets");

const defaultSystemPrompt = characterPresets.default.prompt;

const forcedInstructions = `

## 重要な指示:
- 文字数制限: **最大1800文字以内** で返答してください。
- 実在する人物の詳細な個人情報は出力しません。
- 有害・不適切なコンテンツは避けます。
- 自然で親しみやすい口調で話してください。
`;

async function getAIResponse(userMessage, conversationHistory, systemPrompt, errorMessage, modelMode = 'hybrid') {
  // Create a new Gemini instance for each request to avoid conflicts
  const genAI = createGeminiInstance();
  
  // Helper function to try API call with fallback
  async function tryWithModel(modelName) {
    const model = genAI.getGenerativeModel({ model: modelName });
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
    return response.text();
  }
  
  try {
    let responseText;
    
    if (modelMode === 'flash_only') {
      // Flash onlyモード
      responseText = await tryWithModel("gemini-2.5-flash");
      console.log(`[AI] Response from gemini-2.5-flash`);
    } else {
      // ハイブリッドモード: proを試してからflashにフォールバック
      try {
        responseText = await tryWithModel("gemini-2.5-pro");
        console.log(`[AI] Response from gemini-2.5-pro`);
      } catch (proError) {
        console.warn(`[AI] gemini-2.5-pro failed (${proError.message}), falling back to gemini-2.5-flash`);
        responseText = await tryWithModel("gemini-2.5-flash");
        console.log(`[AI] Response from gemini-2.5-flash (fallback)`);
      }
    }

    if (!responseText || responseText.trim() === "") {
      console.warn(`[AI] Empty response received`);
      return errorMessage || "すみません、うまく返事できませんでした...";
    }

    return responseText.trim();
  } catch (error) {
    console.error(`[AI] Error in getAIResponse:`, error.message);
    
    // より具体的なエラーハンドリング
    if (error.message.includes('quota') || error.message.includes('QUOTA_EXCEEDED')) {
      console.error("[AI] Quota exceeded - consider upgrading API plan");
      return errorMessage || "API使用量の上限に達しました。しばらく時間をおいてから再度お試しください。";
    } else if (error.message.includes('rate') || error.message.includes('RATE_LIMIT')) {
      console.error("[AI] Rate limit hit");
      return errorMessage || "リクエストが集中しています。少し時間をおいてから再度お試しください。";
    } else if (error.message.includes('API key') || error.message.includes('authentication')) {
      console.error("[AI] Authentication error");
      return errorMessage || "API認証エラーが発生しました。管理者にお問い合わせください。";
    }
    
    return errorMessage || "ちょっと調子が悪いみたい...ごめんね！";
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ai")
    .setDescription("AIを召喚します"),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.channel;

    try {
      // Load AI config from file
      const config = await aiConfigStore.getConfig();
      
      const aiSettings = {
        botName: config.botName || "AI Assistant",
        botIconUrl: config.botIconUrl || null,
        systemPrompt: config.systemPrompt || defaultSystemPrompt,
        replyDelayMs: config.replyDelayMs || 0,
        errorOopsMessage: config.errorOopsMessage || "",
        modelMode: config.modelMode || "hybrid",
        nickname: config.nickname || ""
      };

      // Add nickname to system prompt if configured
      let finalSystemPrompt = aiSettings.systemPrompt;
      if (aiSettings.nickname) {
        finalSystemPrompt = `あなたのニックネームは「${aiSettings.nickname}」です。会話の中で自然にこのニックネームを使ってください。\n\n` + finalSystemPrompt;
      }
      finalSystemPrompt += forcedInstructions;

      // Use configured webhook name and avatar
      const webhookName = aiSettings.botName;
      const webhookAvatarUrl = aiSettings.botIconUrl;

      try {
        const webhooks = await channel.fetchWebhooks();
        const existingWebhook = webhooks.find(
          (wh) =>
            wh.name === webhookName && wh.owner?.id === interaction.client.user.id
        );

        if (!interaction.client.activeCollectors)
          interaction.client.activeCollectors = new Map();
        const collectorKey = `${channel.id}_ai`;

        // 既に召喚されているAIの場合は退出させる
        if (existingWebhook) {
          await existingWebhook.delete("AI command: dismissing existing AI.");
          if (interaction.client.activeCollectors.has(collectorKey)) {
            interaction.client.activeCollectors
              .get(collectorKey)
              .stop("AI dismissed by user command.");
            interaction.client.activeCollectors.delete(collectorKey);
          }

          const embed = new EmbedBuilder()
            .setColor(0xff6600)
            .setDescription(`[AI] **${aiSettings.botName}** を退出させました。`);
          
          return await interaction.editReply({ embeds: [embed] });
        }

        // 新しいAIを召喚
        const webhookOptions = { name: webhookName };
        if (webhookAvatarUrl) {
          webhookOptions.avatar = webhookAvatarUrl;
        }
        
        const webhook = await channel.createWebhook(webhookOptions);

        const filter = (message) => {
          // Only respond to non-bot messages
          return !message.author.bot;
        };

        const collector = channel.createMessageCollector({
          filter,
          time: 3600000, // 1時間
        });

        interaction.client.activeCollectors.set(collectorKey, collector);

        // Load conversation history from Firestore (persistent across bot restarts)
        let conversationHistory = await conversationHistoryStore.getHistory(channel.id);

        collector.on("collect", async (message) => {
          if (!message.content) return;

          const processedContent = replaceMentionsWithNames(
            message.content,
            message.guild,
            aiSettings.nickname
          );

          const authorName = message.member?.displayName || message.author.username;
          const contentForAI = `[発言者: ${authorName}]\n${processedContent}`;

          const responseText = await getAIResponse(
            contentForAI,
            conversationHistory,
            finalSystemPrompt,
            aiSettings.errorOopsMessage,
            aiSettings.modelMode
          );

          if (responseText) {
            // Add to conversation history and save to Firestore
            const userMessage = { role: "user", parts: [{ text: contentForAI }] };
            const modelMessage = { role: "model", parts: [{ text: responseText }] };
            
            await conversationHistoryStore.addMessage(channel.id, userMessage, modelMessage);
            
            // Update local history for this session
            conversationHistory = await conversationHistoryStore.getHistory(channel.id);

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
          .setDescription(`[AI] **${aiSettings.botName}** を召喚しました。`)
          .addFields(
            { name: "モデル", value: aiSettings.modelMode === "hybrid" ? "ハイブリッド" : "Flash", inline: true },
            { name: "返信遅延", value: `${aiSettings.replyDelayMs}ms`, inline: true }
          );
        await interaction.editReply({ embeds: [embed] });
      } catch (userFetchError) {
        console.error("Webhook作成エラー:", userFetchError);
        await interaction.editReply({
          content: "[ERROR] AIの召喚中にエラーが発生しました。",
          ephemeral: true,
        });
      }
    } catch (error) {
      console.error("[AI_CMD_ERROR]", error);
      await interaction.editReply({
        content: "[ERROR] コマンドの実行中にエラーが発生しました。",
        ephemeral: true,
      });
    }
  },

  // Export functions for testing
  replaceMentionsWithNames,
  escapeRegExp
};