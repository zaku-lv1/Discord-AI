const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;
const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcrypt");
const firebaseService = require("./firebase");

class AuthService {
  constructor() {
    this.configured = false;
  }

  async hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  async comparePassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  }

  async createLocalUser(username, password, email) {
    const db = firebaseService.getDB();
    
    // Check if username already exists
    const existingUser = await db.collection('local_users').where('username', '==', username).get();
    if (!existingUser.empty) {
      throw new Error('ユーザー名が既に使用されています');
    }

    // Check if email already exists
    if (email) {
      const existingEmail = await db.collection('local_users').where('email', '==', email).get();
      if (!existingEmail.empty) {
        throw new Error('メールアドレスが既に使用されています');
      }
    }

    const hashedPassword = await this.hashPassword(password);
    const userId = Date.now().toString(); // Simple ID generation
    
    const userDoc = {
      id: userId,
      username: username,
      email: email || null,
      password: hashedPassword,
      type: 'local',
      createdAt: firebaseService.getServerTimestamp(),
      lastLogin: firebaseService.getServerTimestamp()
    };

    await db.collection('local_users').doc(userId).set(userDoc);
    
    // Return user without password
    const { password: _, ...userWithoutPassword } = userDoc;
    return userWithoutPassword;
  }

  async findLocalUser(username) {
    const db = firebaseService.getDB();
    const userQuery = await db.collection('local_users').where('username', '==', username).get();
    
    if (userQuery.empty) {
      return null;
    }
    
    return userQuery.docs[0].data();
  }

  async updateLocalUserLastLogin(userId) {
    const db = firebaseService.getDB();
    await db.collection('local_users').doc(userId).update({
      lastLogin: firebaseService.getServerTimestamp()
    });
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
      // Setup Local Authentication Strategy
      passport.use(new LocalStrategy({
        usernameField: 'username',
        passwordField: 'password'
      }, async (username, password, done) => {
        try {
          const user = await this.findLocalUser(username);
          if (!user) {
            return done(null, false, { message: 'ユーザー名またはパスワードが正しくありません' });
          }

          const isValidPassword = await this.comparePassword(password, user.password);
          if (!isValidPassword) {
            return done(null, false, { message: 'ユーザー名またはパスワードが正しくありません' });
          }

          // Update last login
          await this.updateLocalUserLastLogin(user.id);

          // Return user without password
          const { password: _, ...userWithoutPassword } = user;
          return done(null, userWithoutPassword);
        } catch (error) {
          console.error('Local authentication error:', error);
          return done(error);
        }
      }));

      // Setup Discord Authentication Strategy
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
              type: 'discord',
              lastLogin: firebaseService.getServerTimestamp()
            }, { merge: true });

            return done(null, { ...profile, type: 'discord' });
          } catch (error) {
            console.error('Discord OAuth エラー:', error);
            return done(error, null);
          }
        }));

        this.configured = true;
      } catch (error) {
        console.error(`[警告] Discord OAuth設定が無効です: ${error.message}`);
        console.log('[情報] Discord OAuth機能を無効にして続行します。ローカル認証のみ利用可能です。');
        this.configured = false;
      }

      passport.serializeUser((user, done) => {
        // Store both user type and ID for session management
        done(null, { id: user.id, type: user.type || 'discord' });
      });

      passport.deserializeUser(async (sessionData, done) => {
        try {
          const db = firebaseService.getDB();
          
          if (sessionData.type === 'local') {
            const userDoc = await db.collection('local_users').doc(sessionData.id).get();
            if (userDoc.exists) {
              const userData = userDoc.data();
              const { password: _, ...userWithoutPassword } = userData;
              done(null, userWithoutPassword);
            } else {
              done(null, false);
            }
          } else {
            // Default to Discord user for backward compatibility
            const userDoc = await db.collection('discord_users').doc(sessionData.id).get();
            if (userDoc.exists) {
              done(null, userDoc.data());
            } else {
              done(null, false);
            }
          }
        } catch (error) {
          done(error, null);
        }
      });

      console.log("[情報] 認証サービスが初期化されました。");
    } catch (error) {
      console.error(`[致命的エラー] 認証の初期化に失敗しました: ${error.message}`);
      
      // Setup minimal passport for emergency
      passport.serializeUser((user, done) => done(null, user));
      passport.deserializeUser((user, done) => done(null, user));
      this.configured = false;
      throw error;
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