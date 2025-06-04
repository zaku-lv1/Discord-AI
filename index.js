// discord.js v14 のインポート
const fs = require('fs');
const { Client, GatewayIntentBits, Collection, Events, MessageFlags } = require('discord.js'); // Added MessageFlags
const dotenv = require('dotenv');

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent, // Good, this is needed if you ever collect messages
    GatewayIntentBits.GuildIntegrations // Often useful for webhooks, might not be strictly necessary for modals
  ]
});

// client.commands を Collection として初期化
client.commands = new Collection(); // ★★★ この行を追加 ★★★

const commandFiles = fs.readdirSync('./commands').filter((file) => file.endsWith('.js'));

// ダミーのHTTPサーバーを起動（変更なし）
require('http').createServer((_, res) => res.end('Bot is running')).listen(process.env.PORT || 3000);

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  // スラッシュコマンドを client.commands に登録
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command); // ★★★ ここを修正 ★★★
  } else {
    console.log(`[警告] ./commands/${file} のコマンドは、必須の "data" または "execute" プロパティを欠いています。`);
  }
}

client.once(Events.ClientReady, async () => { // ★★★ Events.ClientReady を使用 ★★★
  console.log('Botが起動しました。');
  console.log('参加しているサーバー:');
  client.guilds.cache.forEach(async (guild) => {
    try { // エラーハンドリングを追加
      const updatedGuild = await guild.fetch();
      const owner = await client.users.fetch(updatedGuild.ownerId);
      console.log(`- サーバー名: ${updatedGuild.name}`);
      console.log(`- サーバーID: ${updatedGuild.id}`);
      console.log(`- オーナー名: ${owner.tag}`);
      console.log(`- オーナーID: ${updatedGuild.ownerId}`);
      console.log('--------------------------');
    } catch (err) {
      console.error(`サーバー ${guild.name} (ID: ${guild.id}) の情報取得に失敗:`, err);
      console.log('--------------------------');
    }
  });

  // スラッシュコマンドの登録 (一度だけ実行するように修正)
  const data = [];
  client.commands.forEach(command => { // ★★★ client.commands から取得 ★★★
    data.push(command.data);
  });

  try {
    await client.application.commands.set(data);
    console.log('スラッシュコマンドが正常に登録されました。');
  } catch (error) {
    console.error('スラashコマンドの登録中にエラーが発生しました:', error);
  }
});


client.on(Events.InteractionCreate, async (interaction) => { // ★★★ Events.InteractionCreate を使用 ★★★
  const timestamp = () => `[${new Date().toISOString()}]`;

  if (interaction.isChatInputCommand()) { // ★★★ isChatInputCommand() に変更 ★★★
    console.log(`${timestamp()} ChatInputCommand received: ${interaction.commandName}, user: ${interaction.user.tag}`);
    const command = client.commands.get(interaction.commandName); // ★★★ client.commands から取得 ★★★

    if (!command) {
      console.error(`${timestamp()} コマンド ${interaction.commandName} が見つかりません。`);
      await interaction.reply({
        content: '不明なコマンドです。',
        flags: MessageFlags.Ephemeral // ephemeral: true を flags に変更
      });
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`${timestamp()} コマンド実行エラー (${interaction.commandName}):`, error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'コマンド実行中にエラーが発生しました。', flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: 'コマンド実行中にエラーが発生しました。', flags: MessageFlags.Ephemeral });
      }
    }
  } else if (interaction.isModalSubmit()) { // ★★★ モーダル送信処理を追加 ★★★
    console.log(`${timestamp()} ModalSubmit detected: customId=${interaction.customId}, user=${interaction.user.tag}`);
    if (interaction.customId === 'schedule_add_text_modal') {
      const scheduleCommand = client.commands.get('schedule'); // "schedule" コマンドを取得
      if (scheduleCommand && typeof scheduleCommand.handleScheduleModalSubmit === 'function') {
        console.log(`${timestamp()} Routing to scheduleCommand.handleScheduleModalSubmit for user ${interaction.user.tag}`);
        try {
            await scheduleCommand.handleScheduleModalSubmit(interaction);
        } catch (modalHandlerError) {
            console.error(`${timestamp()} Error in handleScheduleModalSubmit for ${interaction.user.tag}:`, modalHandlerError);
            if (!interaction.replied && !interaction.deferred) {
                // この時点では deferReply が呼ばれているはずなので、通常ここには来ない
                await interaction.reply({ content: 'モーダル処理中にエラーが発生しました。', flags: MessageFlags.Ephemeral });
            } else if (!interaction.replied) {
                // defer 済みだがまだ応答がない場合 (editReply が失敗した可能性)
                await interaction.editReply({ content: 'モーダル処理中にエラーが発生しました。再度お試しください。'}).catch(e => console.error("Fallback editReply failed:", e));
            }
        }
      } else {
        console.error(`${timestamp()} 'schedule_add_text_modal' に対応する handleScheduleModalSubmit が見つかりません。`);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'エラーが発生しました。コマンドの処理関数が見つかりません。', flags: MessageFlags.Ephemeral });
        }
      }
    }
    // 他のモーダルの処理もここに追加できます
  }
  // isButton() の処理も必要に応じてここに追加できます (今回はschedule.js内のコレクターで処理)
});

client.login(process.env.DISCORD_TOKEN);