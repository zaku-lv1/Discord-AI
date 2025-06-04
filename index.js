// discord.js v14 のインポート
const fs = require('node:fs'); // 'node:fs' を推奨
const path = require('node:path'); // 'node:path' を推奨
const { Client, GatewayIntentBits, Collection, Events } = require('discord.js'); // MessageFlags は InteractionResponse で使用するため、ここでは不要な場合も
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

// commands フォルダ内のコマンドファイルを読み込む
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

// ダミーのHTTPサーバーを起動
if (process.env.PORT) { // PORTが設定されている場合のみ起動
    require('node:http').createServer((_, res) => res.end('Bot is running')).listen(process.env.PORT);
    console.log(`HTTPサーバーがポート ${process.env.PORT} で起動しました。`);
}


client.once(Events.ClientReady, async c => { // c を client のエイリアスとして使用
  console.log(`Botが起動しました。ログインユーザー: ${c.user.tag}`);
  console.log('参加しているサーバー:');
  c.guilds.cache.forEach(async (guild) => {
    try {
      const updatedGuild = await guild.fetch(); // 最新情報を取得
      const owner = await c.users.fetch(updatedGuild.ownerId);
      console.log(`- サーバー名: ${updatedGuild.name} (ID: ${updatedGuild.id}), オーナー: ${owner.tag} (ID: ${updatedGuild.ownerId})`);
    } catch (err) {
      console.error(`サーバー ${guild.name} (ID: ${guild.id}) の情報取得に失敗:`, err.message);
    }
  });
  console.log('--------------------------');

  // スラッシュコマンドの登録
  const data = [];
  client.commands.forEach(command => {
    data.push(command.data.toJSON()); // .toJSON() を推奨
  });

  try {
    // 特定のギルドに登録する場合 (開発中は即時反映されるため推奨)
    // await client.application.commands.set(data, 'YOUR_GUILD_ID'); 
    // グローバルに登録する場合 (反映に最大1時間かかる)
    await client.application.commands.set(data);
    console.log('スラッシュコマンドが正常に登録されました。');
  } catch (error) {
    console.error('スラッシュコマンドの登録中にエラーが発生しました:', error);
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
        ephemeral: true // MessageFlags.Ephemeral は v14.7以降非推奨、直接booleanで指定
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
    const scheduleCommand = client.commands.get('schedule'); // "schedule" コマンドオブジェクトを取得

    if (!scheduleCommand) {
        console.error(`${timestamp()} 'schedule' コマンドが見つかりません。モーダル処理をスキップします。`);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'エラーが発生しました。コマンドの処理関数が見つかりません。', ephemeral: true });
        }
        return;
    }

    if (interaction.customId === 'schedule_add_text_modal') {
      if (typeof scheduleCommand.handleScheduleModalSubmit === 'function') {
        console.log(`${timestamp()} Routing to scheduleCommand.handleScheduleModalSubmit for user ${interaction.user.tag}`);
        try {
            await scheduleCommand.handleScheduleModalSubmit(interaction);
        } catch (modalHandlerError) {
            console.error(`${timestamp()} Error in handleScheduleModalSubmit for ${interaction.user.tag}:`, modalHandlerError);
            // deferReply後のエラーなので、editReplyで応答
            if (!interaction.replied) {
                 await interaction.editReply({ content: 'モーダル処理中にエラーが発生しました。再度お試しください。'}).catch(e => console.error(`${timestamp()} Fallback editReply failed for add modal:`, e));
            }
        }
      } else {
        console.error(`${timestamp()} 'schedule_add_text_modal' に対応する handleScheduleModalSubmit が 'schedule' コマンドに見つかりません。`);
        if (!interaction.replied && !interaction.deferred) { // 通常、モーダル送信時はdeferされているはず
          await interaction.reply({ content: 'エラーが発生しました。コマンドの処理関数が正しく設定されていません。', ephemeral: true });
        } else if (!interaction.replied) {
          await interaction.editReply({ content: 'エラーが発生しました。コマンドの処理関数が正しく設定されていません。' }).catch(e => console.error(`${timestamp()} Fallback editReply failed for missing add handler:`, e));
        }
      }
    } else if (interaction.customId === 'schedule_delete_text_modal') { // ★ 削除用モーダルの処理を追加 ★
      if (typeof scheduleCommand.handleScheduleDeleteModal === 'function') {
        console.log(`${timestamp()} Routing to scheduleCommand.handleScheduleDeleteModal for user ${interaction.user.tag}`);
        try {
            await scheduleCommand.handleScheduleDeleteModal(interaction);
        } catch (modalHandlerError) {
            console.error(`${timestamp()} Error in handleScheduleDeleteModal for ${interaction.user.tag}:`, modalHandlerError);
            if (!interaction.replied) {
                 await interaction.editReply({ content: '削除モーダル処理中にエラーが発生しました。再度お試しください。'}).catch(e => console.error(`${timestamp()} Fallback editReply failed for delete modal:`, e));
            }
        }
      } else {
        console.error(`${timestamp()} 'schedule_delete_text_modal' に対応する handleScheduleDeleteModal が 'schedule' コマンドに見つかりません。`);
         if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'エラーが発生しました。コマンドの処理関数が正しく設定されていません。', ephemeral: true });
        } else if (!interaction.replied) {
          await interaction.editReply({ content: 'エラーが発生しました。コマンドの処理関数が正しく設定されていません。' }).catch(e => console.error(`${timestamp()} Fallback editReply failed for missing delete handler:`, e));
        }
      }
    }
    // 他のモーダル customId の処理もここに追加できます
  }
  // isButton() の処理は、schedule.js内のコレクターで処理されているため、ここでは通常不要
});

client.login(process.env.DISCORD_TOKEN);