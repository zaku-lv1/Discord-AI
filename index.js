// Node.js コアモジュールは 'node:' プレフィックスを推奨
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http'); // httpも同様

// discord.js v14 のインポート
const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const dotenv = require('dotenv');

dotenv.config();

// v14 の Intents 指定方法
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// コマンドを格納するための Collection を作成
client.commands = new Collection();

// コマンドファイルの読み込み
const commandsPath = path.join(__dirname, 'commands'); // './commands' と同じだが、より堅牢
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);

  // コマンドに必要な 'data' と 'execute' プロパティがあるか確認
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    console.log(`[INFO] Loaded command: ${command.data.name}`);
  } else {
    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

// Render のポート監視を回避するためのダミーHTTPサーバー (変更なし)
http.createServer((_, res) => res.end('Bot is running')).listen(process.env.PORT || 3000);

// ボット起動時の処理 (ready イベント) - 1つに統合
client.once(Events.ClientReady, async (readyClient) => { // Events.ClientReady を使用し、引数でready状態のクライアントを取得
  console.log(`Logged in as ${readyClient.user.tag}!`);
  console.log('Botが起動しました。');

  // 参加サーバー情報を表示
  console.log('参加しているサーバー:');
  readyClient.guilds.cache.forEach(async (guild) => {
    try {
      // guild.fetch() は通常キャッシュが最新であれば不要な場合も多いですが、オーナー情報を確実に取得するために使用
      // const updatedGuild = await guild.fetch(); // 必要であればコメントアウトを解除
      const owner = await guild.members.fetch(guild.ownerId); // guild.ownerId からオーナーの Member オブジェクトを取得
      console.log(`- サーバー名: ${guild.name}`);
      console.log(`  - サーバーID: ${guild.id}`);
      console.log(`  - オーナー名: ${owner.user.tag}`); // owner.user.tag でタグ表示
      console.log(`  - オーナーID: ${guild.ownerId}`);
      console.log('  --------------------------');
    } catch (error) {
      console.error(`Error fetching info for guild ${guild.name} (${guild.id}):`, error);
      console.log(`- サーバー名: ${guild.name} (オーナー情報取得エラー)`);
      console.log(`  - サーバーID: ${guild.id}`);
      console.log('  --------------------------');
    }
  });

  // スラッシュコマンドの登録
  const commandDataToRegister = [];
  for (const command of client.commands.values()) { // Collection からコマンドを取得
    // command.data が SlashCommandBuilder のインスタンスなら .toJSON() が必要
    // そうでない場合は、そのまま command.data を使う
    if (typeof command.data.toJSON === 'function') {
      commandDataToRegister.push(command.data.toJSON());
    } else {
      commandDataToRegister.push(command.data); // 既にJSON互換オブジェクトの場合
    }
  }

  try {
    // グローバルコマンドとして登録 (反映に最大1時間かかることがあります)
    await readyClient.application.commands.set(commandDataToRegister);
    console.log('グローバルアプリケーションコマンド (/) を正常に登録しました。');

    // 特定のギルドのみにコマンドを登録したい場合 (テスト用などに即時反映される)
    // const guildId = 'YOUR_TEST_GUILD_ID';
    // await readyClient.application.commands.set(commandDataToRegister, guildId);
    // console.log(`ギルド ${guildId} のアプリケーションコマンド (/) を正常に登録しました。`);
  } catch (error) {
    console.error('アプリケーションコマンドの登録中にエラーが発生しました:', error);
  }
});

// インタラクション発生時の処理
client.on(Events.InteractionCreate, async (interaction) => { // Events.InteractionCreate を使用
  // スラッシュコマンド以外のインタラクションは無視
  if (!interaction.isChatInputCommand()) { // スラッシュコマンドに限定
    return;
  }

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`コマンド "${interaction.commandName}" が見つかりませんでした。`);
    await interaction.reply({
      content: '該当するコマンドが見つかりませんでした。',
      ephemeral: true,
    });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`コマンド "${interaction.commandName}" の実行中にエラーが発生しました:`, error);
    // エラー発生時、既に返信済みか遅延応答中かを確認
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: 'コマンドの実行中に内部エラーが発生しました。',
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: 'コマンドの実行中に内部エラーが発生しました。',
        ephemeral: true,
      });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);