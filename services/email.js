const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      // Gmail SMTP設定の確認
      const gmailUser = process.env.GMAIL_USER;
      const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

      if (!gmailUser || !gmailAppPassword) {
        throw new Error('Gmail設定が不完全です。GMAIL_USERとGMAIL_APP_PASSWORDが必要です。');
      }

      // 開発/テスト環境では初期化をスキップ
      const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
      const isTest = process.env.NODE_ENV === 'test';
      const isExampleConfig = gmailUser.includes('your-gmail-address') || 
                              gmailUser.includes('test') || 
                              gmailAppPassword.includes('your-gmail-app-password') ||
                              gmailAppPassword.includes('test');
      
      if ((isDevelopment || isTest) && isExampleConfig) {
        console.log('[警告] 開発/テスト環境でのGmail設定が検出されました。メール機能を無効にします。');
        this.initialized = false;
        return;
      }

      // Gmail SMTP用のnodemailer transporterを作成
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // true for 465, false for 587
        auth: {
          user: gmailUser,
          pass: gmailAppPassword
        }
      });

      // 接続をテスト（タイムアウト付き）
      const verifyPromise = this.transporter.verify();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('接続タイムアウト')), 10000)
      );
      
      await Promise.race([verifyPromise, timeoutPromise]);

      this.initialized = true;
      console.log('[情報] Gmailメールサービスが初期化されました。');
      console.log(`[情報] Gmail送信者: ${gmailUser}`);
    } catch (error) {
      console.error('[エラー] Gmailメールサービスの初期化に失敗しました:', error.message);
      console.log('[警告] メール機能を無効にして続行します。');
      this.initialized = false;
    }
  }

  isInitialized() {
    return this.initialized;
  }

  async sendVerificationEmail(email, username, verificationToken) {
    if (!this.initialized) {
      throw new Error('メールサービスが初期化されていません');
    }

    const verificationUrl = `${this.getBaseUrl()}/auth/verify-email?token=${verificationToken}`;
    
    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'AI管理システム - メールアドレス認証',
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

    await this.transporter.sendMail(mailOptions);
  }

  async sendPasswordResetEmail(email, username, resetToken) {
    if (!this.initialized) {
      throw new Error('メールサービスが初期化されていません');
    }

    const resetUrl = `${this.getBaseUrl()}/auth/reset-password?token=${resetToken}`;
    
    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'AI管理システム - パスワード再設定',
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

    await this.transporter.sendMail(mailOptions);
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
}

module.exports = new EmailService();