const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function testAIConnection() {
  const results = {
    apiKeyValid: false,
    geminiProAvailable: false,
    geminiFlashAvailable: false,
    errors: []
  };

  // Test API key validity
  try {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'test_gemini_key') {
      results.errors.push("❌ GEMINI_API_KEY が設定されていないか、テスト用の値です");
      return results;
    }
    results.apiKeyValid = true;
  } catch (error) {
    results.errors.push(`❌ API キー設定エラー: ${error.message}`);
    return results;
  }

  // Test Gemini 1.5 Pro
  try {
    const proModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    const proResult = await proModel.generateContent("Hello, respond with just 'Pro model working'");
    const proResponse = await proResult.response;
    if (proResponse.text()) {
      results.geminiProAvailable = true;
    }
  } catch (error) {
    results.errors.push(`⚠️ Gemini 1.5 Pro エラー: ${error.message}`);
  }

  // Test Gemini 1.5 Flash
  try {
    const flashModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const flashResult = await flashModel.generateContent("Hello, respond with just 'Flash model working'");
    const flashResponse = await flashResult.response;
    if (flashResponse.text()) {
      results.geminiFlashAvailable = true;
    }
  } catch (error) {
    results.errors.push(`⚠️ Gemini 1.5 Flash エラー: ${error.message}`);
  }

  return results;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ai-test")
    .setDescription("AI接続をテストし、診断情報を表示します（管理者用）"),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      console.log(`[AI_TEST] ${interaction.user.username} によるAI診断テスト開始`);
      
      const testResults = await testAIConnection();
      
      const embed = new EmbedBuilder()
        .setTitle("🔍 AI システム診断")
        .setColor(testResults.geminiProAvailable || testResults.geminiFlashAvailable ? 0x00ff00 : 0xff0000)
        .setTimestamp();

      // API Key Status
      embed.addFields({
        name: "🔑 API キー",
        value: testResults.apiKeyValid ? "✅ 設定済み" : "❌ 未設定/無効",
        inline: true
      });

      // Model availability
      embed.addFields({
        name: "🤖 Gemini 1.5 Pro",
        value: testResults.geminiProAvailable ? "✅ 利用可能" : "❌ 利用不可",
        inline: true
      });

      embed.addFields({
        name: "⚡ Gemini 1.5 Flash",
        value: testResults.geminiFlashAvailable ? "✅ 利用可能" : "❌ 利用不可",
        inline: true
      });

      // Recommendations
      let recommendation = "";
      if (!testResults.apiKeyValid) {
        recommendation = "🔧 **GEMINI_API_KEY** を正しく設定してください。";
      } else if (!testResults.geminiProAvailable && !testResults.geminiFlashAvailable) {
        recommendation = "🚨 AIモデルが利用できません。APIキーの権限やクォータを確認してください。";
      } else if (!testResults.geminiProAvailable) {
        recommendation = "⚠️ Proモデルが利用できませんが、Flashモデルは利用可能です。";
      } else {
        recommendation = "✅ AI システムは正常に動作しています。";
      }

      embed.addFields({
        name: "💡 推奨アクション",
        value: recommendation,
        inline: false
      });

      // Error details
      if (testResults.errors.length > 0) {
        embed.addFields({
          name: "📋 詳細エラー",
          value: testResults.errors.join("\n"),
          inline: false
        });
      }

      // Configuration tips
      embed.addFields({
        name: "🛠️ トラブルシューティング",
        value: [
          "• [Google AI Studio](https://ai.google.dev/) でAPIキーを確認",
          "• API クォータと請求設定を確認",
          "• ネットワーク接続を確認",
          "• サーバーログでより詳細なエラーを確認"
        ].join("\n"),
        inline: false
      });

      await interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      console.error("[AI_TEST_ERROR]", error);
      await interaction.editReply({
        content: `❌ AI診断テストでエラーが発生しました: ${error.message}`,
        ephemeral: true,
      });
    }
  }
};