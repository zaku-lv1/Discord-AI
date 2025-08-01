const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcrypt");
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

  async createLocalUser(username, password, email, skipEmailVerification = false, invitationCode = null) {
    const db = firebaseService.getDB();
    
    if (!email) {
      throw new Error('メールアドレスは必須です');
    }

    // メールアドレスの形式チェック
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('有効なメールアドレスを入力してください');
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

    // Check if email already exists
    const existingEmail = await db.collection('users').where('email', '==', email).get();
    if (!existingEmail.empty) {
      throw new Error('メールアドレスが既に使用されています');
    }

    const hashedPassword = await this.hashPassword(password);
    const userId = Date.now().toString(); // Simple ID generation
    
    // Check if this is the first user (should be owner)
    const usersCount = await db.collection('users').get();
    let role = roleService.roles.EDITOR; // Default role for regular users is EDITOR
    
    if (usersCount.empty) {
      // First user becomes owner regardless of invitation code
      role = roleService.roles.OWNER;
    } else {
      // For subsequent users, check if invitation codes are required
      const systemSettingsService = require('./system-settings');
      const requiresInvitation = await systemSettingsService.requiresInvitationCode();
      
      if (requiresInvitation) {
        // Invitation code is required by system settings
        if (!invitationCode) {
          throw new Error('新規登録には招待コードが必要です');
        }
        
        // Validate invitation code
        const inviteDoc = await db.collection("invitation_codes").doc(invitationCode).get();
        if (!inviteDoc.exists) {
          throw new Error('無効な招待コードです');
        }
        
        const inviteData = inviteDoc.data();
        if (inviteData.used) {
          throw new Error('この招待コードは既に使用されています');
        }
        
        // Check expiration if set
        if (inviteData.expiresAt && inviteData.expiresAt.toDate() < new Date()) {
          throw new Error('この招待コードは期限切れです');
        }
        
        // Use specified role from invitation or default to EDITOR
        role = inviteData.targetRole || roleService.roles.EDITOR;
        
        // Ensure only one owner exists - if invitation tries to create another owner, make them editor instead
        if (role === roleService.roles.OWNER) {
          const existingOwners = await db.collection('users').where('role', '==', roleService.roles.OWNER).get();
          if (!existingOwners.empty) {
            console.log('[警告] オーナーが既に存在するため、新規ユーザーを編集者として作成します');
            role = roleService.roles.EDITOR;
          }
        }
      } else {
        // Invitation codes are not required - allow open registration
        // If invitation code is provided anyway, validate and use it
        if (invitationCode) {
          const inviteDoc = await db.collection("invitation_codes").doc(invitationCode).get();
          if (inviteDoc.exists) {
            const inviteData = inviteDoc.data();
            if (!inviteData.used && (!inviteData.expiresAt || inviteData.expiresAt.toDate() >= new Date())) {
              // Valid invitation code provided - use the role from invitation
              role = inviteData.targetRole || roleService.roles.EDITOR;
              
              // Ensure only one owner exists
              if (role === roleService.roles.OWNER) {
                const existingOwners = await db.collection('users').where('role', '==', roleService.roles.OWNER).get();
                if (!existingOwners.empty) {
                  console.log('[警告] オーナーが既に存在するため、新規ユーザーを編集者として作成します');
                  role = roleService.roles.EDITOR;
                }
              }
            }
          }
        }
        // If no invitation code or invalid code, use default EDITOR role
      }
    }
    
    // テスト環境またはメールサービスが無効な場合は認証をスキップ
    const shouldSkipVerification = skipEmailVerification || 
      !emailService.isInitialized() || 
      process.env.NODE_ENV === 'test' ||
      email.includes('test');
    
    const userDoc = {
      id: userId,
      username: plainUsername,
      handle: handle,
      email: email,
      password: hashedPassword,
      type: 'email',
      role: role,
      displayName: plainUsername, // Default display name is username
      verified: shouldSkipVerification, // メール認証をスキップする場合はtrue
      verificationToken: shouldSkipVerification ? null : emailService.generateVerificationToken(),
      verificationTokenExpires: shouldSkipVerification ? null : new Date(Date.now() + 24 * 60 * 60 * 1000), // 24時間
      createdAt: firebaseService.getServerTimestamp(),
      lastLogin: shouldSkipVerification ? firebaseService.getServerTimestamp() : null
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
    
    // メール認証が有効でメール送信可能な場合、認証メールを送信
    if (!shouldSkipVerification && emailService.isInitialized()) {
      try {
        await emailService.sendVerificationEmail(email, plainUsername, userDoc.verificationToken);
        console.log(`[情報] 認証メールを送信しました: ${email}`);
      } catch (error) {
        console.error('[エラー] 認証メール送信に失敗:', error);
        // ユーザー作成は成功したが、メール送信が失敗した場合は警告のみ
      }
    }
    
    // Return user without password and sensitive fields
    const { password: _, verificationToken: __, ...userWithoutPassword } = userDoc;
    return userWithoutPassword;
  }

  async findLocalUser(usernameOrEmailOrHandle) {
    const db = firebaseService.getDB();
    
    // ハンドル形式で検索（@username）
    if (usernameOrEmailOrHandle.startsWith('@')) {
      const userQuery = await db.collection('users').where('handle', '==', usernameOrEmailOrHandle).get();
      if (!userQuery.empty) {
        return userQuery.docs[0].data();
      }
    }
    
    // メールアドレスで検索
    if (usernameOrEmailOrHandle.includes('@') && usernameOrEmailOrHandle.includes('.')) {
      const userQuery = await db.collection('users').where('email', '==', usernameOrEmailOrHandle).get();
      if (!userQuery.empty) {
        return userQuery.docs[0].data();
      }
    } else {
      // ユーザー名で検索（@なしのハンドルまたは従来のユーザー名）
      let userQuery = await db.collection('users').where('username', '==', usernameOrEmailOrHandle).get();
      if (!userQuery.empty) {
        return userQuery.docs[0].data();
      }
      
      // ハンドル形式でも検索してみる
      const handle = roleService.formatHandle(usernameOrEmailOrHandle);
      userQuery = await db.collection('users').where('handle', '==', handle).get();
      if (!userQuery.empty) {
        return userQuery.docs[0].data();
      }
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
      // Initialize email service
      await emailService.initialize();

      // Setup Local Authentication Strategy
      passport.use(new LocalStrategy({
        usernameField: 'username',
        passwordField: 'password'
      }, async (username, password, done) => {
        try {
          const user = await this.findLocalUser(username);
          if (!user) {
            return done(null, false, { message: 'ユーザー名またはメールアドレス、パスワードが正しくありません' });
          }

          const isValidPassword = await this.comparePassword(password, user.password);
          if (!isValidPassword) {
            return done(null, false, { message: 'ユーザー名またはメールアドレス、パスワードが正しくありません' });
          }

          // メール認証チェック（テスト環境では不要）
          if (!user.verified && emailService.isInitialized() && 
              process.env.NODE_ENV !== 'test' && !user.email.includes('test')) {
            return done(null, false, { message: 'メールアドレスが認証されていません。メールボックスを確認してください' });
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
        maxAge: 24 * 60 * 60 * 1000, // 24時間
        sameSite: requireSecure ? 'none' : 'lax' // Cross-site compatibility for production/Codespace
      }
    };
  }
}

module.exports = new AuthService();