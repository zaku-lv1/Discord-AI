const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");

// とーか専用の後方互換コマンド
module.exports = {
  data: new SlashCommandBuilder()
    .setName("toka")
    .setDescription("とーかを召喚します（旧コマンド・互換性のため残しています）"),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const db = interaction.client.db;

    try {
      // AI一覧を取得してとーかを探す
      const aiProfilesDoc = await db.collection("bot_settings").doc("ai_profiles").get();
      
      if (!aiProfilesDoc.exists || !aiProfilesDoc.data().profiles || aiProfilesDoc.data().profiles.length === 0) {
        return await interaction.editReply({
          content: "[ERROR] 利用可能なAIがありません。管理者にAIの作成を依頼してください。\n\n**ヒント:** 新しいAI管理システムでは `/ai` コマンドを使用してください。",
          ephemeral: true,
        });
      }

      const aiProfiles = aiProfilesDoc.data().profiles;
      // とーかという名前のAIを探す
      let tokaAI = aiProfiles.find(ai => ai.name.includes('とーか') || ai.id.includes('toka'));
      
      if (!tokaAI) {
        // とーかが見つからない場合は最初のAIを使用
        tokaAI = aiProfiles[0];
      }

      // aiコマンドに転送
      const aiCommand = interaction.client.commands.get('ai');
      if (aiCommand) {
        // ai_idオプションを設定
        interaction.options = {
          getString: (name) => {
            if (name === 'ai_id') return tokaAI.id;
            return null;
          }
        };
        
        return await aiCommand.execute(interaction);
      } else {
        return await interaction.editReply({
          content: "[ERROR] AIコマンドが見つかりません。",
          ephemeral: true,
        });
      }
    } catch (error) {
      console.error("[TOKA_COMPAT_ERROR]", error);
      await interaction.editReply({
        content: "[ERROR] コマンドの実行中にエラーが発生しました。新しい `/ai` コマンドをお試しください。",
        ephemeral: true,
      });
    }
  },
};