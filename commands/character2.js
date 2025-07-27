// WebhookClientは直接使っていない, ClientとIntentsはコマンド内では不要
const { EmbedBuilder, SlashCommandBuilder, ChannelType } = require('discord.js');
// dotenv.config() はメインファイルで一度行えばOK。このファイルでは不要な場合が多い。
// require('dotenv').config(); // メインファイルで設定済みならコメントアウト

// このMapはグローバルスコープか、clientオブジェクトに持たせるなどして永続化が必要
// client.activeKTTCollectors のような専用の名前にしても良い
// ここでは client.activeCollectors を流用する前提
// const activeKTTCollectors = new Map(); // or interaction.client.activeKTTCollectors


module.exports = {
  data: new SlashCommandBuilder()
    .setName('character2')
    .setDescription('キャラクター2を召喚したり退出させたりします。'),
  async execute(interaction) {

    if (!interaction.inGuild() || !interaction.channel || interaction.channel.type === ChannelType.DM) {
        await interaction.reply({ content: 'このコマンドはサーバーのテキストチャンネルでのみ使用できます。', ephemeral: true });
        return;
    }
    
    await interaction.deferReply({ ephemeral: true });

    const kttUserId = '1062565968959774761'; // KTTのベースにするユーザーID
    const channel = interaction.channel;

    let baseUser;
    try {
        baseUser = await interaction.client.users.fetch(kttUserId);
    } catch (error) {
        console.error(`KTTベースユーザーID (${kttUserId}) の取得に失敗:`, error);
        await interaction.editReply({ content: 'KTTのベースとなるユーザー情報の取得に失敗しました。', ephemeral: true });
        return;
    }

    const kttWebhookName = `KTTWebhook_${baseUser.username}`;
    const iharaWebhookName = `IharaSenseiWebhook_${interaction.client.user.id}`; // ボットに紐づくユニーク名

    let webhooks;
    try {
        webhooks = await channel.fetchWebhooks();
    } catch (error) {
        console.error(`Webhookの取得に失敗 (Channel: ${channel.id}):`, error);
        await interaction.editReply({ content: 'Webhook情報の取得に失敗しました。ボットに「ウェブフックの管理」権限があるか確認してください。', ephemeral: true });
        return;
    }

    const kttWebhook = webhooks.find((wh) => wh.name === kttWebhookName && wh.owner?.id === interaction.client.user.id);
    const iharaWebhook = webhooks.find((wh) => wh.name === iharaWebhookName && wh.owner?.id === interaction.client.user.id);

    // コレクター管理用のMapをクライアントに初期化 (index.jsなどで一度だけ行うのが理想)
    if (!interaction.client.activeCollectors) {
        interaction.client.activeCollectors = new Map();
    }
    const collectorKey = `${channel.id}_character2`; // このコマンド専用のコレクターキー

    if (kttWebhook && iharaWebhook) {
      try {
        await kttWebhook.delete('KTT command: cleanup KTT');
        await iharaWebhook.delete('KTT command: cleanup Ihara');
        if (interaction.client.activeCollectors.has(collectorKey)) {
            interaction.client.activeCollectors.get(collectorKey).stop('KTT dismissed by command.');
        }
        const embed = new EmbedBuilder().setColor(0xFF0000).setDescription('KTTと井原先生を退出させました。');
        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        console.error("Webhook削除エラー:", error);
        await interaction.editReply({ content: 'Webhookの退出処理中にエラーが発生しました。', ephemeral: true});
      }
      return;
    }
    // 片方だけ存在する場合もクリーンアップ (より堅牢にするなら)
    if (kttWebhook) await kttWebhook.delete('KTT command: cleanup partial KTT').catch(console.error);
    if (iharaWebhook) await iharaWebhook.delete('KTT command: cleanup partial Ihara').catch(console.error);


    // --- 召喚処理 ---
    let newKttWebhook, newIharaWebhook;
    try {
      newKttWebhook = await channel.createWebhook({
          name: kttWebhookName,
          avatar: baseUser.displayAvatarURL(),
          reason: 'KTT character webhook'
      });
      newIharaWebhook = await channel.createWebhook({
          name: iharaWebhookName,
          avatar: 'https://lh3.googleusercontent.com/a/ACg8ocJ7nZE2j0TFl9E0o0qY6KX0k1X_R7WjqdlCs_Y202WpZw=s96-c', // 例: 固定URL (元のURLはアクセス不能だったため差し替え)
          reason: 'Ihara-sensei character webhook'
      });
    } catch (error) {
      console.error("Webhook作成エラー:", error);
      // 作成途中で失敗した場合、作成済みのものを削除
      if (newKttWebhook) await newKttWebhook.delete().catch(console.error);
      if (newIharaWebhook) await newIharaWebhook.delete().catch(console.error);
      await interaction.editReply({ content: 'Webhookの作成に失敗しました。ボットに「ウェブフックの管理」権限があるか確認してください。', ephemeral: true });
      return;
    }

    // 既存のコレクターがあれば停止
    if (interaction.client.activeCollectors.has(collectorKey)) {
      interaction.client.activeCollectors.get(collectorKey).stop('New KTT instance summoned.');
    }

    const messages = [ /* ... メッセージリストは変更なし ... */
        '改心した？病気？どこかぶつけた？彼女できた？', 'きっっっしょ', '可哀想www', 'わかる！！！！！！！',
        '大丈夫！！？お大事に！！', 'はるかぜくんってかっこいいよね〜(棒)', 'ふーん', 'へぇ', 'りんちゃん一緒にかえろー',
    ];
    const filter = (message) => !message.author.bot && message.author.id !== interaction.client.user.id; // ボット自身と他のボットの発言は無視
    const collector = channel.createMessageCollector({ filter });
    interaction.client.activeCollectors.set(collectorKey, collector);

    collector.on('collect', async (message) => {
      // Webhookがまだ存在するか確認
      if (!newKttWebhook || !newIharaWebhook || 
          !(await channel.fetchWebhooks().then(whs => whs.has(newKttWebhook.id) && whs.has(newIharaWebhook.id)))) {
        console.warn(`KTTまたはIharaのWebhookが見つからないため、コレクターを停止 (Channel: ${channel.id})`);
        collector.stop("Webhooks lost");
        return;
      }

      const randomMessage = messages[Math.floor(Math.random() * messages.length)];
      const userMessageContent = message.content; // 変数名を変更して明確化

      try {
        if (userMessageContent.includes('シュクダイ') || userMessageContent.includes('宿題')) {
          await newKttWebhook.send('シュクダイ？ナニソレオイシイノ？');
        } else if (userMessageContent.includes('漢字')) {
          await newKttWebhook.send('漢字きもい！！！');
        } else if (userMessageContent.includes('天才')) {
          await newKttWebhook.send('え？待って泣ける嬉しい');
        } else {
          if (randomMessage === 'りんちゃん一緒にかえろー') {
            await newKttWebhook.send(randomMessage);
            await newIharaWebhook.send('あおいーーーー！！！'); // この条件の時だけ井原先生も発言
          } else {
            await newKttWebhook.send(randomMessage);
          }
        }
      } catch (sendError) {
          console.error(`Webhook送信エラー (KTT/Ihara - Channel: ${channel.id}):`, sendError);
          // 送信エラーが頻発する場合、コレクターを停止するなどの措置も検討
      }
    });

    collector.on('end', (collected, reason) => {
      console.log(`Collector for KTT in channel ${channel.id} stopped. Reason: ${reason || 'Unknown'}`);
      interaction.client.activeCollectors.delete(collectorKey);
      // コマンドが再実行されずにコレクターが終了した場合（タイムアウト等）、Webhookを削除するかは設計による
      // if (reason !== 'KTT dismissed by command.' && reason !== 'New KTT instance summoned.') {
      //   if (newKttWebhook) newKttWebhook.delete('Collector ended.').catch(console.error);
      //   if (newIharaWebhook) newIharaWebhook.delete('Collector ended.').catch(console.error);
      // }
    });

    const embed = new EmbedBuilder().setColor(0x00FF00).setDescription('KTTと井原先生を召喚しました。');
    await interaction.editReply({ embeds: [embed] });
  },
};
