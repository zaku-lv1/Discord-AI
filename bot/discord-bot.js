const fs = require("node:fs");
const path = require("node:path");
const { Client, GatewayIntentBits, Collection, Events } = require("discord.js");

class DiscordBot {
  constructor(firebaseService) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });
    
    this.client.commands = new Collection();
    this.client.db = firebaseService.getDB();
    this.firebaseService = firebaseService;
    this.setupEventHandlers();
    this.loadCommands();
  }

  loadCommands() {
    const commandsPath = path.join(__dirname, "../commands");
    
    if (!fs.existsSync(commandsPath)) {
      console.log("[警告] commandsディレクトリが見つかりません。");
      return;
    }

    const commandFiles = fs
      .readdirSync(commandsPath)
      .filter((file) => file.endsWith(".js"));

    for (const file of commandFiles) {
      try {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        
        if ("data" in command && "execute" in command) {
          this.client.commands.set(command.data.name, command);
          console.log(`[情報] コマンド "${command.data.name}" を読み込みました。`);
        } else {
          console.log(`[警告] ${file} は有効なコマンドファイルではありません。`);
        }
      } catch (error) {
        console.error(`[エラー] コマンドファイル ${file} の読み込みに失敗しました:`, error);
      }
    }
  }

  setupEventHandlers() {
    this.client.once(Events.ClientReady, (c) => {
      console.log(`✅ ボット起動: ${c.user.tag}`);
      
      // Register slash commands
      c.application.commands.set(this.client.commands.map((cmd) => cmd.data.toJSON()));
      
      // Set bot activity
      this.client.user.setActivity("AI管理システム", { type: 3 }); // type: 3 = Watching
    });

    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const command = this.client.commands.get(interaction.commandName);
      if (!command) {
        console.error(`コマンド "${interaction.commandName}" が見つかりません。`);
        return;
      }

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`コマンドエラー (${interaction.commandName}):`, error);
        
        // Send error response to user if possible
        const errorMessage = {
          content: 'このコマンドの実行中にエラーが発生しました。',
          ephemeral: true
        };

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorMessage);
        } else {
          await interaction.reply(errorMessage);
        }
      }
    });

    this.client.on(Events.Error, (error) => {
      console.error('Discord client error:', error);
    });

    this.client.on(Events.Warn, (info) => {
      console.warn('Discord client warning:', info);
    });
  }

  async start() {
    if (process.env.DISCORD_TOKEN === 'test_token') {
      console.log('[情報] テスト環境: Discord bot の初期化をスキップします。');
      return;
    }

    if (!process.env.DISCORD_TOKEN) {
      console.error('[エラー] DISCORD_TOKEN が設定されていません。');
      return;
    }

    try {
      await this.client.login(process.env.DISCORD_TOKEN);
    } catch (error) {
      console.error('[エラー] Discord bot への接続に失敗しました:', error.message);
      console.log('[情報] Web サーバーのみで続行します。');
    }
  }

  getClient() {
    return this.client;
  }
}

module.exports = DiscordBot;