// discord.js v14 のインポート
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const dotenv = require('dotenv');

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
    data.push(command.data.toJSON());
  });

  try {
    await client.application.commands.set(data);
    console.log('スラッシュコマンドが正常に登録されました。');
  } catch (error) {
    console.error('スラッシュコマンドの登録中にエラーが発生しました:', error);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  const timestamp = () => `[${new Date().toISOString()}]`;

  if (interaction.isChatInputCommand()) {
    // ... (変更なし) ...
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
    const scheduleCommand = client.commands.get('schedule');

    if (!scheduleCommand) {
        console.error(`${timestamp()} 'schedule' コマンドが見つかりません。モーダル処理をスキップします。`);
        if (interaction.isRepliable()) { // Check if interaction is still repliable
          await interaction.reply({ content: 'エラーが発生しました。コマンドの処理関数が見つかりません。', ephemeral: true }).catch(e => console.error(`${timestamp()} Fallback reply failed for missing schedule command:`, e));
        }
        return;
    }

    try {
        if (interaction.customId === 'schedule_add_text_modal') {
          if (typeof scheduleCommand.handleScheduleModalSubmit === 'function') {
            console.log(`${timestamp()} Routing to scheduleCommand.handleScheduleModalSubmit for user ${interaction.user.tag}`);
            await scheduleCommand.handleScheduleModalSubmit(interaction);
          } else {
            console.error(`${timestamp()} 'schedule_add_text_modal' に対応する handleScheduleModalSubmit が 'schedule' コマンドに見つかりません。`);
            if (interaction.isRepliable()) await interaction.reply({ content: 'エラー: 追加処理関数が見つかりません。', ephemeral: true }).catch(e => console.error(`${timestamp()} Fallback reply failed:`, e));
          }
        } else if (interaction.customId === 'schedule_delete_text_modal') {
          if (typeof scheduleCommand.handleScheduleDeleteModal === 'function') {
            console.log(`${timestamp()} Routing to scheduleCommand.handleScheduleDeleteModal for user ${interaction.user.tag}`);
            await scheduleCommand.handleScheduleDeleteModal(interaction);
          } else {
            console.error(`${timestamp()} 'schedule_delete_text_modal' に対応する handleScheduleDeleteModal が 'schedule' コマンドに見つかりません。`);
             if (interaction.isRepliable()) await interaction.reply({ content: 'エラー: 削除処理関数が見つかりません。', ephemeral: true }).catch(e => console.error(`${timestamp()} Fallback reply failed:`, e));
          }
        } else if (interaction.customId.startsWith('schedule_edit_modal_submit_')) { // ★編集用モーダルの処理を追加★
          const targetIndexString = interaction.customId.split('_').pop();
          const targetIndex = parseInt(targetIndexString, 10);

          if (isNaN(targetIndex)) {
            console.error(`${timestamp()} 編集モーダルのcustomIdからインデックスのパースに失敗: ${interaction.customId}`);
            if (interaction.isRepliable()) await interaction.reply({ content: 'エラー: 編集対象の特定に失敗しました。', ephemeral: true }).catch(e => console.error(`${timestamp()} Fallback reply failed:`, e));
            return;
          }

          if (typeof scheduleCommand.handleScheduleEditModal === 'function') {
            console.log(`${timestamp()} Routing to scheduleCommand.handleScheduleEditModal for user ${interaction.user.tag}, targetIndex: ${targetIndex}`);
            await scheduleCommand.handleScheduleEditModal(interaction, targetIndex);
          } else {
            console.error(`${timestamp()} 'schedule_edit_modal_submit_' に対応する handleScheduleEditModal が 'schedule' コマンドに見つかりません。`);
            if (interaction.isRepliable()) await interaction.reply({ content: 'エラー: 編集処理関数が見つかりません。', ephemeral: true }).catch(e => console.error(`${timestamp()} Fallback reply failed:`, e));
          }
        }
    } catch (modalError) {
        console.error(`${timestamp()} Modal processing error for customId ${interaction.customId}, user ${interaction.user.tag}:`, modalError);
        // モーダル処理中のエラーは、modalInteraction.editReply で処理されるべきだが、
        // ここに来る場合は、その editReply 自体が失敗したか、それ以前の問題の可能性
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred ) { // deferReply 前のエラーの場合
             await interaction.reply({ content: 'モーダル処理中に予期せぬエラーが発生しました。', ephemeral: true }).catch(e => console.error(`${timestamp()} Fallback reply failed for modalError:`, e));
        } else if (interaction.isRepliable() && interaction.deferred && !interaction.replied) { // deferReply 済みだが editReply 前のエラーの場合
             await interaction.editReply({ content: 'モーダル処理中に予期せぬエラーが発生しました。'}).catch(e => console.error(`${timestamp()} Fallback editReply failed for modalError:`, e));
        }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);