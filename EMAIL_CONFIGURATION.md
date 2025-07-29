# 📧 メール設定・ドメイン接続ガイド

Discord AI Botシステムにおけるメール機能の設定方法とセキュリティ対策について説明します。

## 📋 目次

- [概要](#概要)
- [開発環境での設定](#開発環境での設定)
- [本番環境での設定](#本番環境での設定)
- [メールプロバイダー別設定](#メールプロバイダー別設定)
- [ドメイン・DNS設定](#ドメインdns設定)
- [セキュリティ設定](#セキュリティ設定)
- [トラブルシューティング](#トラブルシューティング)

## 🔍 概要

このシステムでは以下のメール機能を提供しています：

- **ユーザー登録時のメール認証**
- **パスワードリセット機能**
- **アカウントセキュリティ通知**

### 現在のアーキテクチャ

```
[アプリケーション] → [Nodemailer] → [SMTP Server] → [メール送信]
```

## 🔧 開発環境での設定

### 軽量SMTPサーバー（現在の実装）

開発・テスト環境では、内蔵の軽量SMTPサーバーを使用します。

```bash
# .env ファイルの設定
SMTP_PORT=2525
SYSTEM_EMAIL=ai-system@localhost
NODE_ENV=development
```

**特徴：**
- 外部依存なし
- ローカルで完結
- メール送信ログを確認可能
- 実際のメール送信は行わない（開発用）

### 設定確認方法

```bash
# アプリケーション起動
npm start

# SMTP サーバー状態確認（ブラウザで）
http://localhost:8080/admin/email-status
```

## 🚀 本番環境での設定

本番環境では、信頼性の高い外部SMTPサーバーを使用することを強く推奨します。

### 基本設定

```bash
# .env ファイルの設定例
NODE_ENV=production
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@yourdomain.com
SMTP_PASS=your-app-password
SYSTEM_EMAIL=no-reply@yourdomain.com
```

## 📮 メールプロバイダー別設定

### Gmail SMTP

Gmailを使用する場合の設定：

```bash
# Gmail SMTP 設定
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=your-app-password
SYSTEM_EMAIL=your-gmail@gmail.com

# Gmail OAuth2 設定（推奨）
GMAIL_CLIENT_ID=your-oauth-client-id
GMAIL_CLIENT_SECRET=your-oauth-client-secret
GMAIL_REFRESH_TOKEN=your-refresh-token
```

#### Gmail App Password 設定手順

1. Google アカウントの2段階認証を有効化
2. [Google アカウント設定](https://myaccount.google.com/) → セキュリティ
3. 「アプリパスワード」を生成
4. 生成されたパスワードを `SMTP_PASS` に設定

#### Gmail OAuth2 設定手順（推奨）

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクト作成
2. Gmail API を有効化
3. OAuth 2.0 認証情報を作成
4. 認証スコープに `https://www.googleapis.com/auth/gmail.send` を追加

### SendGrid

SendGridを使用する場合の設定：

```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
SYSTEM_EMAIL=no-reply@yourdomain.com
```

#### SendGrid API Key 取得手順

1. [SendGrid](https://sendgrid.com/) アカウント作成
2. Settings → API Keys
3. Full Access API Key を作成
4. ドメイン認証設定を完了

### Amazon SES

Amazon SESを使用する場合の設定：

```bash
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-ses-access-key
SMTP_PASS=your-ses-secret-key
SYSTEM_EMAIL=no-reply@yourdomain.com
```

#### Amazon SES 設定手順

1. AWS SES コンソールでドメイン検証
2. SMTP認証情報を生成
3. 送信制限を本番用に調整

### Microsoft 365 / Outlook

Microsoft 365を使用する場合の設定：

```bash
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@yourdomain.com
SMTP_PASS=your-password
SYSTEM_EMAIL=no-reply@yourdomain.com
```

## 🌐 ドメイン・DNS設定

### SPF レコード

SPF (Sender Policy Framework) レコードをDNSに追加：

```dns
# 基本的なSPFレコード
yourdomain.com. IN TXT "v=spf1 include:_spf.google.com ~all"

# SendGrid使用時
yourdomain.com. IN TXT "v=spf1 include:sendgrid.net ~all"

# Amazon SES使用時
yourdomain.com. IN TXT "v=spf1 include:amazonses.com ~all"
```

### DKIM 設定

DKIM (DomainKeys Identified Mail) 設定：

```dns
# Gmail/Google Workspace
default._domainkey.yourdomain.com. IN TXT "v=DKIM1; k=rsa; p=..."

# SendGrid
s1._domainkey.yourdomain.com. IN CNAME s1.domainkey.u1234567.wl001.sendgrid.net.
s2._domainkey.yourdomain.com. IN CNAME s2.domainkey.u1234567.wl001.sendgrid.net.
```

### DMARC ポリシー

DMARC (Domain-based Message Authentication) ポリシー：

```dns
_dmarc.yourdomain.com. IN TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com"
```

### MX レコード（必要に応じて）

```dns
yourdomain.com. IN MX 10 mail.yourdomain.com.
```

## 🔒 セキュリティ設定

### 1. TLS/SSL 暗号化

```javascript
// services/email.js での設定例
const transporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_PORT == 465, // SSL
  requireTLS: true, // TLS必須
  tls: {
    ciphers: 'SSLv3',
    rejectUnauthorized: true
  }
});
```

### 2. 認証設定

```javascript
// SMTP認証設定
auth: {
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS
}

// OAuth2認証設定（Gmail）
auth: {
  type: 'OAuth2',
  user: process.env.GMAIL_USER,
  clientId: process.env.GMAIL_CLIENT_ID,
  clientSecret: process.env.GMAIL_CLIENT_SECRET,
  refreshToken: process.env.GMAIL_REFRESH_TOKEN
}
```

### 3. レート制限

```javascript
// メール送信レート制限の実装例
class EmailRateLimit {
  constructor() {
    this.attempts = new Map();
    this.maxAttempts = 5; // 5通/時間
    this.windowMs = 60 * 60 * 1000; // 1時間
  }

  checkLimit(email) {
    const now = Date.now();
    const userAttempts = this.attempts.get(email) || [];
    
    // 古い試行を削除
    const validAttempts = userAttempts.filter(
      time => now - time < this.windowMs
    );
    
    if (validAttempts.length >= this.maxAttempts) {
      throw new Error('メール送信制限に達しました');
    }
    
    validAttempts.push(now);
    this.attempts.set(email, validAttempts);
  }
}
```

### 4. セキュリティヘッダー

```javascript
// メールセキュリティヘッダーの追加
const mailOptions = {
  from: process.env.SYSTEM_EMAIL,
  to: email,
  subject: 'AI管理システム - メール認証',
  headers: {
    'X-Priority': '1',
    'X-MSMail-Priority': 'High',
    'X-Mailer': 'Discord-AI-System',
    'X-Auto-Response-Suppress': 'All'
  },
  html: emailContent
};
```

### 5. 入力検証

```javascript
// メールアドレス検証の強化
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(email)) {
    throw new Error('無効なメールアドレス形式');
  }
  
  // 危険なドメインのブラックリスト
  const blacklistedDomains = ['tempmail.org', '10minutemail.com'];
  const domain = email.split('@')[1].toLowerCase();
  
  if (blacklistedDomains.includes(domain)) {
    throw new Error('このメールアドレスは使用できません');
  }
  
  return true;
}
```

### 6. トークン管理

```javascript
// セキュアなトークン生成と管理
const crypto = require('crypto');

function generateSecureToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// トークンの有効期限設定
const tokenExpiry = {
  verification: 24 * 60 * 60 * 1000, // 24時間
  passwordReset: 60 * 60 * 1000,     // 1時間
};
```

## 🔧 トラブルシューティング

### よくある問題と解決方法

#### 1. メール送信失敗

**症状:** メールが送信されない

**確認項目:**
```bash
# SMTP設定の確認
echo $SMTP_HOST
echo $SMTP_PORT
echo $SMTP_USER

# 接続テスト
telnet $SMTP_HOST $SMTP_PORT
```

**解決方法:**
- SMTP認証情報の確認
- ファイアウォール設定の確認
- プロバイダーの送信制限確認

#### 2. 迷惑メールフォルダ問題

**症状:** メールが迷惑メールに分類される

**解決方法:**
- SPF/DKIM/DMARC設定の確認
- 送信者レピュテーションの改善
- メール内容の見直し

#### 3. 認証エラー

**症状:** SMTP認証に失敗する

**解決方法:**
```javascript
// 認証設定の確認
const testConnection = async () => {
  try {
    await transporter.verify();
    console.log('SMTP接続成功');
  } catch (error) {
    console.error('SMTP接続エラー:', error);
  }
};
```

#### 4. TLS/SSL エラー

**症状:** TLS接続エラーが発生

**解決方法:**
```javascript
// TLS設定の調整
tls: {
  rejectUnauthorized: false, // 開発環境のみ
  minVersion: 'TLSv1.2',
  ciphers: 'HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA'
}
```

### デバッグ方法

#### ログ設定

```javascript
// 詳細なSMTPログを有効化
const transporter = nodemailer.createTransporter({
  // ... 設定 ...
  debug: true,
  logger: true
});
```

#### テストメール送信

```javascript
// テストメール送信スクリプト
const testEmail = async () => {
  try {
    await emailService.sendTestEmail('test@example.com');
    console.log('テストメール送信成功');
  } catch (error) {
    console.error('テストメール送信失敗:', error);
  }
};
```

## 📊 監視とメンテナンス

### メール送信状況の監視

```javascript
// メール送信統計の取得
app.get('/admin/email-stats', (req, res) => {
  const stats = {
    totalSent: emailService.getTotalSent(),
    successRate: emailService.getSuccessRate(),
    recentErrors: emailService.getRecentErrors()
  };
  res.json(stats);
});
```

### 定期メンテナンス

- **月次**: 送信制限とレート確認
- **週次**: エラーログの確認
- **日次**: 送信状況の監視

## 🔗 関連リンク

- [Nodemailer 公式ドキュメント](https://nodemailer.com/)
- [Gmail SMTP 設定](https://support.google.com/mail/answer/7126229)
- [SendGrid ドキュメント](https://docs.sendgrid.com/)
- [Amazon SES 開発者ガイド](https://docs.aws.amazon.com/ses/)
- [RFC 5321 - Simple Mail Transfer Protocol](https://tools.ietf.org/html/rfc5321)

---

**注意**: 本番環境では必ず適切なセキュリティ設定を行い、定期的な監視とメンテナンスを実施してください。