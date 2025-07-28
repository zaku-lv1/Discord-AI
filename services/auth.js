const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;
const firebaseService = require("./firebase");

class AuthService {
  constructor() {
    this.configured = false;
  }

  getEnvironmentConfig() {
    const domain = process.env.ADMIN_DOMAIN || 'localhost';
    const actualPort = process.env.PORT || 8080;
    
    // Detect environment type
    const isLocalhost = domain.includes('localhost');
    const isCodespace = domain.includes('.app.github.dev');
    const isProduction = process.env.NODE_ENV === 'production' || (!isLocalhost && !isCodespace);
    
    // Protocol detection
    let protocol = 'http';
    if (isProduction || isCodespace) {
      protocol = 'https';
    }
    
    // Port handling for URL construction
    let urlPort = actualPort;
    if (isCodespace) {
      // GitHub Codespace: Extract port from domain or use actual port
      const portMatch = domain.match(/-(\d+)\.app\.github\.dev/);
      urlPort = portMatch ? parseInt(portMatch[1]) : actualPort;
    } else if (isProduction) {
      urlPort = protocol === 'https' ? 443 : 80;
    }

    return { 
      isProduction: isProduction || isCodespace, 
      protocol, 
      port: urlPort, 
      actualPort,
      domain, 
      isCodespace,
      isLocalhost 
    };
  }

  getCallbackURL() {
    const { protocol, port, domain, isCodespace, actualPort } = this.getEnvironmentConfig();
    
    // If explicit callback URL is provided, use it
    if (process.env.DISCORD_CALLBACK_URL) {
      return process.env.DISCORD_CALLBACK_URL;
    }
    
    // For GitHub Codespace, use the extracted port from domain
    if (isCodespace) {
      return `${protocol}://${domain}/auth/discord/callback`;
    }
    
    // For production with standard ports, don't include port in URL
    if (port === 80 || port === 443) {
      return `${protocol}://${domain}/auth/discord/callback`;
    }
    
    // For development with custom ports
    return `${protocol}://${domain}:${port}/auth/discord/callback`;
  }

  validateDiscordConfig() {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      throw new Error('DISCORD_CLIENT_ID と DISCORD_CLIENT_SECRET が設定されていません。');
    }
    
    // Discord Client IDは数値のsnowflake IDである必要があります
    if (!/^\d{17,19}$/.test(clientId)) {
      throw new Error(
        `DISCORD_CLIENT_ID が無効です: "${clientId}"\n` +
        'Discord Client IDは17-19桁の数値である必要があります。\n' +
        'Discord Developer Portal (https://discord.com/developers/applications) で正しいClient IDを確認してください。'
      );
    }
    
    return { clientId, clientSecret };
  }

  async initialize() {
    try {
      const { clientId, clientSecret } = this.validateDiscordConfig();
      
      console.log(`[情報] Discord Client ID検証完了: ${clientId}`);
      const { isProduction, isCodespace, isLocalhost, protocol, domain, actualPort } = this.getEnvironmentConfig();
      
      const envType = isCodespace ? 'GitHub Codespace' : (isProduction ? 'Production' : 'Development');
      console.log(`[情報] 認証環境: ${envType}`);
      console.log(`[情報] 検出されたドメイン: ${domain}`);
      console.log(`[情報] プロトコル: ${protocol}, ポート: ${actualPort}`);
      console.log(`[情報] Discord OAuth Callback URL: ${this.getCallbackURL()}`);

      // Setup Passport Discord strategy
      passport.use(new DiscordStrategy({
        clientID: clientId,
        clientSecret: clientSecret,
        callbackURL: this.getCallbackURL(),
        scope: ['identify', 'email', 'guilds']
      }, async (accessToken, refreshToken, profile, done) => {
        try {
          const db = firebaseService.getDB();
          const userRef = db.collection('discord_users').doc(profile.id);
          await userRef.set({
            id: profile.id,
            username: profile.username,
            discriminator: profile.discriminator,
            email: profile.email,
            avatar: profile.avatar,
            accessToken: accessToken,
            refreshToken: refreshToken,
            lastLogin: firebaseService.getServerTimestamp()
          }, { merge: true });

          return done(null, profile);
        } catch (error) {
          console.error('Discord OAuth エラー:', error);
          return done(error, null);
        }
      }));

      passport.serializeUser((user, done) => {
        done(null, user.id);
      });

      passport.deserializeUser(async (id, done) => {
        try {
          const db = firebaseService.getDB();
          const userDoc = await db.collection('discord_users').doc(id).get();
          if (userDoc.exists) {
            done(null, userDoc.data());
          } else {
            done(null, false);
          }
        } catch (error) {
          done(error, null);
        }
      });

      this.configured = true;
    } catch (error) {
      console.error(`[致命的エラー] Discord OAuth設定が無効です: ${error.message}`);
      console.log('[情報] Discord OAuth機能を無効にして続行します。');
      
      // Setup mock passport for testing
      passport.serializeUser((user, done) => done(null, user));
      passport.deserializeUser((user, done) => done(null, user));
      this.configured = false;
    }
  }

  isConfigured() {
    return this.configured;
  }

  createSessionConfig() {
    const { isProduction, isCodespace } = this.getEnvironmentConfig();
    
    // For Codespace and production, we need secure cookies
    const requireSecure = isProduction || isCodespace;
    
    return {
      secret: process.env.SESSION_SECRET || 'default-secret-key',
      resave: false,
      saveUninitialized: false,
      cookie: { 
        secure: requireSecure, // HTTPS required in production and Codespace
        httpOnly: true, // Prevent XSS attacks
        maxAge: 24 * 60 * 60 * 1000, // 24時間
        sameSite: requireSecure ? 'none' : 'lax' // Cross-site compatibility for production/Codespace
      }
    };
  }

  getOAuthConfig() {
    const { isProduction, domain, protocol } = this.getEnvironmentConfig();
    const isDiscordConfigured = this.isConfigured();
    
    return {
      clientId: isDiscordConfigured ? process.env.DISCORD_CLIENT_ID : null,
      redirectUri: isDiscordConfigured ? this.getCallbackURL() : null,
      isProduction,
      domain,
      protocol,
      configured: isDiscordConfigured,
      error: isDiscordConfigured ? null : 'Discord Client IDが正しく設定されていません'
    };
  }
}

module.exports = new AuthService();