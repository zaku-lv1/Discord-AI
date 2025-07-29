# 🔒 メールセキュリティ設定ガイド

Discord AI Botシステムにおけるメール関連のセキュリティ設定とベストプラクティスについて説明します。

## 📋 目次

- [基本セキュリティ原則](#基本セキュリティ原則)
- [認証とアクセス制御](#認証とアクセス制御)
- [暗号化設定](#暗号化設定)
- [レート制限と防御](#レート制限と防御)
- [監視とログ](#監視とログ)
- [DNS セキュリティ設定](#dns-セキュリティ設定)
- [インシデント対応](#インシデント対応)

## 🛡️ 基本セキュリティ原則

### 1. 最小権限の原則

メールサービスには必要最小限の権限のみを付与：

```bash
# 専用メールアカウントの使用
SMTP_USER=no-reply@yourdomain.com  # 専用アカウント
SYSTEM_EMAIL=no-reply@yourdomain.com  # 送信専用

# 避けるべき設定
SMTP_USER=admin@yourdomain.com  # 管理者アカウントは使用禁止
```

### 2. 認証情報の分離

```bash
# 本番環境
NODE_ENV=production
SMTP_PASS=production-api-key

# ステージング環境  
NODE_ENV=staging
SMTP_PASS=staging-api-key

# 開発環境（認証不要）
NODE_ENV=development
# SMTP認証設定なし
```

### 3. 定期的な認証情報ローテーション

- **API キー**: 3ヶ月ごと
- **OAuth トークン**: 自動更新設定
- **パスワード**: 6ヶ月ごと

## 🔐 認証とアクセス制御

### OAuth2 認証（推奨）

Gmail OAuth2 設定例：

```bash
# OAuth2 設定（App Passwordより安全）
GMAIL_CLIENT_ID=123456789-abcdefghijklmnop.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your-client-secret
GMAIL_REFRESH_TOKEN=your-refresh-token

# 必要なスコープ
# https://www.googleapis.com/auth/gmail.send
```

### App Password 設定

Gmailでの2段階認証とApp Password：

```bash
# 2段階認証を有効化後
SMTP_USER=your-email@gmail.com
SMTP_PASS=abcd-efgh-ijkl-mnop  # 16文字のApp Password
```

### API キー管理

SendGrid API キーのスコープ制限：

```json
{
  "scopes": [
    "mail.send"
  ],
  "description": "Discord AI Bot - Send Only"
}
```

## 🔒 暗号化設定

### TLS/SSL 設定

```javascript
// 強力な暗号化設定
const smtpConfig = {
  host: process.env.SMTP_HOST,
  port: 587,
  secure: false,  // STARTTLS使用
  requireTLS: true,  // TLS必須
  tls: {
    minVersion: 'TLSv1.2',  // 最小TLSバージョン
    ciphers: 'ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:DHE+CHACHA20:!aNULL:!MD5:!DSS',
    rejectUnauthorized: true,  // 証明書検証必須
    checkServerIdentity: true
  }
};
```

### ポート設定

```bash
# 推奨ポート設定
SMTP_PORT=587  # STARTTLS (推奨)
SMTP_SECURE=false

# SSL直接接続（代替案）
SMTP_PORT=465
SMTP_SECURE=true

# 平文接続（開発環境のみ）
SMTP_PORT=25  # 本番環境では使用禁止
```

## 🚫 レート制限と防御

### 送信レート制限

```javascript
// 実装済みレート制限
const rateLimits = {
  maxAttempts: 5,           // 最大試行回数
  windowMs: 60 * 60 * 1000, // 1時間ウィンドウ
  blockDuration: 60 * 60 * 1000 // ブロック期間
};
```

### 入力検証

```javascript
// メールアドレス検証
function validateEmail(email) {
  // 基本フォーマット検証
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  // 長さ制限
  if (email.length > 254) {
    throw new Error('メールアドレスが長すぎます');
  }
  
  // ブラックリストチェック
  const blacklistedDomains = [
    'tempmail.org', '10minutemail.com', 
    'guerrillamail.org', 'mailinator.com'
  ];
  
  const domain = email.split('@')[1].toLowerCase();
  if (blacklistedDomains.includes(domain)) {
    throw new Error('このドメインは使用できません');
  }
}
```

### DDoS 対策

```javascript
// IPベースレート制限
const ipRateLimit = {
  windowMs: 15 * 60 * 1000, // 15分
  max: 10, // IP あたり最大10リクエスト
  message: 'アクセスが制限されています'
};
```

## 📊 監視とログ

### セキュリティログ

```javascript
// セキュリティイベントログ
const securityEvents = {
  RATE_LIMIT_EXCEEDED: 'レート制限超過',
  INVALID_EMAIL_FORMAT: '無効なメール形式',
  BLACKLISTED_DOMAIN: 'ブラックリストドメイン',
  SMTP_AUTH_FAILURE: 'SMTP認証失敗',
  TLS_HANDSHAKE_FAILURE: 'TLS接続失敗'
};

function logSecurityEvent(event, details) {
  console.log(`[セキュリティ] ${new Date().toISOString()} - ${event}:`, details);
  
  // 重要なイベントはアラート送信
  if (isCriticalEvent(event)) {
    sendSecurityAlert(event, details);
  }
}
```

### 監視指標

```javascript
// 監視すべき指標
const monitoringMetrics = {
  emailSendRate: '送信成功率',
  authFailureRate: '認証失敗率',
  rateLimitHits: 'レート制限発動回数',
  suspiciousActivity: '不審なアクティビティ',
  tlsErrors: 'TLS接続エラー'
};
```

### アラート設定

```bash
# 監視アラート条件
EMAIL_SUCCESS_RATE_THRESHOLD=95  # 成功率95%以下でアラート
AUTH_FAILURE_THRESHOLD=10        # 10回連続失敗でアラート
RATE_LIMIT_THRESHOLD=100         # 1時間に100回レート制限でアラート
```

## 🌐 DNS セキュリティ設定

### SPF レコード（必須）

```dns
# 厳格なSPFポリシー
yourdomain.com. IN TXT "v=spf1 include:_spf.google.com -all"

# より制限的な設定
yourdomain.com. IN TXT "v=spf1 ip4:203.0.113.1 include:_spf.google.com -all"
```

### DKIM 設定（必須）

```dns
# Google Workspace DKIM
google._domainkey.yourdomain.com. IN TXT "v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA..."

# SendGrid DKIM
s1._domainkey.yourdomain.com. IN CNAME s1.domainkey.u1234567.wl001.sendgrid.net.
s2._domainkey.yourdomain.com. IN CNAME s2.domainkey.u1234567.wl001.sendgrid.net.
```

### DMARC ポリシー（必須）

```dns
# 段階的なDMARCポリシー実装

# 段階1: 監視のみ
_dmarc.yourdomain.com. IN TXT "v=DMARC1; p=none; rua=mailto:dmarc-reports@yourdomain.com; ruf=mailto:dmarc-failures@yourdomain.com"

# 段階2: 隔離
_dmarc.yourdomain.com. IN TXT "v=DMARC1; p=quarantine; pct=25; rua=mailto:dmarc-reports@yourdomain.com"

# 段階3: 拒否（最終目標）
_dmarc.yourdomain.com. IN TXT "v=DMARC1; p=reject; rua=mailto:dmarc-reports@yourdomain.com"
```

### MTA-STS（推奨）

```dns
# MTA-STSポリシー
_mta-sts.yourdomain.com. IN TXT "v=STSv1; id=20240101T120000;"
```

```text
# https://mta-sts.yourdomain.com/.well-known/mta-sts.txt
version: STSv1
mode: enforce
mx: mail.yourdomain.com
max_age: 604800
```

### TLSRPT（推奨）

```dns
_smtp._tls.yourdomain.com. IN TXT "v=TLSRPTv1; rua=mailto:tlsrpt@yourdomain.com"
```

## 🚨 インシデント対応

### セキュリティインシデント検知

```javascript
// 自動検知システム
const securityChecks = {
  // 異常な送信パターン
  checkAbnormalSendingPattern() {
    const recentSends = this.getRecentSends(60); // 1時間
    if (recentSends > 1000) {
      return { level: 'HIGH', message: '異常な送信量を検知' };
    }
  },
  
  // 認証失敗の急増
  checkAuthFailures() {
    const failures = this.getAuthFailures(15); // 15分
    if (failures > 50) {
      return { level: 'CRITICAL', message: '認証失敗の急増' };
    }
  },
  
  // 不審なIPアクセス
  checkSuspiciousIPs() {
    const suspiciousIPs = this.getSuspiciousActivity();
    if (suspiciousIPs.length > 0) {
      return { level: 'MEDIUM', message: '不審なIPからのアクセス' };
    }
  }
};
```

### インシデント対応手順

```javascript
// インシデント対応フロー
const incidentResponse = {
  // レベル1: 自動対応
  automaticResponse(incident) {
    switch(incident.level) {
      case 'HIGH':
        this.enableRateLimit();
        this.notifyAdministrators();
        break;
      case 'CRITICAL':
        this.temporaryDisableEmail();
        this.alertSecurityTeam();
        break;
    }
  },
  
  // レベル2: 手動対応
  manualResponse: {
    '認証情報漏洩の疑い': [
      '1. 全APIキーを即座に無効化',
      '2. 新しい認証情報を生成',
      '3. アクセスログを分析',
      '4. 影響範囲を特定'
    ],
    'メール送信の悪用': [
      '1. メール送信を一時停止',
      '2. 送信ログを確認',
      '3. 悪用されたアカウントを特定',
      '4. セキュリティ強化策を実装'
    ]
  }
};
```

### 復旧手順

```bash
# インシデント後の復旧チェックリスト

# 1. 認証情報の更新
echo "新しいAPIキーを生成"
SMTP_PASS=new-secure-api-key

# 2. セキュリティ設定の強化
echo "TLS設定を最新に更新"
echo "レート制限を厳格化"

# 3. 監視の強化
echo "アラート閾値を調整"
echo "ログ監視を強化"

# 4. テスト実行
npm run test:email-security
npm run test:rate-limits

# 5. 段階的復旧
echo "制限付きでサービス復旧"
echo "監視強化下で運用再開"
```

## 📋 セキュリティチェックリスト

### 実装時チェックリスト

- [ ] TLS 1.2以上の暗号化設定
- [ ] 強力な認証情報（OAuth2 または App Password）
- [ ] レート制限の実装
- [ ] 入力検証の実装
- [ ] ログ記録の設定
- [ ] エラーハンドリングの実装

### DNS設定チェックリスト

- [ ] SPF レコードの設定
- [ ] DKIM レコードの設定
- [ ] DMARC ポリシーの設定
- [ ] MTA-STS の設定（推奨）
- [ ] TLSRPT の設定（推奨）

### 運用時チェックリスト

- [ ] 定期的な認証情報ローテーション
- [ ] 送信統計の監視
- [ ] セキュリティアラートの確認
- [ ] DMARC レポートの分析
- [ ] セキュリティパッチの適用

### 月次セキュリティレビュー

- [ ] アクセスログの分析
- [ ] 異常な送信パターンの確認
- [ ] レート制限の効果測定
- [ ] セキュリティ設定の見直し
- [ ] インシデント対応手順の更新

---

**重要**: セキュリティは継続的なプロセスです。定期的な見直しと更新を行い、新しい脅威に対応してください。