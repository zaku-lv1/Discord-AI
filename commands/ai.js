const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");

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

function replaceNamesWithMentions(message, nameToIdMappings, guild) {
  if (!message || typeof message.replace !== "function" || !nameToIdMappings || !guild) {
    return message;
  }
  
  let processedMessage = message;
  
  // ネームマッピングを処理（長い名前から優先して処理）
  const sortedNames = Object.keys(nameToIdMappings).sort((a, b) => b.length - a.length);
  
  for (const name of sortedNames) {
    const discordId = nameToIdMappings[name];
    if (!discordId) continue;
    
    // 名前を様々なパターンでマッチ（完全一致を優先、より厳密に）
    const patterns = [
      new RegExp(`\\b${escapeRegExp(name)}\\b`, 'gi'), // 完全単語マッチ（英数字）
      new RegExp(`(?<![a-zA-Z0-9_-])${escapeRegExp(name)}(?![a-zA-Z0-9_-])`, 'gi'), // 英数字・アンダースコア・ハイフン以外の境界
      new RegExp(`(?<=[\\s、。！？,!?]|^)${escapeRegExp(name)}(?=[\\s、。！？,!?]|$)`, 'gi'), // 句読点・空白・文頭文末
    ];
    
    for (const pattern of patterns) {
      const currentProcessedMessage = processedMessage;
      processedMessage = processedMessage.replace(pattern, (match) => {
        try {
          // Discordメンションの形式で置換
          const member = guild.members.cache.get(discordId);
          if (member) {
            return `<@${discordId}>`;
          } else {
            // ギルドメンバーが見つからない場合は元の名前を保持
            return match;
          }
        } catch (error) {
          console.warn(`名前「${name}」のDiscord ID「${discordId}」への変換に失敗:`, error.message);
          return match;
        }
      });
      
      // マッチした場合は他のパターンを試さない（重複置換防止）
      if (currentProcessedMessage !== processedMessage) {
        break;
      }
    }
  }
  
  return processedMessage;
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
    .setDescription("AIを召喚します")
    .addStringOption((option) =>
      option
        .setName("ai_id")
        .setDescription("召喚するAIのID")
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    const db = interaction.client.db;

    try {
      // AI一覧を取得
      const aiProfilesDoc = await db.collection("bot_settings").doc("ai_profiles").get();
      
      if (!aiProfilesDoc.exists || !aiProfilesDoc.data().profiles || aiProfilesDoc.data().profiles.length === 0) {
        return await interaction.respond([]);
      }

      const aiProfiles = aiProfilesDoc.data().profiles;
      
      // フィルタリングと選択肢の生成
      const filtered = aiProfiles
        .filter(ai => ai.id.toLowerCase().includes(focusedValue.toLowerCase()) || 
                     ai.name.toLowerCase().includes(focusedValue.toLowerCase()))
        .slice(0, 25) // Discord's limit is 25 choices
        .map(ai => ({
          name: `${ai.name} (${ai.id})`,
          value: ai.id
        }));

      await interaction.respond(filtered);
    } catch (error) {
      console.error('[AI_AUTOCOMPLETE_ERROR]', error);
      await interaction.respond([]);
    }
  },

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
          content: "[ERROR] 利用可能なAIがありません。管理者にAIの作成を依頼してください。",
          ephemeral: true,
        });
      }

      const aiProfiles = aiProfilesDoc.data().profiles;
      const selectedAI = aiProfiles.find(ai => ai.id === requestedAiId);
      
      if (!selectedAI) {
        const availableAIs = aiProfiles.map(ai => `\`${ai.id}\` (${ai.name})`).join('\n');
        return await interaction.editReply({
          content: `[ERROR] AI「${requestedAiId}」が見つかりません。\n\n**利用可能なAI:**\n${availableAIs}`,
          ephemeral: true,
        });
      }

      // AI設定の取得
      const aiSettings = {
        systemPrompt: selectedAI.systemPrompt || defaultSystemPrompt,
        baseUserId: selectedAI.baseUserId,
        useBaseUserName: selectedAI.useBaseUserName ?? false,
        useBaseUserAvatar: selectedAI.useBaseUserAvatar ?? false,
        fallbackAvatarUrl: selectedAI.fallbackAvatarUrl || "",
        fallbackDisplayName: selectedAI.fallbackDisplayName || selectedAI.name,
        enableNameRecognition: selectedAI.enableNameRecognition ?? true,
        userNicknames: selectedAI.userNicknames || {},
        enableBotMessageResponse: selectedAI.enableBotMessageResponse ?? false,
        replyDelayMs: selectedAI.replyDelayMs || 0,
        errorOopsMessage: selectedAI.errorOopsMessage || "",
        modelMode: selectedAI.modelMode || "hybrid"
      };

      // グローバルDiscord IDマッピングを取得
      let globalDiscordMappings = {};
      try {
        // DBから直接取得する方法に変更
        const mappingsSnapshot = await db.collection("discord_id_mappings").get();
        
        mappingsSnapshot.forEach(doc => {
          const data = doc.data();
          if (data.mappings) {
            // 各ユーザーのマッピングをグローバルマッピングにマージ
            Object.assign(globalDiscordMappings, data.mappings);
          }
        });
      } catch (mappingError) {
        console.warn('グローバルDiscord IDマッピングの取得に失敗:', mappingError.message);
      }

      // AI固有のニックネームとグローバルマッピングをマージ（AI固有が優先）
      const combinedUserNicknames = { ...globalDiscordMappings, ...aiSettings.userNicknames };

      // 名前からDiscord IDへの逆マッピングを作成（プロンプト内の名前をメンションに変換するため）
      const nameToIdMappings = {};
      
      // グローバルマッピングから逆マッピングを作成
      Object.entries(globalDiscordMappings).forEach(([discordId, nickname]) => {
        if (nickname && typeof nickname === 'string') {
          nameToIdMappings[nickname] = discordId;
        }
      });
      
      // AI固有のニックネームから逆マッピングを作成（AI固有が優先）
      Object.entries(aiSettings.userNicknames).forEach(([discordId, nickname]) => {
        if (nickname && typeof nickname === 'string') {
          nameToIdMappings[nickname] = discordId;
        }
      });

      const finalSystemPrompt = aiSettings.systemPrompt + forcedInstructions;

      // Determine webhook name and avatar based on base user settings
      let webhookName = selectedAI.name;
      let webhookAvatarUrl = null;

      // Handle base user settings for name and avatar
      if (aiSettings.baseUserId && aiSettings.useBaseUserName) {
        try {
          const baseUser = await interaction.client.users.fetch(aiSettings.baseUserId);
          if (aiSettings.useBaseUserName) {
            webhookName = baseUser.displayName || baseUser.username;
          }
        } catch (error) {
          console.warn(`Base user ${aiSettings.baseUserId} not found, using fallback name: ${aiSettings.fallbackDisplayName}`);
          webhookName = aiSettings.fallbackDisplayName || selectedAI.name;
        }
      } else {
        webhookName = aiSettings.fallbackDisplayName || selectedAI.name;
      }

      // Handle avatar URL
      if (aiSettings.baseUserId && aiSettings.useBaseUserAvatar) {
        try {
          const baseUser = await interaction.client.users.fetch(aiSettings.baseUserId);
          webhookAvatarUrl = baseUser.displayAvatarURL();
        } catch (error) {
          console.warn(`Base user ${aiSettings.baseUserId} not found, using fallback avatar URL: ${aiSettings.fallbackAvatarUrl}`);
          webhookAvatarUrl = aiSettings.fallbackAvatarUrl || null;
        }
      } else {
        webhookAvatarUrl = aiSettings.fallbackAvatarUrl || null;
      }

      try {
        const webhooks = await channel.fetchWebhooks();
        const existingWebhook = webhooks.find(
          (wh) =>
            wh.name === webhookName && wh.owner?.id === interaction.client.user.id
        );

        if (!interaction.client.activeCollectors)
          interaction.client.activeCollectors = new Map();
        const collectorKey = `${channel.id}_${selectedAI.id}`;

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
            .setDescription(`[AI] **${selectedAI.name}** (ID: \`${selectedAI.id}\`) を退出させました。`);
          
          return await interaction.editReply({ embeds: [embed] });
        }

        // 新しいAIを召喚
        const webhookOptions = { name: webhookName };
        if (webhookAvatarUrl) {
          webhookOptions.avatar = webhookAvatarUrl;
        }
        
        const webhook = await channel.createWebhook(webhookOptions);

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

          // まず名前をメンションに変換してからメンションを名前に変換
          const contentWithMentions = replaceNamesWithMentions(
            message.content,
            nameToIdMappings,
            message.guild
          );
          
          const processedContent = replaceMentionsWithNames(
            contentWithMentions,
            message.guild
          );
          let contentForAI;

          const userId = message.author.id;
          const nickname = combinedUserNicknames[userId];
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

            // AI の応答では名前をメンションに変換しない（不要な通知を避けるため）
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
          .setDescription(`[AI] **${selectedAI.name}** (ID: \`${selectedAI.id}\`) を召喚しました。`)
          .addFields(
            { name: "モデル", value: aiSettings.modelMode === "hybrid" ? "ハイブリッド" : "Flash", inline: true },
            { name: "返信遅延", value: `${aiSettings.replyDelayMs}ms`, inline: true },
            { name: "名前認識", value: aiSettings.enableNameRecognition ? "有効" : "無効", inline: true }
          );
        await interaction.editReply({ embeds: [embed] });
      } catch (userFetchError) {
        console.error("ベースユーザーの取得に失敗:", userFetchError);
        await interaction.editReply({
          content: "[ERROR] AIの設定に問題があります。管理者に連絡してください。",
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
  replaceNamesWithMentions,
  replaceMentionsWithNames,
  escapeRegExp
};