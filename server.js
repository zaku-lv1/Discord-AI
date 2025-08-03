// =================================================================================
// Discord AI Bot - Refactored Main Server
// =================================================================================
const dotenv = require("dotenv");
const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const passport = require("passport");
const path = require("path");

// Load environment variables
dotenv.config();

// Services
const firebaseService = require("./services/firebase");
const authService = require("./services/auth");
const systemSettingsService = require("./services/system-settings");
const DiscordBot = require("./bot/discord-bot");

// Middleware
const { errorHandler } = require("./middleware/auth");
const { checkMaintenanceMode, checkInvitationRequirement } = require("./middleware/system");

// Routes
const authRoutes = require("./routes/auth");
const aiRoutes = require("./routes/ai");
const settingsRoutes = require("./routes/settings");
const userRoutes = require("./routes/user");
const roleManagementRoutes = require("./routes/role-management");
const ownerSetupRoutes = require("./routes/owner-setup");
const systemSettingsRoutes = require("./routes/system-settings");

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
      await systemSettingsService.initialize();
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

      // Setup periodic cleanup of expired remember tokens (every 24 hours)
      setInterval(async () => {
        await authService.cleanupExpiredRememberTokens();
      }, 24 * 60 * 60 * 1000);

      console.log("[情報] 初期化が完了しました。");
    } catch (error) {
      console.error("[致命的エラー] サーバーの初期化に失敗しました:", error);
      throw error;
    }
  }

  setupExpress() {
    // System middleware (maintenance mode, etc.)
    this.app.use(checkMaintenanceMode);

    // Cookie parser (must be before session middleware)
    this.app.use(cookieParser(process.env.SESSION_SECRET || 'default-secret-key'));

    // Session configuration
    this.app.use(session(authService.createSessionConfig()));

    // Passport initialization
    this.app.use(passport.initialize());
    this.app.use(passport.session());

    // Remember token middleware (check after passport session)
    this.app.use(authService.checkRememberToken.bind(authService));

    // Body parsing middleware
    this.app.use(express.json({ limit: "5mb" }));
    this.app.use(express.urlencoded({ extended: true }));

    // Apply invitation requirement check
    this.app.use(checkInvitationRequirement);

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
      const emailService = require('./services/email');
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: envConfig.isProduction ? 'production' : 'development',
        sessionSecure: envConfig.isProduction,
        hostname: req.hostname,
        adminDomain: process.env.ADMIN_DOMAIN,
        emailConfigured: emailService.isInitialized(),
        gmailConfigured: emailService.isInitialized()
      });
    });

    // Main page
    this.app.get("/", async (req, res) => {
      try {
        // Check if owner setup is completed
        const isOwnerSetupCompleted = await systemSettingsService.isOwnerSetupCompleted();
        
        if (!isOwnerSetupCompleted) {
          // If no owner exists, redirect to owner setup
          return res.redirect("/owner-setup");
        }
        
        // Otherwise, show the main index page
        res.render("index");
      } catch (error) {
        console.error("[エラー] メインページの表示に失敗:", error);
        res.render("index"); // Fallback to index if error occurs
      }
    });

    // Status page
    this.app.get("/status", (req, res) => {
      const emailService = require("./services/email");
      res.json({
        status: "AI Management System - Status",
        authentication: {
          type: "Email-based authentication",
          status: "[OK] Working correctly",
          message: "Email authentication system is active"
        },
        routes: {
          auth_login: "[OK] /auth/login",
          auth_register: "[OK] /auth/register", 
          auth_logout: "[OK] /auth/logout",
          auth_user: "[OK] /auth/user",
          verify_email: "[OK] /auth/verify-email",
          reset_password: "[OK] /auth/reset-password",
          health: "[OK] /api/health"
        },
        services: {
          email: emailService.isInitialized() ? "[OK] Gmail SMTP Server Connected" : "[ERROR] Gmail not configured",
          gmail: emailService.isInitialized() ? "[OK] Ready for sending" : "[ERROR] Check GMAIL_USER and GMAIL_APP_PASSWORD"
        },
        timestamp: new Date().toISOString()
      });
    });

    // API routes
    this.app.use("/auth", authRoutes);
    this.app.use("/api/ais", aiRoutes);
    this.app.use("/api/settings", settingsRoutes);
    this.app.use("/api", userRoutes);
    this.app.use("/api/roles", roleManagementRoutes);
    this.app.use("/api/system-settings", systemSettingsRoutes);
    this.app.use("/owner-setup", ownerSetupRoutes);

    // Debug endpoint for Gmail status (development only)
    this.app.get("/api/debug/gmail", (req, res) => {
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: 'Not available in production' });
      }
      
      const emailService = require("./services/email");
      res.json({
        initialized: emailService.isInitialized(),
        gmailUser: process.env.GMAIL_USER || 'Not configured',
        appPasswordConfigured: !!process.env.GMAIL_APP_PASSWORD,
        message: emailService.isInitialized() ? 'Gmail SMTP ready' : 'Gmail SMTP not configured'
      });
    });

    // Test endpoint for sending emails (development only)
    this.app.post("/api/debug/send-test-email", async (req, res) => {
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: 'Not available in production' });
      }
      
      const emailService = require("./services/email");
      if (!emailService.isInitialized()) {
        return res.status(503).json({ error: 'Gmail service not initialized' });
      }

      try {
        const { type = 'verification', email = 'test@example.com', username = 'TestUser' } = req.body;
        
        if (type === 'verification') {
          await emailService.sendVerificationEmail(email, username, 'test-token-' + Date.now());
        } else if (type === 'reset') {
          await emailService.sendPasswordResetEmail(email, username, 'reset-token-' + Date.now());
        } else {
          return res.status(400).json({ error: 'Invalid email type. Use "verification" or "reset"' });
        }

        res.json({
          success: true,
          message: `${type} email sent successfully via Gmail`,
          gmailUser: process.env.GMAIL_USER,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('[ERROR] Test email sending failed:', error);
        res.status(500).json({ error: error.message });
      }
    });
  }

  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      console.log(`[404] Route not found: ${req.method} ${req.originalUrl}`);
      console.log(`[404] Available routes: /auth/*, /api/*, /`);

      // Check if this is an API request (JSON expected)
      if (req.originalUrl.startsWith('/api/') || req.headers.accept?.includes('application/json')) {
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
      } else {
        // For web requests, render the 404 page
        res.status(404).render("404", {
          requestedPath: req.originalUrl
        });
      }
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
        // For Codespaces, don't append port as it's handled by the forwarding infrastructure
        const portSuffix = envConfig.isCodespace ? '' : (envConfig.port !== 80 && envConfig.port !== 443 ? ':' + envConfig.actualPort : '');
        console.log(`[情報] 外部アクセスURL: ${envConfig.protocol}://${envConfig.domain}${portSuffix}`);
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