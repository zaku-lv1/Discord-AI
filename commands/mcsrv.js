const axios = require('axios');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js'); // EmbedBuilder をインポート

module.exports = {
  // SlashCommandBuilder を使用してコマンド情報を定義
  data: new SlashCommandBuilder()
    .setName('mcsrv')
    .setDescription('Minecraftサーバーのステータスを確認します。')
    .addStringOption(option =>
      option.setName('edition')
        .setDescription('Minecraft Editionを選択してください。')
        .setRequired(true)
        .addChoices(
          { name: 'Java Edition', value: 'java' },
          { name: 'Bedrock Edition', value: 'bedrock' }
        ))
    .addStringOption(option =>
      option.setName('address')
        .setDescription('サーバーアドレス (例: play.hypixel.net または IP:Port)')
        .setRequired(true)),
  async execute(interaction) {
    const edition = interaction.options.getString('edition');
    const address = interaction.options.getString('address');

    await interaction.deferReply(); // API呼び出し前に応答を遅延

    try {
      let apiUrl;
      // API URLの構築 (変更なし)
      if (edition === 'java') {
        apiUrl = `https://api.mcsrvstat.us/3/${encodeURIComponent(address)}`; // v3を推奨 (より多くの情報を提供)
      } else if (edition === 'bedrock') {
        apiUrl = `https://api.mcsrvstat.us/bedrock/3/${encodeURIComponent(address)}`; // v3を推奨
      } else {
        // addChoices を使っているので、通常この分岐には入らない
        await interaction.editReply({ content: '無効なMinecraft Editionが選択されました。', ephemeral: true });
        return;
      }

      const response = await axios.get(apiUrl);
      const data = response.data;

      if (data.online) {
        const embed = new EmbedBuilder()
          .setTitle(`Minecraftサーバー: ${data.hostname || address}`)
          .setColor(data.debug?.srv ? 0x00FF00 : 0x0099FF) // SRVレコードがあれば緑、なければ青
          .setTimestamp();

        if (data.icon) {
            // data.icon は 'data:image/png;base64,xxxx' 形式なので、ファイルとして添付する必要がある
            // もしURL形式なら setImage や setThumbnail に直接渡せる
            // ここでは単純化のため、アイコン処理は省略。必要ならファイル添付で対応。
            // 例: const imageStream = Buffer.from(data.icon.split(',')[1], 'base64');
            //     const attachment = new MessageAttachment(imageStream, 'icon.png');
            //     embed.setThumbnail('attachment://icon.png');
            //     await interaction.editReply({ embeds: [embed], files: [attachment] }); return;
        }

        embed.addFields(
          { name: 'ステータス', value: '🟢 オンライン', inline: true },
          { name: 'アドレス', value: `${data.ip}:${data.port}`, inline: true }
        );

        if (data.players) {
          embed.addFields({ name: 'プレイヤー数', value: `${data.players.online} / ${data.players.max}`, inline: true });
        }
        if (data.version) {
          embed.addFields({ name: 'バージョン', value: `\`${data.version}\``, inline: true });
        }
        if (data.protocol && data.protocol.name) {
             embed.addFields({ name: 'プロトコルバージョン', value: `\`${data.protocol.name}\` (ID: ${data.protocol.version})`, inline: true });
        }


        let cleanMotd = 'N/A';
        if (data.motd && data.motd.clean && data.motd.clean.length > 0) {
          cleanMotd = data.motd.clean.join('\n');
        }
        embed.addFields({ name: 'MOTD', value: `\`\`\`\n${cleanMotd}\n\`\`\`` });
        
        if (data.software) {
             embed.addFields({ name: 'ソフトウェア', value: `\`${data.software}\``, inline: true });
        }
        
        if(data.plugins && data.plugins.names && data.plugins.names.length > 0) {
            const pluginList = data.plugins.names.join(', ');
            embed.addFields({ name: 'プラグイン', value: pluginList.length > 1020 ? pluginList.substring(0, 1020) + '...' : pluginList });
        } else if (data.mods && data.mods.names && data.mods.names.length > 0) {
            const modList = data.mods.names.join(', ');
            embed.addFields({ name: 'MOD', value: modList.length > 1020 ? modList.substring(0, 1020) + '...' : modList });
        }


        await interaction.editReply({ embeds: [embed] });
      } else {
        const offlineEmbed = new EmbedBuilder()
          .setTitle(`Minecraftサーバー: ${address}`)
          .setColor(0xFF0000) // 赤色
          .setDescription('🔴 指定されたサーバーはオフラインか、存在しません。')
          .setTimestamp();
        await interaction.editReply({ embeds: [offlineEmbed] });
      }
    } catch (error) {
      console.error('MCSrvStat APIエラー:', error.message);
      // APIからのエラーレスポンスがあるか確認
      let errorMessage = 'サーバーのステータス取得中にエラーが発生しました。アドレスが正しいか、APIサービスがオンラインか確認してください。';
      if (error.response && error.response.data && typeof error.response.data === 'string' && error.response.data.includes('EHOSTUNREACH')) {
        errorMessage = '指定されたアドレスに到達できませんでした。ホスト名またはIPアドレスを確認してください。';
      } else if (error.message.includes('timeout')) {
        errorMessage = 'サーバーからの応答がタイムアウトしました。サーバーが重いか、一時的にアクセスできない状態かもしれません。';
      }
      
      await interaction.editReply({
        content: errorMessage,
        ephemeral: true, // エラーメッセージは実行者のみに見せる
      });
    }
  },
};