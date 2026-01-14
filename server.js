// =================================================================================
// Discord AI Bot - Simplified Server (No Firebase, No Auth)
// =================================================================================
const dotenv = require("dotenv");
const express = require("express");
const path = require("path");

// Load environment variables
dotenv.config();

// Services
const aiConfigStore = require("./services/ai-config-store");
const DiscordBot = require("./bot/discord-bot");

// Middleware
const { ipAllowlist } = require("./middleware/ip-allowlist");

// Routes
const settingsAiRoutes = require("./routes/settings-ai");

class Server {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 8080;
    this.bot = null;
  }

  async initialize() {
    try {
      console.log("[情報] サービスを初期化しています...");
      
      // Ensure AI config exists
      await aiConfigStore.getConfig();

      // Setup Express app
      this.setupExpress();
      this.setupRoutes();
      this.setupErrorHandling();

      // Initialize Discord bot (uses file-based config from ai-config-store)
      if (process.env.DISCORD_TOKEN && process.env.DISCORD_TOKEN !== 'test_token') {
        this.bot = new DiscordBot();
        await this.bot.start();
      } else {
        console.log("[情報] DISCORD_TOKENが設定されていないため、Discord botは起動しません。");
      }

      console.log("[情報] 初期化が完了しました。");
    } catch (error) {
      console.error("[致命的エラー] サーバーの初期化に失敗しました:", error);
      throw error;
    }
  }

  setupExpress() {
    // Body parsing middleware
    this.app.use(express.json({ limit: "5mb" }));
    this.app.use(express.urlencoded({ extended: true }));

    // View engine
    this.app.set("view engine", "ejs");
    this.app.set("views", path.join(__dirname, "views"));

    // Static files
    this.app.use(express.static(path.join(__dirname, "public")));
  }

  setupRoutes() {
    // Health check endpoint (public)
    this.app.get('/api/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        botActive: !!this.bot
      });
    });

    // Main page (public)
    this.app.get("/", (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Discord AI Bot</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              max-width: 800px;
              margin: 50px auto;
              padding: 20px;
              background: #f5f5f5;
            }
            .card {
              background: white;
              padding: 30px;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            h1 { color: #333; }
            .link {
              display: inline-block;
              margin-top: 20px;
              padding: 10px 20px;
              background: #5865F2;
              color: white;
              text-decoration: none;
              border-radius: 4px;
            }
            .link:hover {
              background: #4752C4;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>🤖 Discord AI Bot</h1>
            <p>Welcome to the Discord AI Bot management system.</p>
            <p>Use the <code>/ai</code> command in Discord to summon the AI assistant.</p>
            <a href="/dashboard" class="link">Go to Dashboard</a>
          </div>
        </body>
        </html>
      `);
    });

    // Dashboard (IP protected)
    this.app.get("/dashboard", ipAllowlist, (req, res) => {
      res.render("dashboard");
    });

    // API routes (IP protected)
    this.app.use("/api/settings", ipAllowlist, settingsAiRoutes);
  }

  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      if (req.originalUrl.startsWith('/api/')) {
        res.status(404).json({ 
          error: "Not Found",
          message: "The requested resource was not found"
        });
      } else {
        res.status(404).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>404 - Not Found</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                max-width: 600px;
                margin: 100px auto;
                padding: 20px;
                text-align: center;
              }
              h1 { color: #e74c3c; }
            </style>
          </head>
          <body>
            <h1>404 - Page Not Found</h1>
            <p>The page you're looking for doesn't exist.</p>
            <a href="/">Go Home</a>
          </body>
          </html>
        `);
      }
    });

    // Error handler
    this.app.use((err, req, res, next) => {
      console.error("[エラー] Unhandled error:", err);
      res.status(500).json({
        error: "Internal Server Error",
        message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message
      });
    });
  }

  start() {
    const host = '0.0.0.0';
    
    this.app.listen(this.port, host, () => {
      console.log(`[情報] Webサーバーが ${host}:${this.port} で起動しました。`);
      console.log(`[情報] アクセスURL: http://localhost:${this.port}`);
      console.log(`[情報] ダッシュボード: http://localhost:${this.port}/dashboard`);
    });
  }

  getApp() {
    return this.app;
  }

  getBot() {
    return this.bot;
  }
}

// Main execution
async function main() {
  const server = new Server();
  
  try {
    await server.initialize();
    server.start();
  } catch (error) {
    console.error("[致命的エラー] サーバーの起動に失敗しました:", error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[致命的エラー] Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[エラー] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the server
if (require.main === module) {
  main();
}

module.exports = Server;
