// =================================================================================
// Discord AI Bot - Refactored Main Server
// =================================================================================
const dotenv = require("dotenv");
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const path = require("path");

// Load environment variables
dotenv.config();

// Services
const firebaseService = require("./services/firebase");
const authService = require("./services/auth");
const DiscordBot = require("./bot/discord-bot");

// Middleware
const { errorHandler } = require("./middleware/auth");

// Routes
const authRoutes = require("./routes/auth");
const aiRoutes = require("./routes/ai");
const settingsRoutes = require("./routes/settings");
const userRoutes = require("./routes/user");

class Server {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 8080;
    this.bot = null;
  }

  async initialize() {
    try {
      // Initialize services
      console.log("[情報] サービスを初期化しています...");
      await firebaseService.initialize();
      await authService.initialize();

      // Setup Express app
      this.setupExpress();
      this.setupRoutes();
      this.setupErrorHandling();

      // Initialize Discord bot
      if (process.env.DISCORD_TOKEN && process.env.DISCORD_TOKEN !== 'test_token') {
        this.bot = new DiscordBot(firebaseService);
        await this.bot.start();
      }

      console.log("[情報] 初期化が完了しました。");
    } catch (error) {
      console.error("[致命的エラー] サーバーの初期化に失敗しました:", error);
      throw error;
    }
  }

  setupExpress() {
    // Session configuration
    this.app.use(session(authService.createSessionConfig()));

    // Passport initialization
    this.app.use(passport.initialize());
    this.app.use(passport.session());

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
    // Health check endpoint
    this.app.get('/api/health', (req, res) => {
      const envConfig = authService.getEnvironmentConfig();
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: envConfig.isProduction ? 'production' : 'development',
        sessionSecure: envConfig.isProduction,
        hostname: req.hostname,
        adminDomain: process.env.ADMIN_DOMAIN,
        emailConfigured: require('./services/email').isInitialized()
      });
    });

    // Main page
    this.app.get("/", (req, res) => {
      res.render("index");
    });

    // Status page
    this.app.get("/status", (req, res) => {
      const emailService = require("./services/email");
      res.json({
        status: "AI Management System - Status",
        authentication: {
          type: "Email-based authentication",
          status: "✅ Working correctly",
          message: "Email authentication system is active"
        },
        routes: {
          auth_login: "✅ /auth/login",
          auth_register: "✅ /auth/register", 
          auth_logout: "✅ /auth/logout",
          auth_user: "✅ /auth/user",
          verify_email: "✅ /auth/verify-email",
          reset_password: "✅ /auth/reset-password",
          health: "✅ /api/health"
        },
        services: {
          email: emailService.isInitialized() ? "✅ Configured" : "❌ Not configured"
        },
        timestamp: new Date().toISOString()
      });
    });

    // API routes
    this.app.use("/auth", authRoutes);
    this.app.use("/api/ais", aiRoutes);
    this.app.use("/api/settings", settingsRoutes);
    this.app.use("/api", userRoutes);
  }

  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      console.log(`[404] Route not found: ${req.method} ${req.originalUrl}`);
      console.log(`[404] Available routes: /auth/*, /api/*, /`);

      res.status(404).json({ 
        message: "Not Found",
        requestedPath: req.originalUrl,
        availableRoutes: [
          "GET /",
          "GET /api/health", 
          "POST /auth/login",
          "POST /auth/register",
          "GET /auth/verify-email",
          "POST /auth/request-password-reset",
          "GET /auth/reset-password",
          "POST /auth/reset-password",
          "GET /auth/logout",
          "GET /auth/user"
        ]
      });
    });

    // Error handler
    this.app.use(errorHandler);
  }

  start() {
    // For GitHub Codespace and other external environments, bind to all interfaces
    const host = process.env.NODE_ENV === 'production' || process.env.ADMIN_DOMAIN ? '0.0.0.0' : 'localhost';
    
    this.app.listen(this.port, host, () => {
      console.log(`[情報] Webサーバーが ${host}:${this.port} で起動しました。`);
      
      const envConfig = authService.getEnvironmentConfig();
      if (!envConfig.isProduction) {
        console.log(`[情報] アクセスURL: http://localhost:${this.port}`);
      } else {
        console.log(`[情報] 外部アクセスURL: ${envConfig.protocol}://${envConfig.domain}${envConfig.port !== 80 && envConfig.port !== 443 ? ':' + envConfig.actualPort : ''}`);
      }
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