const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const aiConfigStore = require("../services/ai-config-store");
const conversationHistory = require("../services/conversation-history");

// Create a new GoogleGenerativeAI instance for each request to avoid conflicts
function createGeminiInstance() {
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

function replaceMentionsWithNames(message, guild) {
  if (!message || typeof message.replace !== "function" || !guild) {
    return message;
  }
  return message.replace(/<@!?(\d+)>/g, (_, id) => {
    const member = guild.members.cache.get(id);
    return member ? `@${member.displayName}` : "@UnknownUser";
  });
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replace nicknames with Discord mentions in a message
 * @param {string} message - The message to process
 * @param {object} userNicknames - Object mapping Discord IDs to nicknames
 * @param {object} guild - Discord guild object for validation
 * @returns {string} Message with nicknames replaced by mentions
 */
function replaceNicknamesWithMentions(message, userNicknames, guild) {
  if (!message || !userNicknames || Object.keys(userNicknames).length === 0) {
    return message;
  }

  // Create reverse mapping: nickname -> Discord ID
  const nameToIdMap = {};
  for (const [discordId, nickname] of Object.entries(userNicknames)) {
    if (nickname && typeof nickname === 'string') {
      nameToIdMap[nickname] = discordId;
    }
  }

  // Sort nicknames by length (longest first) to avoid partial matches
  const sortedNicknames = Object.keys(nameToIdMap).sort((a, b) => b.length - a.length);

  let processedMessage = message;
  
  for (const nickname of sortedNicknames) {
    const discordId = nameToIdMap[nickname];
    if (!discordId) continue;

    // Validate that the user exists in the guild if guild is provided
    if (guild) {
      const member = guild.members.cache.get(discordId);
      if (!member) continue;
    }

    // Create patterns for matching the nickname
    const patterns = [
      new RegExp(`\\b${escapeRegExp(nickname)}\\b`, 'gi'), // Complete word match (alphanumeric)
      new RegExp(`(?<![a-zA-Z0-9_-])${escapeRegExp(nickname)}(?![a-zA-Z0-9_-])`, 'gi'), // Boundary excluding alphanumeric/underscore/hyphen
      new RegExp(`(?<=[\\s、。！？,!?]|^)${escapeRegExp(nickname)}(?=[\\s、。！？,!?]|$)`, 'gi'), // Punctuation/space/start/end boundaries
    ];

    // Try each pattern and replace if matched
    for (const pattern of patterns) {
      const matches = processedMessage.match(pattern);
      if (matches) {
        processedMessage = processedMessage.replace(pattern, () => `<@${discordId}>`);
        break; // Stop after first successful match for this nickname
      }
    }
  }

  return processedMessage;
}

/**
 * Replace mentions with nicknames for AI understanding
 * @param {string} message - The message to process
 * @param {object} userNicknames - Object mapping Discord IDs to nicknames
 * @param {object} guild - Discord guild object
 * @returns {string} Message with mentions replaced by nicknames
 */
function replaceMentionsWithNicknames(message, userNicknames, guild) {
  if (!message || !userNicknames || Object.keys(userNicknames).length === 0) {
    // Fallback to default behavior using display names
    return replaceMentionsWithNames(message, guild);
  }

  return message.replace(/<@!?(\d+)>/g, (match, id) => {
    // Check if we have a nickname for this user
    if (userNicknames[id]) {
      return `@${userNicknames[id]}`;
    }
    
    // Fallback to display name
    const member = guild?.members.cache.get(id);
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
        modelMode: config.modelMode || "hybrid"
      };

      const finalSystemPrompt = aiSettings.systemPrompt + forcedInstructions;

      // Initialize active collectors map if it doesn't exist
      if (!interaction.client.activeCollectors)
        interaction.client.activeCollectors = new Map();
      const collectorKey = `${channel.id}_ai`;

      // Check if AI is already active in this channel
      if (interaction.client.activeCollectors.has(collectorKey)) {
        // Dismiss the existing AI
        interaction.client.activeCollectors
          .get(collectorKey)
          .stop("AI dismissed by user command.");
        interaction.client.activeCollectors.delete(collectorKey);

        const embed = new EmbedBuilder()
          .setColor(0xff6600)
          .setDescription(`[AI] **${aiSettings.botName}** を退出させました。`);
        
        return await interaction.editReply({ embeds: [embed] });
      }

      // Summon new AI - using bot's own account
      const filter = (message) => {
        // Only respond to non-bot messages
        return !message.author.bot;
      };

      const collector = channel.createMessageCollector({
        filter,
        time: 3600000, // 1時間
      });

      interaction.client.activeCollectors.set(collectorKey, collector);

      // Load conversation history from Firebase (persistent across bot restarts)
      const channelId = channel.id;
      const botName = aiSettings.botName;
      let persistentHistory = await conversationHistory.getHistory(channelId, botName);

      // Get user nicknames from config
      const userNicknames = config.userNicknames || {};

      collector.on("collect", async (message) => {
        if (!message.content) return;

        // Show typing indicator (non-blocking)
        try {
          await channel.sendTyping();
        } catch (error) {
          console.error('[ERROR] Failed to send typing indicator:', error.message);
          // Continue processing message even if typing indicator fails
        }

        // Three-step nickname processing:
        // 1. Replace nicknames with mentions: Converts "A-kun" -> "<@123456...>"
        //    This ensures Discord IDs are properly captured for processing
        // 2. Replace mentions with nicknames: Converts "<@123456...>" -> "@A-kun"
        //    This provides natural names to the AI for better understanding
        // 3. Check sender's nickname: Use userNicknames[sender_id] for the sender's name
        //    This ensures the AI recognizes the sender by their assigned nickname
        // 
        // Why three steps? Users might reference people using nicknames in text,
        // but the bot needs to validate these against actual Discord IDs first,
        // then present them to AI in a natural format. Additionally, the sender's
        // own nickname should be recognized from the mapping for consistency.
        let processedContent = replaceNicknamesWithMentions(
          message.content,
          userNicknames,
          message.guild
        );

        // Then replace mentions with nicknames for AI understanding
        processedContent = replaceMentionsWithNicknames(
          processedContent,
          userNicknames,
          message.guild
        );

        // Check if sender has a nickname assignment
        // Priority: userNicknames mapping > displayName > username
        const authorId = message.author.id;
        const authorName = userNicknames[authorId] || 
                          message.member?.displayName || 
                          message.author.username;
        const contentForAI = `[発言者: ${authorName}]\n${processedContent}`;

        const responseText = await getAIResponse(
          contentForAI,
          persistentHistory,
          finalSystemPrompt,
          aiSettings.errorOopsMessage,
          aiSettings.modelMode
        );

        if (responseText) {
          // Update conversation history and save to Firebase
          persistentHistory = await conversationHistory.addMessage(
            channelId,
            botName,
            contentForAI,
            responseText
          );

          const messageChunks = splitMessage(responseText);

          for (const chunk of messageChunks) {
            if (aiSettings.replyDelayMs > 0) {
              await new Promise((resolve) =>
                setTimeout(resolve, aiSettings.replyDelayMs)
              );
            }
            // Send message using bot's own account
            await channel.send(chunk);
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
  replaceMentionsWithNicknames,
  replaceNicknamesWithMentions,
  escapeRegExp
};