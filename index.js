// discord.js v14 のインポート
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Collection, Events, EmbedBuilder } = require('discord.js'); // EmbedBuilderを追加
const dotenv = require('dotenv');
const cron = require('node-cron'); // ★ node-cron をインポート
const scheduleModule = require('./commands/schedule'); // ★ schedule.js をインポート

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildIntegrations
  ]
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.log(`[警告] ${filePath} のコマンドは、必須の "data" または "execute" プロパティを欠いています。`);
  }
}

if (process.env.PORT) {
    require('node:http').createServer((_, res) => res.end('Bot is running')).listen(process.env.PORT);
    console.log(`HTTPサーバーがポート ${process.env.PORT} で起動しました。`);
}

client.once(Events.ClientReady, async c => {
  console.log(`Botが起動しました。ログインユーザー: ${c.user.tag}`);
  console.log('参加しているサーバー:');
  c.guilds.cache.forEach(async (guild) => {
    try {
      const updatedGuild = await guild.fetch();
      const owner = await c.users.fetch(updatedGuild.ownerId);
      console.log(`- サーバー名: ${updatedGuild.name} (ID: ${updatedGuild.id}), オーナー: ${owner.tag} (ID: ${updatedGuild.ownerId})`);
    } catch (err) {
      console.error(`サーバー ${guild.name} (ID: ${guild.id}) の情報取得に失敗:`, err.message);
    }
  });
  console.log('--------------------------');

  const data = [];
  client.commands.forEach(command => {
    if (command.data) { // command.data が存在することを確認
        data.push(command.data.toJSON());
    }
  });

  try {
    if (client.application) { // client.application が存在することを確認
        await client.application.commands.set(data);
        console.log('スラッシュコマンドが正常に登録されました。');
    } else {
        console.error('client.application が未定義です。スラッシュコマンドの登録をスキップします。');
    }
  } catch (error) {
    console.error('スラッシュコマンドの登録中にエラーが発生しました:', error);
  }

  // --------------------------
  // ★ リマインダー機能の初期化
  // --------------------------
  const scheduleChannelId = process.env.SCHEDULE_CHANNEL_ID;
  if (scheduleChannelId) {
    console.log(`[リマインダー] 有効。通知チャンネルID: ${scheduleChannelId}`);
    // 毎日午前8時に実行 (日本時間)
    // cron.schedule('0 8 * * *', async () => { // 本番用
    cron.schedule('*/2 * * * *', async () => { // テスト用: 2分ごと
      console.log(`[リマインダー] ${new Date().toLocaleString()} - 予定の確認を開始します...`);
      try {
        const sheets = await scheduleModule.getSheetsClient(); // schedule.jsからインポートした関数を使用
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: scheduleModule.sheetId, // schedule.jsからインポートした値を使用
          range: scheduleModule.listRange,       // schedule.jsからインポートした値を使用
        });
        const allSchedules = response.data.values || [];

        if (allSchedules.length === 0) {
          console.log('[リマインダー] 現在登録されている予定はありません。');
          return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0); // 今日の0時0分0秒
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1); // 明日の0時0分0秒

        const upcomingSchedules = [];

        for (const schedule of allSchedules) {
          const type = schedule[0];
          const task = schedule[1];
          const dueDateString = schedule[2];

          if (!dueDateString || !task || dueDateString.toLowerCase() === '不明') continue;

          try {
            // YYYY-MM-DD or YYYY/MM/DD or MM-DD or MM/DD 形式をパース
            let year, month, day;
            const parts = dueDateString.replace(/\//g, '-').split('-');

            if (parts.length === 3) { // YYYY-MM-DD
              year = parseInt(parts[0], 10);
              month = parseInt(parts[1], 10) - 1; // Dateオブジェクトの月は0から始まる
              day = parseInt(parts[2], 10);
            } else if (parts.length === 2) { // MM-DD (当年と仮定)
              year = today.getFullYear();
              month = parseInt(parts[0], 10) - 1;
              day = parseInt(parts[1], 10);
            } else {
              console.warn(`[リマインダー] 解析できない日付形式のためスキップ: ${dueDateString} (タスク: ${task})`);
              continue;
            }

            if (isNaN(year) || isNaN(month) || isNaN(day) || month < 0 || month > 11 || day < 1 || day > 31) {
                console.warn(`[リマインダー] 無効な日付のためスキップ: ${dueDateString} (タスク: ${task})`);
                continue;
            }

            const dueDate = new Date(year, month, day);
            dueDate.setHours(0, 0, 0, 0); // 比較のため時刻をリセット

            if (dueDate.getTime() === tomorrow.getTime()) {
              upcomingSchedules.push({ type, task, due: dueDateString });
            }
          } catch (e) {
            console.warn(`[リマインダー] '${dueDateString}' (タスク: ${task}) の日付処理中にエラー: ${e.message}`);
          }
        }

        if (upcomingSchedules.length > 0) {
          const channel = await client.channels.fetch(scheduleChannelId).catch(err => {
            console.error(`[リマインダー] 通知チャンネル (ID: ${scheduleChannelId}) の取得に失敗しました:`, err);
            return null;
          });

          if (channel && channel.isTextBased()) { // テキストベースのチャンネルか確認
            const embed = new EmbedBuilder()
              .setTitle('📢 明日期日の予定リマインダー')
              .setColor(0xFFAC33) // オレンジ色
              .setDescription(`明日期日（${tomorrow.toLocaleDateString('ja-JP')}）の予定が ${upcomingSchedules.length}件 あります！`)
              .setTimestamp();

            upcomingSchedules.forEach(s => {
              embed.addFields({ name: `📝 ${s.type || 'タスク'}`, value: `**内容:** ${s.task}\n**期限:** ${s.due}`, inline: false });
            });

            await channel.send({ embeds: [embed] });
            console.log(`[リマインダー] ${upcomingSchedules.length}件の予定をチャンネル #${channel.name} に通知しました。`);
          } else if (channel) {
            console.error(`[リマインダー] チャンネル (ID: ${scheduleChannelId}) はテキストベースのチャンネルではありません。`);
          }
        } else {
          console.log('[リマインダー] 明日期日の予定はありません。');
        }
      } catch (error) {
        console.error('[リマインダー] 予定の確認・通知処理中にエラーが発生しました:', error);
      }
    }, {
      scheduled: true,
      timezone: "Asia/Tokyo" // タイムゾーンを指定 (JST)
    });
    console.log('[リマインダー] cronジョブがスケジュールされました。毎日午前8時 (JST) に実行されます。');
  } else {
    console.log('[リマインダー] 環境変数 SCHEDULE_CHANNEL_ID が設定されていないため、リマインダー機能は無効です。');
  }
});

client.on(Events.InteractionCreate, async interaction => {
  const timestamp = () => `[${new Date().toISOString()}]`;

  if (interaction.isChatInputCommand()) {
    console.log(`${timestamp()} ChatInputCommand received: ${interaction.commandName}, user: ${interaction.user.tag}, guild: ${interaction.guild?.name || 'DM'}`);
    const command = client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`${timestamp()} コマンド ${interaction.commandName} が見つかりません。`);
      await interaction.reply({
        content: '不明なコマンドです。',
        ephemeral: true
      });
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`${timestamp()} コマンド実行エラー (${interaction.commandName}):`, error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'コマンド実行中にエラーが発生しました。', ephemeral: true });
      } else {
        await interaction.reply({ content: 'コマンド実行中にエラーが発生しました。', ephemeral: true });
      }
    }
  } else if (interaction.isModalSubmit()) {
    console.log(`${timestamp()} ModalSubmit detected: customId=${interaction.customId}, user=${interaction.user.tag}, guild: ${interaction.guild?.name || 'DM'}`);
    // モーダルサブミットIDに基づいて適切なコマンドのハンドラを呼び出す
    // ここでは 'schedule' コマンドにモーダル処理が集約されていると仮定
    const commandName = interaction.customId.split('_')[0]; // e.g., "schedule_add_text_modal" -> "schedule"
    const command = client.commands.get(commandName);


    if (!command) {
        console.error(`${timestamp()} モーダル ${interaction.customId} に対応するコマンドが見つかりません。`);
        if (interaction.isRepliable()) {
          await interaction.reply({ content: 'エラーが発生しました。コマンドの処理関数が見つかりません。', ephemeral: true }).catch(e => console.error(`${timestamp()} Fallback reply failed for missing command for modal:`, e));
        }
        return;
    }

    try {
        if (interaction.customId === 'schedule_add_text_modal') {
          if (typeof command.handleScheduleModalSubmit === 'function') {
            await command.handleScheduleModalSubmit(interaction);
          } else {
            console.error(`${timestamp()} 'schedule_add_text_modal' に対応する handleScheduleModalSubmit が '${commandName}' コマンドに見つかりません。`);
            if (interaction.isRepliable()) await interaction.reply({ content: 'エラー: 追加処理関数が見つかりません。', ephemeral: true });
          }
        } else if (interaction.customId === 'schedule_delete_text_modal') {
          if (typeof command.handleScheduleDeleteModal === 'function') {
            await command.handleScheduleDeleteModal(interaction);
          } else {
            console.error(`${timestamp()} 'schedule_delete_text_modal' に対応する handleScheduleDeleteModal が '${commandName}' コマンドに見つかりません。`);
            if (interaction.isRepliable()) await interaction.reply({ content: 'エラー: 削除処理関数が見つかりません。', ephemeral: true });
          }
        } else if (interaction.customId.startsWith('schedule_edit_modal_submit_')) {
          const targetIndexString = interaction.customId.split('_').pop();
          const targetIndex = parseInt(targetIndexString, 10);

          if (isNaN(targetIndex)) {
            console.error(`${timestamp()} 編集モーダルのcustomIdからインデックスのパースに失敗: ${interaction.customId}`);
            if (interaction.isRepliable()) await interaction.reply({ content: 'エラー: 編集対象の特定に失敗しました。', ephemeral: true });
            return;
          }

          if (typeof command.handleScheduleEditModal === 'function') {
            await command.handleScheduleEditModal(interaction, targetIndex);
          } else {
            console.error(`${timestamp()} 'schedule_edit_modal_submit_' に対応する handleScheduleEditModal が '${commandName}' コマンドに見つかりません。`);
            if (interaction.isRepliable()) await interaction.reply({ content: 'エラー: 編集処理関数が見つかりません。', ephemeral: true });
          }
        } else {
            console.warn(`${timestamp()} 未知のモーダル customId: ${interaction.customId}`);
            if (interaction.isRepliable()) await interaction.reply({ content: '不明なモーダル操作です。', ephemeral: true});
        }
    } catch (modalError) {
        console.error(`${timestamp()} Modal processing error for customId ${interaction.customId}, user ${interaction.user.tag}:`, modalError);
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred ) {
             await interaction.reply({ content: 'モーダル処理中に予期せぬエラーが発生しました。', ephemeral: true }).catch(e => console.error(`${timestamp()} Fallback reply failed for modalError:`, e));
        } else if (interaction.isRepliable() && interaction.deferred && !interaction.replied) {
             await interaction.editReply({ content: 'モーダル処理中に予期せぬエラーが発生しました。'}).catch(e => console.error(`${timestamp()} Fallback editReply failed for modalError:`, e));
        }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);