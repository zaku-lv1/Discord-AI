# 🤖 Discord AI Bot - AI管理システム

Discord OAuthログインを特徴とするAI機能と Webベース管理パネルを備えたDiscord Bot

## ✨ 機能

- **🤖 AI搭載Discord Bot**: カスタマイズ可能なプロンプトを持つ複数のAIパーソナリティ
- **🌐 Web管理パネル**: AI設定を管理するためのユーザーフレンドリーなインターフェース
- **🔐 Discord OAuthログイン**: Discordアカウントを使用したセキュアな認証
- **🔥 Firebase統合**: 設定とユーザー管理のためのリアルタイムデータベース
- **🧠 Google Gemini AI**: 複数のモデルモードを持つ高度なAI応答
- **👥 マルチ管理者サポート**: 招待コード付きの階層管理者システム
- **📱 レスポンシブデザイン**: モバイルサポート付きのモダンダークテーマ

## 🛠️ セットアップ手順

### 前提条件

- Node.js 18.0.0以上
- Discordアプリケーションとボットトークン
- Firebaseプロジェクト
- Google Gemini APIキー

### 1. Discordアプリケーションのセットアップ

1. [Discord Developer Portal](https://discord.com/developers/applications)にアクセス
2. 新しいアプリケーションを作成するか、既存のものを選択
3. 「Bot」セクションに移動:
   - ボットを作成してトークンをコピー
   - 必要なインテントを有効化: `Guilds`, `Guild Messages`, `Message Content`
4. 「OAuth2」セクションに移動:
   - デプロイメントに基づいてリダイレクトURIを追加:
     - **開発環境**: `http://localhost:8080/auth/discord/callback`
     - **本番環境**: `https://your-domain.com/auth/discord/callback`
     - **Railway/Heroku**: `https://your-app.railway.app/auth/discord/callback`
   - Client IDとClient Secretをコピー

### 2. Firebaseのセットアップ

1. [Firebase Console](https://console.firebase.google.com/)で新しいプロジェクトを作成
2. Firestore Databaseを有効化
3. プロジェクト設定に移動:
   - Webアプリの設定値をコピー
4. サービスアカウントに移動:
   - 新しい秘密鍵を生成してJSONファイルをダウンロード

### 3. Google Gemini APIのセットアップ

1. [Google AI Studio](https://ai.google.dev/)にアクセス
2. Gemini用のAPIキーを作成

### 4. インストール

1. リポジトリをクローン:
   ```bash
   git clone https://github.com/zaku-lv1/Discord-AI.git
   cd Discord-AI
   ```

2. 依存関係をインストール:
   ```bash
   npm install
   ```

3. 環境変数をセットアップ:
   ```bash
   cp .env.example .env
   ```
   
4. `.env`ファイルを実際の値で編集:
   - 必要なトークンと認証情報をすべて入力
   - Firebase サービスアカウントJSONを適切にフォーマット

### 5. アプリケーションの実行

1. ボットを起動:
   ```bash
   npm start
   ```

2. 管理パネルにアクセス:
   - ブラウザで `http://localhost:8080` にアクセス
   - 「Discordでログイン」をクリックして認証

## 🎯 使用方法

### ボットコマンド

ボットには様々なスラッシュコマンドが含まれています:
- `/ai` - カスタマイズ可能なパーソナリティによるAI会話
- `/gemini` - 直接のGemini AI相互作用
- `/image` - 画像関連コマンド
- `/echo` - メッセージのエコー
- その他多数...

### Web管理パネル

1. **ログイン**: Discord OAuthを使用して認証
2. **AI管理**: 複数のAIパーソナリティを作成・設定
3. **ユーザー管理**: 管理者ユーザーと権限を管理
4. **設定**: グローバルボット設定を構成

### AI設定

- **システムプロンプト**: AIのパーソナリティと動作を定義
- **モデルモード**: Hybrid（高品質）またはFlash（高速）から選択
- **応答設定**: 遅延とエラーメッセージを設定
- **ユーザー認識**: パーソナライズされた相互作用を有効化

## 🔧 設定

### 環境変数

必要な環境変数の完全なリストについては `.env.example` を参照してください。

### Firebase セキュリティルール

Firestoreに以下のコレクション用の適切なセキュリティルールが設定されていることを確認してください:
- `bot_settings`
- `invitation_codes`

### Discordボット権限

必要なボット権限:
- メッセージを送信
- メッセージ履歴を読む
- スラッシュコマンドを使用
- リンクを埋め込み
- ファイルを添付

## 🚀 デプロイメント

### 本番環境セットアップ

アプリケーションは環境を自動検出し、それに応じて認証を設定します:

#### 環境設定

1. **開発環境 (localhost)**:
   ```bash
   NODE_ENV=development
   ADMIN_DOMAIN=localhost
   PORT=8080
   ```
   - HTTPプロトコルを使用
   - コールバックURLにポートを含める
   - セッションセキュリティを緩和

2. **本番環境 (カスタムドメイン)**:
   ```bash
   NODE_ENV=production
   ADMIN_DOMAIN=your-domain.com
   PORT=443
   ```
   - HTTPSプロトコルを使用
   - コールバックURLにポートを含めない
   - セッションセキュリティを強化
   - セキュアクッキー

3. **クラウドプラットフォーム (Railway, Heroku等)**:
   ```bash
   NODE_ENV=production
   ADMIN_DOMAIN=your-app.railway.app
   PORT=80
   ```
   - 自動的にHTTPSを使用
   - プラットフォームがSSL終端を処理

#### Discord OAuth設定

コールバックURLは環境に基づいて自動的に構築されます:

- **開発環境**: `http://localhost:8080/auth/discord/callback`
- **本番環境**: `https://your-domain.com/auth/discord/callback`
- **カスタム**: `DISCORD_CALLBACK_URL`を設定して自動検出を上書き

#### 手動コールバックURL上書き

複雑なデプロイメントシナリオでは、コールバックURLを手動で指定できます:

```bash
DISCORD_CALLBACK_URL=https://your-custom-domain.com/auth/discord/callback
```

### プラットフォーム固有のデプロイメント

#### Railway
```bash
NODE_ENV=production
ADMIN_DOMAIN=your-app.railway.app
# その他の環境変数...
```

#### Heroku
```bash
NODE_ENV=production
ADMIN_DOMAIN=your-app.herokuapp.com
# その他の環境変数...
```

#### VPS/カスタムサーバー
```bash
NODE_ENV=production
ADMIN_DOMAIN=your-domain.com
PORT=443
# その他の環境変数...
```

### Dockerデプロイメント

```dockerfile
# Dockerfileの例
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 8080
CMD ["npm", "start"]
```

## 🛡️ セキュリティ

- 環境変数はgitから除外されています
- Firebase サービスアカウント認証情報は安全に保存
- Discord OAuthによるセキュアな認証
- スーパー管理者コントロール付きの階層管理者権限

## 🐛 トラブルシューティング

### よくある問題

1. **ボットが応答しない**: Discordトークンとボット権限を確認
2. **ログインが失敗する**: 
   - Discord OAuthリダイレクトURIが正確に一致することを確認
   - 環境に合わせてコールバックURLが正しく設定されているか確認
   - 本番環境でHTTPSが使用されているか確認
3. **Firebaseエラー**: サービスアカウントJSONが適切にフォーマットされているか確認
4. **AIが動作しない**: Gemini APIキーと使用量制限を確認
5. **本番環境でのセッション問題**: 
   - `SESSION_SECRET`が強力な値に設定されているか確認
   - `NODE_ENV=production`が設定されているか確認
   - HTTPSが適切に設定されているか確認

### 認証のトラブルシューティング

認証が失敗する場合:

1. **環境変数を確認**:
   ```bash
   echo $NODE_ENV
   echo $ADMIN_DOMAIN
   echo $DISCORD_CLIENT_ID
   ```

2. **コールバックURLを確認**: Discord OAuth コールバックURLはDiscord Developer Portalで設定されたものと正確に一致する必要があります

3. **コールバックURL構築をテスト**: 付属のテストスクリプトを使用:
   ```bash
   node test_auth.js
   ```

4. **ブラウザコンソールを確認**: JavaScriptエラーやネットワーク問題がないか確認

### ログ

詳細なエラーメッセージとデバッグ情報については、コンソール出力を確認してください。

## 🤝 貢献

1. リポジトリをフォーク
2. 機能ブランチを作成
3. 変更を加える
4. 徹底的にテスト
5. プルリクエストを送信

## 📄 ライセンス

このプロジェクトはISCライセンスの下でライセンスされています。

## 🙏 謝辞

- Discord API統合のためのDiscord.js
- AI機能のためのGoogle Generative AI
- バックエンドサービスのためのFirebase
- Webサーバー機能のためのExpress.js

---

サポートや質問については、リポジトリでIssueを作成してください。