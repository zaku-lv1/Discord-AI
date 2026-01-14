// =================================================================================
// Discord AI Bot - Simplified Server (IP-Allowlisted Dashboard)
// =================================================================================
const dotenv = require("dotenv");
const express = require("express");
const path = require("path");

// Load environment variables
dotenv.config();

// Services
const firebaseService = require("./services/firebase");
const DiscordBot = require("./bot/discord-bot");

// Middleware
const { createIPAllowlist } = require("./middleware/ip-allowlist");

// Routes
const settingsRoutes = require("./routes/settings");

class Server {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 8080;
    this.bot = null;
  }

  async initialize() {
    try {
      // Initialize services
      console.log("[INFO] Initializing services...");
      await firebaseService.initialize();

      // Setup Express app
      this.setupExpress();
      this.setupRoutes();
      this.setupErrorHandling();

      // Initialize Discord bot
      if (process.env.DISCORD_TOKEN && process.env.DISCORD_TOKEN !== 'test_token') {
        this.bot = new DiscordBot(firebaseService);
        await this.bot.start();
      }

      console.log("[INFO] Initialization complete.");
    } catch (error) {
      console.error("[FATAL ERROR] Server initialization failed:", error);
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
    // Create IP allowlist middleware
    const ipAllowlist = createIPAllowlist();

    // Health check endpoint
    this.app.get('/api/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        discord: this.bot ? 'connected' : 'not configured',
        firebase: firebaseService.initialized ? 'connected' : 'not initialized'
      });
    });

    // Main page - redirect to dashboard
    this.app.get("/", (req, res) => {
      res.redirect("/dashboard");
    });

    // Dashboard - IP allowlisted
    this.app.get("/dashboard", ipAllowlist, (req, res) => {
      res.render("dashboard");
    });

    // API routes - IP allowlisted
    this.app.use("/api/settings", ipAllowlist, settingsRoutes);
  }

  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      console.log(`[404] Route not found: ${req.method} ${req.originalUrl}`);

      // Check if this is an API request (JSON expected)
      if (req.originalUrl.startsWith('/api/') || req.headers.accept?.includes('application/json')) {
        res.status(404).json({ 
          message: "Not Found",
          requestedPath: req.originalUrl
        });
      } else {
        // For web requests, send simple 404 text
        res.status(404).send("404 - Page Not Found");
      }
    });

    // Error handler
    this.app.use((err, req, res, next) => {
      console.error('Unhandled error:', err);
      
      // Don't leak error details in production
      const isDevelopment = process.env.NODE_ENV !== 'production';
      
      res.status(500).json({
        message: 'Server error occurred',
        ...(isDevelopment && { error: err.message, stack: err.stack })
      });
    });
  }

  start() {
    // Bind to all interfaces for external access
    const host = '0.0.0.0';
    
    this.app.listen(this.port, host, () => {
      console.log(`[INFO] Web server started on ${host}:${this.port}`);
      console.log(`[INFO] Dashboard: http://localhost:${this.port}/dashboard`);
      
      const allowedIPs = process.env.ADMIN_ALLOWED_IPS || 'NOT_CONFIGURED';
      console.log(`[INFO] IP Allowlist: ${allowedIPs}`);
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
    console.error("[FATAL ERROR] Server startup failed:", error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[FATAL ERROR] Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[ERROR] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the server
if (require.main === module) {
  main();
}

module.exports = Server;