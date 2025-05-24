const fs = require('fs');
const { Client, Intents, WebhookClient } = require('discord.js');
const dotenv = require('dotenv');

dotenv.config();

const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.DIRECT_MESSAGES] });

const commands = {};
const commandFiles = fs.readdirSync('./commands').filter((file) => file.endsWith('.js'));

// ダミーのHTTPサーバーを起動して Render のポート監視を回避（必須ではないが安定化）
require('http').createServer((_, res) => res.end('Bot is running')).listen(process.env.PORT || 3000);

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  commands[command.data.name] = command;
}

// 禁止ワードのディレクトリとファイルパス
const pwlistDirectory = './pwlist';
const getProhibitedWordsFile = (guildId) => `${pwlistDirectory}/${guildId}.json`;

// 禁止ワードのリストを読み込む関数
function loadProhibitedWords(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`禁止ワードの読み込み中にエラーが発生しました: ${error}`);
    return [];
  }
}

// 禁止ワードのリスト
const prohibitedWords = {};

client.once('ready', async () => {
  console.log('Botが起動しました。');
  console.log('参加しているサーバー:');
  client.guilds.cache.forEach(async (guild) => {
    const updatedGuild = await guild.fetch(); // サーバーの情報を最新の状態に更新する
    const owner = await client.users.fetch(updatedGuild.ownerId); // オーナー情報を取得する
    console.log(`- サーバー名: ${updatedGuild.name}`);
    console.log(`- サーバーID: ${updatedGuild.id}`);
    console.log(`- オーナー名: ${owner.tag}`);
    console.log(`- オーナーID: ${updatedGuild.ownerId}`);
    console.log('--------------------------');

    // サーバーごとの禁止ワードリストを読み込む
    const prohibitedWordsFile = getProhibitedWordsFile(updatedGuild.id);
    prohibitedWords[updatedGuild.id] = loadProhibitedWords(prohibitedWordsFile);

    // 禁止ワードリストの監視
    fs.watchFile(prohibitedWordsFile, (curr, prev) => {
      if (curr.mtime > prev.mtime) {
        console.log('禁止ワードリストが更新されました。');

        // 禁止ワードリストを再読込
        prohibitedWords[updatedGuild.id] = loadProhibitedWords(prohibitedWordsFile);
      }
    });
  });
});

client.once('ready', async () => {
  const data = [];
  for (const commandName in commands) {
    data.push(commands[commandName].data);
  }
  await client.application.commands.set(data);
  console.log('DiscordBotが起動しました。');
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) {
    return;
  }
  const command = commands[interaction.commandName];
  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({
      content: 'コマンドの内部でエラーが発生しました。',
      ephemeral: true,
    });
  }
});

const fullWidthToHalfWidth = (str) => {
  return str.replace(/[！-～]/g, (char) => {
    return String.fromCharCode(char.charCodeAt(0) - 0xfee0);
  });
};

const removeSpacesAndNewlines = (str) => {
  return str.replace(/[\s\n]/g, '');
};

const normalizeString = (str) => {
  return fullWidthToHalfWidth(removeSpacesAndNewlines(str.toLowerCase()));
};

client.on('messageCreate', async (message) => {
  try {
    // ボット自身のメッセージは無視
    if (message.author.bot) return;

    // DMでは処理しないようにする（message.guild が null になるため）
    if (!message.guild || !message.member) return;

    // 管理者権限を持つユーザーは処理をスキップする
    if (message.member.permissions.has("ADMINISTRATOR")) return;

    // 以下、禁止ワードチェックなどの処理を続ける
    const guildId = message.guild.id;
    const prohibitedWordsFile = getProhibitedWordsFile(guildId);
    const prohibitedWordsForGuild = prohibitedWords[guildId] || loadProhibitedWords(prohibitedWordsFile);
    const normalizedProhibitedWords = prohibitedWordsForGuild.map(word => normalizeString(word));
    const normalizedContent = normalizeString(message.content);
    const violatedWords = normalizedProhibitedWords.filter(word =>
      normalizedContent.includes(word)
    );

    if (violatedWords.length > 0) {
      await message.delete();
      const violationCount = loadUserViolationCount(guildId, message.author.id);
      saveUserViolationCount(guildId, message.author.id, violationCount + 1);

      if (violationCount + 1 >= 5) {
        const noteEmbed = {
          type: "rich",
          title: "厳重注意",
          description: "不適切な発言を複数行ったため、KICKされました。",
          color: 0xFF0000,
        };
        await message.author.send({ embeds: [noteEmbed] });
        await message.member.kick('違反行為');
        console.log(`ユーザー ${message.author.tag} をキックしました。`);
      } else {
        const warningEmbed = {
          type: "rich",
          title: "警告",
          description: "不適切な発言が見られたため、該当メッセージを削除しました。このような発言が多く見られた場合、KICKされる可能性があります。",
          color: 0xFF0000,
          fields: [
            {
              name: "違反したワード",
              value: violatedWords.map(word => `\`${word}\``).join(", ") || "違反したワードがありません"
            },
            {
              name: "違反回数",
              value: `${violationCount + 1}回目の違反`
            }
          ]
        };

        await message.author.send({ embeds: [warningEmbed] });
        await message.member.timeout(10000); // 10秒タイムアウト
      }
    }
  } catch (error) {
    console.error('メッセージ処理中にエラーが発生しました:', error);
  }
});

　


// pwlistディレクトリが存在しない場合は作成する
if (!fs.existsSync(pwlistDirectory)) {
  fs.mkdirSync(pwlistDirectory);
}

// 違反回数の保存先ディレクトリ
const puserDataDirectory = './puser';

// 違反回数の保存先ディレクトリが存在しない場合は作成する
if (!fs.existsSync(puserDataDirectory)) {
  fs.mkdirSync(puserDataDirectory);
}

// ユーザーごとの違反回数を保存する関数
function saveUserViolationCount(guildId, userId, count) {
  const userDataPath = `${puserDataDirectory}/${guildId}_${userId}.json`;
  const userData = { count };
  fs.writeFileSync(userDataPath, JSON.stringify(userData));
}

// ユーザーごとの違反回数を読み取る関数
function loadUserViolationCount(guildId, userId) {
  const userDataPath = `${puserDataDirectory}/${guildId}_${userId}.json`;
  if (!fs.existsSync(userDataPath)) {
    return 0;
  }
  const userData = fs.readFileSync(userDataPath, 'utf8');
  return JSON.parse(userData).count;
}


client.login(process.env.DISCORD_TOKEN);
