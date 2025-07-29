const nodemailer = require('nodemailer');
const smtpServer = require('./smtp-server');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
    this.rateLimitMap = new Map(); // メール送信レート制限
    this.statistics = {
      totalSent: 0,
      totalFailed: 0,
      recentErrors: []
    };
  }

  async initialize() {
    try {
      // 本番環境かどうかを判定
      const isProduction = process.env.NODE_ENV === 'production';
      const useExternalSMTP = process.env.SMTP_HOST && process.env.SMTP_HOST !== '127.0.0.1';

      if (isProduction && useExternalSMTP) {
        // 本番環境: 外部SMTPサーバーを使用
        await this.initializeProductionSMTP();
      } else {
        // 開発環境: 軽量SMTPサーバーを使用
        await this.initializeDevelopmentSMTP();
      }

      this.initialized = true;
      console.log('[情報] メールサービスが初期化されました。');
    } catch (error) {
      console.error('[エラー] メールサービスの初期化に失敗しました:', error.message);
      console.log('[警告] メール機能を無効にして続行します。');
      this.initialized = false;
    }
  }

  async initializeProductionSMTP() {
    console.log('[情報] 本番環境用SMTPサーバーに接続中...');
    
    // OAuth2認証（Gmail）の設定
    if (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          type: 'OAuth2',
          user: process.env.SMTP_USER,
          clientId: process.env.GMAIL_CLIENT_ID,
          clientSecret: process.env.GMAIL_CLIENT_SECRET,
          refreshToken: process.env.GMAIL_REFRESH_TOKEN,
          accessToken: process.env.GMAIL_ACCESS_TOKEN
        },
        secure: true,
        requireTLS: true
      });
      console.log('[情報] Gmail OAuth2認証でSMTPを設定しました。');
    } else {
      // 標準SMTP認証
      const smtpConfig = {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true' || parseInt(process.env.SMTP_PORT) === 465,
        requireTLS: true,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        },
        tls: {
          ciphers: 'SSLv3',
          rejectUnauthorized: true,
          minVersion: 'TLSv1.2'
        }
      };

      // SendGrid特有の設定
      if (process.env.SMTP_HOST && process.env.SMTP_HOST.includes('sendgrid')) {
        smtpConfig.auth.user = 'apikey';
        console.log('[情報] SendGrid SMTP設定を適用しました。');
      }

      this.transporter = nodemailer.createTransport(smtpConfig);
      console.log(`[情報] ${process.env.SMTP_HOST}に接続しました。`);
    }

    // 接続テスト
    await this.verifyConnection();
  }

  async initializeDevelopmentSMTP() {
    console.log('[情報] 開発環境用軽量SMTPサーバーを起動中...');
    
    // Start the lightweight SMTP server
    await smtpServer.initialize();

    // Create nodemailer transporter for the local SMTP server
    this.transporter = nodemailer.createTransport({
      host: '127.0.0.1',
      port: process.env.SMTP_PORT || 2525,
      secure: false, // true for 465, false for other ports
      ignoreTLS: true, // ignore TLS for local development
      auth: false // no authentication required for local server
    });

    console.log('[情報] 軽量SMTPメールサービスが初期化されました。');
  }

  async verifyConnection() {
    try {
      await this.transporter.verify();
      console.log('[情報] SMTP接続テストが成功しました。');
      return true;
    } catch (error) {
      console.error('[エラー] SMTP接続テストが失敗しました:', error.message);
      throw error;
    }
  }

  isInitialized() {
    return this.initialized;
  }

  async sendVerificationEmail(email, username, verificationToken) {
    if (!this.initialized) {
      throw new Error('メールサービスが初期化されていません');
    }

    // レート制限チェック
    this.checkRateLimit(email);

    // 入力検証
    this.validateEmailAddress(email);

    const verificationUrl = `${this.getBaseUrl()}/auth/verify-email?token=${verificationToken}`;
    
    const mailOptions = {
      from: process.env.SYSTEM_EMAIL || 'ai-system@localhost',
      to: email,
      subject: 'AI管理システム - メールアドレス認証',
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'X-Mailer': 'Discord-AI-System',
        'X-Auto-Response-Suppress': 'All'
      },
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">AI管理システム</h2>
          <h3>メールアドレス認証</h3>
          
          <p>こんにちは、<strong>${username}</strong>さん</p>
          
          <p>AI管理システムへのアカウント登録ありがとうございます。<br>
          アカウントを有効化するために、以下のボタンをクリックしてメールアドレスを認証してください。</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" 
               style="background-color: #3498db; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              メールアドレスを認証する
            </a>
          </div>
          
          <p>上記のボタンがクリックできない場合は、以下のURLを直接ブラウザにコピー＆ペーストしてください：</p>
          <p style="word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 3px;">
            ${verificationUrl}
          </p>
          
          <p><strong>注意：</strong>このリンクは24時間で有効期限が切れます。</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #666;">
            このメールに覚えがない場合は、このメールを無視してください。
          </p>
        </div>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      this.statistics.totalSent++;
      console.log(`[情報] 認証メールを送信しました: ${email}`);
    } catch (error) {
      this.statistics.totalFailed++;
      this.addErrorToStats(error);
      console.error(`[エラー] 認証メール送信失敗: ${email}`, error.message);
      throw error;
    }
  }

  async sendPasswordResetEmail(email, username, resetToken) {
    if (!this.initialized) {
      throw new Error('メールサービスが初期化されていません');
    }

    // レート制限チェック
    this.checkRateLimit(email);

    // 入力検証
    this.validateEmailAddress(email);

    const resetUrl = `${this.getBaseUrl()}/auth/reset-password?token=${resetToken}`;
    
    const mailOptions = {
      from: process.env.SYSTEM_EMAIL || 'ai-system@localhost',
      to: email,
      subject: 'AI管理システム - パスワード再設定',
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'X-Mailer': 'Discord-AI-System',
        'X-Auto-Response-Suppress': 'All'
      },
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">AI管理システム</h2>
          <h3>パスワード再設定</h3>
          
          <p>こんにちは、<strong>${username}</strong>さん</p>
          
          <p>パスワード再設定のリクエストを受け付けました。<br>
          以下のボタンをクリックして新しいパスワードを設定してください。</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background-color: #e74c3c; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              パスワードを再設定する
            </a>
          </div>
          
          <p>上記のボタンがクリックできない場合は、以下のURLを直接ブラウザにコピー＆ペーストしてください：</p>
          <p style="word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 3px;">
            ${resetUrl}
          </p>
          
          <p><strong>注意：</strong>このリンクは1時間で有効期限が切れます。</p>
          <p><strong>セキュリティ：</strong>パスワード再設定をリクエストしていない場合は、このメールを無視してください。</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #666;">
            このメールに覚えがない場合は、アカウントのセキュリティを確認することをお勧めします。
          </p>
        </div>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      this.statistics.totalSent++;
      console.log(`[情報] パスワード再設定メールを送信しました: ${email}`);
    } catch (error) {
      this.statistics.totalFailed++;
      this.addErrorToStats(error);
      console.error(`[エラー] パスワード再設定メール送信失敗: ${email}`, error.message);
      throw error;
    }
  }

  getBaseUrl() {
    const domain = process.env.ADMIN_DOMAIN || 'localhost';
    const port = process.env.PORT || 8080;
    
    // プロダクション環境の検出
    const isLocalhost = domain.includes('localhost');
    const isCodespace = domain.includes('.app.github.dev');
    const isProduction = process.env.NODE_ENV === 'production' || (!isLocalhost && !isCodespace);
    
    let protocol = 'http';
    if (isProduction || isCodespace) {
      protocol = 'https';
    }
    
    // ポート処理
    if (isCodespace || (protocol === 'https' && port === 443) || (protocol === 'http' && port === 80)) {
      return `${protocol}://${domain}`;
    }
    
    return `${protocol}://${domain}:${port}`;
  }

  generateVerificationToken() {
    // 安全なランダムトークンを生成
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }

  generatePasswordResetToken() {
    // 安全なランダムトークンを生成
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }

  getSMTPStatus() {
    return smtpServer.getStatus();
  }

  getRecentEmails(limit = 10) {
    return smtpServer.getRecentEmails(limit);
  }

  // セキュリティと検証メソッド
  validateEmailAddress(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!emailRegex.test(email)) {
      throw new Error('無効なメールアドレス形式です');
    }
    
    // 危険なドメインのブラックリスト
    const blacklistedDomains = [
      'tempmail.org', '10minutemail.com', 'guerrillamail.org',
      'mailinator.com', 'throwaway.email', 'temp-mail.org'
    ];
    
    const domain = email.split('@')[1].toLowerCase();
    
    if (blacklistedDomains.includes(domain)) {
      throw new Error('このメールアドレスは使用できません');
    }
    
    return true;
  }

  checkRateLimit(email) {
    const now = Date.now();
    const maxAttempts = 5; // 5通/時間
    const windowMs = 60 * 60 * 1000; // 1時間
    
    const userAttempts = this.rateLimitMap.get(email) || [];
    
    // 古い試行を削除
    const validAttempts = userAttempts.filter(
      time => now - time < windowMs
    );
    
    if (validAttempts.length >= maxAttempts) {
      throw new Error('メール送信制限に達しました。しばらくお待ちください。');
    }
    
    validAttempts.push(now);
    this.rateLimitMap.set(email, validAttempts);
    
    // 古いエントリを定期的にクリーンアップ
    this.cleanupRateLimitMap();
  }

  cleanupRateLimitMap() {
    const now = Date.now();
    const windowMs = 60 * 60 * 1000; // 1時間
    
    for (const [email, attempts] of this.rateLimitMap.entries()) {
      const validAttempts = attempts.filter(time => now - time < windowMs);
      
      if (validAttempts.length === 0) {
        this.rateLimitMap.delete(email);
      } else {
        this.rateLimitMap.set(email, validAttempts);
      }
    }
  }

  addErrorToStats(error) {
    this.statistics.recentErrors.push({
      message: error.message,
      timestamp: new Date().toISOString(),
      code: error.code || 'UNKNOWN'
    });
    
    // 最新の50件のエラーのみ保持
    if (this.statistics.recentErrors.length > 50) {
      this.statistics.recentErrors.shift();
    }
  }

  // 統計とモニタリングメソッド
  getStatistics() {
    return {
      ...this.statistics,
      successRate: this.statistics.totalSent + this.statistics.totalFailed > 0 
        ? (this.statistics.totalSent / (this.statistics.totalSent + this.statistics.totalFailed) * 100).toFixed(2)
        : 100,
      rateLimitEntries: this.rateLimitMap.size
    };
  }

  getTotalSent() {
    return this.statistics.totalSent;
  }

  getSuccessRate() {
    const total = this.statistics.totalSent + this.statistics.totalFailed;
    if (total === 0) return 100;
    return (this.statistics.totalSent / total * 100).toFixed(2);
  }

  getRecentErrors() {
    return this.statistics.recentErrors.slice(-10);
  }

  // テストメール送信
  async sendTestEmail(toEmail) {
    if (!this.initialized) {
      throw new Error('メールサービスが初期化されていません');
    }

    const mailOptions = {
      from: process.env.SYSTEM_EMAIL || 'ai-system@localhost',
      to: toEmail,
      subject: 'AI管理システム - テストメール',
      headers: {
        'X-Mailer': 'Discord-AI-System-Test',
        'X-Auto-Response-Suppress': 'All'
      },
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">AI管理システム</h2>
          <h3>テストメール</h3>
          
          <p>このメールはAI管理システムのメール機能テストです。</p>
          
          <p><strong>送信日時:</strong> ${new Date().toLocaleString('ja-JP')}</p>
          <p><strong>設定情報:</strong></p>
          <ul>
            <li>環境: ${process.env.NODE_ENV || 'development'}</li>
            <li>SMTPホスト: ${process.env.SMTP_HOST || 'localhost'}</li>
            <li>SMTPポート: ${process.env.SMTP_PORT || '2525'}</li>
          </ul>
          
          <p>このメールが正常に受信されている場合、メール設定は正しく動作しています。</p>
        </div>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      this.statistics.totalSent++;
      console.log(`[情報] テストメールを送信しました: ${toEmail}`);
      return true;
    } catch (error) {
      this.statistics.totalFailed++;
      this.addErrorToStats(error);
      console.error(`[エラー] テストメール送信失敗: ${toEmail}`, error.message);
      throw error;
    }
  }
}

module.exports = new EmailService();