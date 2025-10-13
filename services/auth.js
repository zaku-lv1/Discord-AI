const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const firebaseService = require("./firebase");
const emailService = require("./email");
const roleService = require("./roles");

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

  // Generate secure remember token
  generateRememberToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Create remember token for user
  async createRememberToken(userId, deviceInfo = null) {
    const db = firebaseService.getDB();
    const token = this.generateRememberToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const tokenDoc = {
      token: token,
      userId: userId,
      createdAt: firebaseService.getServerTimestamp(),
      expiresAt: expiresAt,
      deviceInfo: deviceInfo,
      lastUsed: firebaseService.getServerTimestamp()
    };

    await db.collection('remember_tokens').doc(token).set(tokenDoc);
    
    // Also store in user document for easier cleanup
    const userRef = db.collection('users').doc(userId);
    await userRef.update({
      lastRememberToken: token,
      lastRememberTokenCreated: firebaseService.getServerTimestamp()
    });

    return token;
  }

  // Validate and use remember token
  async validateRememberToken(token) {
    const db = firebaseService.getDB();
    
    try {
      const tokenDoc = await db.collection('remember_tokens').doc(token).get();
      
      if (!tokenDoc.exists) {
        return null;
      }

      const tokenData = tokenDoc.data();
      
      // Check if token is expired
      if (tokenData.expiresAt && tokenData.expiresAt.toDate() < new Date()) {
        // Delete expired token
        await this.deleteRememberToken(token);
        return null;
      }

      // Update last used timestamp
      await tokenDoc.ref.update({
        lastUsed: firebaseService.getServerTimestamp()
      });

      // Get user data
      const userDoc = await db.collection('users').doc(tokenData.userId).get();
      if (!userDoc.exists) {
        // User doesn't exist, delete token
        await this.deleteRememberToken(token);
        return null;
      }

      const userData = userDoc.data();
      
      // Return user without password
      const { password: _, verificationToken: __, ...userWithoutPassword } = userData;
      return userWithoutPassword;
      
    } catch (error) {
      console.error('[ERROR] Remember token validation failed:', error);
      return null;
    }
  }

  // Delete remember token
  async deleteRememberToken(token) {
    const db = firebaseService.getDB();
    
    try {
      await db.collection('remember_tokens').doc(token).delete();
    } catch (error) {
      console.error('[ERROR] Failed to delete remember token:', error);
    }
  }

  // Clean up expired remember tokens
  async cleanupExpiredRememberTokens() {
    const db = firebaseService.getDB();
    
    try {
      const expiredTokens = await db.collection('remember_tokens')
        .where('expiresAt', '<', new Date())
        .get();

      const batch = db.batch();
      expiredTokens.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      if (!expiredTokens.empty) {
        await batch.commit();
        console.log(`[情報] ${expiredTokens.size}個の期限切れ記憶トークンを削除しました`);
      }
    } catch (error) {
      console.error('[ERROR] Failed to cleanup expired remember tokens:', error);
    }
  }

  async createLocalUser(username, password, email = null, skipEmailVerification = false, invitationCode = null) {
    const db = firebaseService.getDB();
    
    // Email is now optional - generate a dummy email if not provided
    if (!email) {
      email = `${username}@local.system`;
    }

    // Format handle (@username)
    const handle = roleService.formatHandle(username);
    const plainUsername = roleService.extractUsername(handle);
    
    // Check if handle already exists
    const existingHandleUser = await db.collection('users').where('handle', '==', handle).get();
    if (!existingHandleUser.empty) {
      throw new Error('このハンドルは既に使用されています');
    }

    // Check if username already exists (legacy compatibility)
    const existingUser = await db.collection('users').where('username', '==', plainUsername).get();
    if (!existingUser.empty) {
      throw new Error('ユーザー名が既に使用されています');
    }

    const hashedPassword = await this.hashPassword(password);
    const userId = Date.now().toString(); // Simple ID generation
    
    // Check if this is the first user (should be admin - Synapse-Note style)
    const usersCount = await db.collection('users').get();
    let isAdmin = false; // Default is regular user
    
    if (usersCount.empty) {
      // First user becomes admin (like Synapse-Note)
      isAdmin = true;
    } else {
      // For subsequent users, check if registration is allowed (Synapse-Note style)
      const systemSettingsService = require('./system-settings');
      const allowRegistration = await systemSettingsService.allowRegistration();
      
      if (!allowRegistration) {
        throw new Error('現在、新規ユーザーの登録を受け付けておりません。');
      }
      
      // Check invitation code for role assignment
      if (invitationCode) {
        try {
          const inviteDoc = await db.collection("invitation_codes").doc(invitationCode).get();
          if (inviteDoc.exists) {
            const inviteData = inviteDoc.data();
            if (!inviteData.used && inviteData.expiresAt && inviteData.expiresAt.toDate() > new Date()) {
              // Apply role from invitation code
              const targetRole = inviteData.targetRole;
              isAdmin = (targetRole === 'admin' || targetRole === 'owner');
              console.log(`[情報] 招待コード ${invitationCode} により、ユーザーは ${targetRole} として登録されます`);
            }
          }
        } catch (error) {
          console.error('[警告] 招待コードの確認に失敗:', error);
          // Continue with default user role
        }
      }
      
      // If no valid invitation code, user becomes regular user by default
      // (Admin can upgrade them later if needed)
    }
    
    // テスト環境またはメールサービスが無効な場合は認証をスキップ
    // Since email is optional now, always skip email verification
    const shouldSkipVerification = true;
    
    const userDoc = {
      id: userId,
      username: plainUsername,
      handle: handle,
      email: email,
      password: hashedPassword,
      type: 'email',
      isAdmin: isAdmin, // Synapse-Note style admin flag
      role: isAdmin ? 'admin' : 'user', // For backward compatibility
      displayName: plainUsername, // Default display name is username
      verified: true, // Always verified since email is optional
      verificationToken: null,
      verificationTokenExpires: null,
      createdAt: firebaseService.getServerTimestamp(),
      lastLogin: firebaseService.getServerTimestamp()
    };

    await db.collection('users').doc(userId).set(userDoc);

    // Mark invitation code as used if provided and valid
    if (invitationCode) {
      try {
        await db.collection("invitation_codes").doc(invitationCode).update({
          used: true,
          usedBy: email,
          usedByDiscordId: null, // Will be set when Discord account is linked
          usedAt: firebaseService.getServerTimestamp()
        });
        console.log(`[情報] 招待コード ${invitationCode} が使用されました: ${email}`);
      } catch (error) {
        console.error('[警告] 招待コードの使用済みマークに失敗:', error);
        // Don't throw error here as user creation was successful
      }
    }
    
    // Return user without password and sensitive fields
    const { password: _, verificationToken: __, ...userWithoutPassword } = userDoc;
    return userWithoutPassword;
  }

  async findLocalUser(emailOrHandle) {
    const db = firebaseService.getDB();
    
    // ハンドル形式で検索（@username）
    if (emailOrHandle.startsWith('@')) {
      const userQuery = await db.collection('users').where('handle', '==', emailOrHandle).get();
      if (!userQuery.empty) {
        return userQuery.docs[0].data();
      }
    }
    
    // プレーンユーザー名での検索 - ハンドル形式に変換して検索
    // Plain username search - convert to handle format and search
    const handle = emailOrHandle.startsWith('@') ? emailOrHandle : '@' + emailOrHandle;
    const userQuery = await db.collection('users').where('handle', '==', handle).get();
    if (!userQuery.empty) {
      return userQuery.docs[0].data();
    }
    
    // レガシー互換性: プレーンユーザー名での直接検索も試行
    // Legacy compatibility: also try direct plain username search
    const legacyQuery = await db.collection('users').where('username', '==', emailOrHandle).get();
    if (!legacyQuery.empty) {
      return legacyQuery.docs[0].data();
    }
    
    return null;
  }

  async updateLocalUserLastLogin(userId) {
    const db = firebaseService.getDB();
    await db.collection('users').doc(userId).update({
      lastLogin: firebaseService.getServerTimestamp()
    });
  }

  async verifyEmail(token) {
    const db = firebaseService.getDB();
    
    // トークンでユーザーを検索
    const userQuery = await db.collection('users')
      .where('verificationToken', '==', token)
      .where('verified', '==', false)
      .get();
    
    if (userQuery.empty) {
      throw new Error('無効または期限切れの認証トークンです');
    }
    
    const userDoc = userQuery.docs[0];
    const userData = userDoc.data();
    
    // トークンの有効期限をチェック
    if (userData.verificationTokenExpires) {
      const expiryDate = userData.verificationTokenExpires.toDate ? 
        userData.verificationTokenExpires.toDate() : 
        userData.verificationTokenExpires;
      
      if (expiryDate < new Date()) {
        throw new Error('認証トークンの有効期限が切れています');
      }
    }
    
    // ユーザーを認証済みに更新
    await userDoc.ref.update({
      verified: true,
      verificationToken: null,
      verificationTokenExpires: null,
      lastLogin: firebaseService.getServerTimestamp()
    });
    
    // 認証済みユーザー情報を返す
    const { password: _, verificationToken: __, ...userWithoutPassword } = {
      ...userData,
      verified: true
    };
    return userWithoutPassword;
  }

  async requestPasswordReset(email) {
    const db = firebaseService.getDB();
    
    // メールアドレスでユーザーを検索
    const userQuery = await db.collection('users').where('email', '==', email).get();
    
    if (userQuery.empty) {
      // セキュリティ上、ユーザーが存在しない場合でも成功のレスポンスを返す
      return { success: true, message: '認証済みの場合は、パスワード再設定メールを送信しました' };
    }
    
    const userDoc = userQuery.docs[0];
    const userData = userDoc.data();
    
    // 認証済みユーザーのみパスワード再設定可能
    if (!userData.verified) {
      return { success: true, message: '認証済みの場合は、パスワード再設定メールを送信しました' };
    }
    
    const resetToken = emailService.generatePasswordResetToken();
    const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1時間
    
    // パスワード再設定トークンを保存
    await userDoc.ref.update({
      passwordResetToken: resetToken,
      passwordResetTokenExpires: resetTokenExpires
    });
    
    // パスワード再設定メールを送信
    if (emailService.isInitialized()) {
      try {
        await emailService.sendPasswordResetEmail(email, userData.username, resetToken);
        console.log(`[情報] パスワード再設定メールを送信しました: ${email}`);
      } catch (error) {
        console.error('[エラー] パスワード再設定メール送信に失敗:', error);
        throw new Error('メール送信に失敗しました');
      }
    } else {
      throw new Error('メールサービスが利用できません');
    }
    
    return { success: true, message: 'パスワード再設定メールを送信しました' };
  }

  async resetPassword(token, newPassword) {
    const db = firebaseService.getDB();
    
    // トークンでユーザーを検索
    const userQuery = await db.collection('users')
      .where('passwordResetToken', '==', token)
      .get();
    
    if (userQuery.empty) {
      throw new Error('無効または期限切れの再設定トークンです');
    }
    
    const userDoc = userQuery.docs[0];
    const userData = userDoc.data();
    
    // トークンの有効期限をチェック
    if (userData.passwordResetTokenExpires) {
      const expiryDate = userData.passwordResetTokenExpires.toDate ? 
        userData.passwordResetTokenExpires.toDate() : 
        userData.passwordResetTokenExpires;
      
      if (expiryDate < new Date()) {
        throw new Error('再設定トークンの有効期限が切れています');
      }
    }
    
    // 新しいパスワードをハッシュ化
    const hashedPassword = await this.hashPassword(newPassword);
    
    // パスワードを更新し、再設定トークンを削除
    await userDoc.ref.update({
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetTokenExpires: null,
      lastLogin: firebaseService.getServerTimestamp()
    });
    
    return { success: true, message: 'パスワードが正常に更新されました' };
  }

  async resendVerificationEmail(email) {
    const db = firebaseService.getDB();
    
    // メールアドレスでユーザーを検索
    const userQuery = await db.collection('users')
      .where('email', '==', email)
      .where('verified', '==', false)
      .get();
    
    if (userQuery.empty) {
      throw new Error('認証待ちのアカウントが見つかりません');
    }
    
    const userDoc = userQuery.docs[0];
    const userData = userDoc.data();
    
    // 新しい認証トークンを生成
    const newVerificationToken = emailService.generateVerificationToken();
    const newTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24時間
    
    // トークンを更新
    await userDoc.ref.update({
      verificationToken: newVerificationToken,
      verificationTokenExpires: newTokenExpires
    });
    
    // 認証メールを再送信
    if (emailService.isInitialized()) {
      try {
        await emailService.sendVerificationEmail(email, userData.username, newVerificationToken);
        console.log(`[情報] 認証メールを再送信しました: ${email}`);
      } catch (error) {
        console.error('[エラー] 認証メール再送信に失敗:', error);
        throw new Error('メール送信に失敗しました');
      }
    } else {
      throw new Error('メールサービスが利用できません');
    }
    
    return { success: true, message: '認証メールを再送信しました' };
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

  async initialize() {
    try {
      // Email service is no longer required
      // Skip email service initialization
      console.log('[情報] メールサービスの初期化をスキップします（メールアドレス不要）');

      // Setup Local Authentication Strategy
      passport.use(new LocalStrategy({
        usernameField: 'username',
        passwordField: 'password'
      }, async (emailOrHandle, password, done) => {
        try {
          const user = await this.findLocalUser(emailOrHandle);
          if (!user) {
            return done(null, false, { message: 'ユーザー名またはパスワードが正しくありません' });
          }

          const isValidPassword = await this.comparePassword(password, user.password);
          if (!isValidPassword) {
            return done(null, false, { message: 'ユーザー名またはパスワードが正しくありません' });
          }

          // Email verification is no longer required - skip this check

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

      this.configured = true;

      passport.serializeUser((user, done) => {
        // Store user ID and type for session management
        done(null, { id: user.id, type: user.type || 'email' });
      });

      passport.deserializeUser(async (sessionData, done) => {
        try {
          const db = firebaseService.getDB();
          
          // All users are now stored in the 'users' collection
          const userDoc = await db.collection('users').doc(sessionData.id).get();
          if (userDoc.exists) {
            const userData = userDoc.data();
            const { password: _, verificationToken: __, passwordResetToken: ___, ...userWithoutPassword } = userData;
            done(null, userWithoutPassword);
          } else {
            done(null, false);
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
    const { isProduction, isCodespace, isLocalhost } = this.getEnvironmentConfig();
    
    // Determine if we should require secure cookies
    // For testing purposes, if NODE_ENV is not production, allow insecure cookies
    const requireSecure = (isProduction || isCodespace) && process.env.NODE_ENV === 'production';
    
    return {
      secret: process.env.SESSION_SECRET || 'default-secret-key',
      resave: false,
      saveUninitialized: false,
      cookie: { 
        secure: requireSecure, // Only require secure cookies in actual production
        httpOnly: true, // Prevent XSS attacks
        maxAge: 24 * 60 * 60 * 1000, // 24時間 (session cookie)
        sameSite: requireSecure ? 'none' : 'lax' // Cross-site compatibility for production/Codespace
      }
    };
  }

  // Create remember token cookie configuration
  createRememberTokenCookieConfig() {
    const { isProduction, isCodespace } = this.getEnvironmentConfig();
    const requireSecure = (isProduction || isCodespace) && process.env.NODE_ENV === 'production';
    
    return {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      secure: requireSecure,
      sameSite: requireSecure ? 'none' : 'lax',
      signed: true // Use signed cookies for remember tokens
    };
  }

  // Middleware to check remember token if session is not authenticated
  async checkRememberToken(req, res, next) {
    try {
      // If user is already authenticated via session, continue
      if (req.isAuthenticated && req.isAuthenticated()) {
        return next();
      }

      // Check for remember token in signed cookies
      const rememberToken = req.signedCookies['remember_token'];
      if (!rememberToken) {
        return next();
      }

      // Validate remember token
      const user = await this.validateRememberToken(rememberToken);
      if (!user) {
        // Invalid token, clear the cookie
        res.clearCookie('remember_token');
        return next();
      }

      // Log the user in via the session
      req.logIn(user, (err) => {
        if (err) {
          console.error('[ERROR] Failed to login user via remember token:', err);
          res.clearCookie('remember_token');
          return next();
        }
        
        console.log(`[INFO] User logged in via remember token: ${user.username}`);
        next();
      });

    } catch (error) {
      console.error('[ERROR] Remember token check failed:', error);
      res.clearCookie('remember_token');
      next();
    }
  }
}

module.exports = new AuthService();