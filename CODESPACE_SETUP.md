# GitHub Codespace設定ガイド

このドキュメントは、GitHub Codespace環境でDiscord AI Botを適切に設定する方法を説明します。

## 修正された問題

**問題**: ユーザーがGitHub CodespaceでDiscord OAuth コールバックURLにアクセスする際に404エラーが発生していました：
```
https://fictional-telegram-gvpj4xjjjgpc6j-8080.app.github.dev/auth/discord/callback
```

**根本原因**: サーバーが外部接続を処理し、GitHub Codespaceドメインパターンを認識するように適切に設定されていませんでした。

## 実装された解決策

### 1. サーバーバインディング設定
- 外部ドメインが検出された場合、サーバーを`localhost:8080`ではなく`0.0.0.0:8080`にバインドするように変更
- これにより、GitHub Codespaceプロキシが外部トラフィックをサーバーに転送できるようになります

### 2. 環境検出
- GitHub Codespaceドメイン（`*.app.github.dev`）の特定検出を追加
- Codespace環境でのHTTPSプロトコルの適切な処理
- Codespaceドメイン名からの自動ポート抽出

### 3. OAuth コールバックURL生成
- Codespace環境でのコールバックURL構築を修正
- 適切なプロトコル（HTTPS）とドメイン処理
- セキュアクッキーでの正しいセッション設定

## GitHub Codespace の設定

### 必要な環境変数

`.env`ファイルで以下が設定されていることを確認してください：

```bash
# Codespaceドメインを設定（実際のcodespace URLに置き換えてください）
ADMIN_DOMAIN=your-codespace-name-8080.app.github.dev

# Discord OAuth認証情報
DISCORD_CLIENT_ID=your_discord_client_id_here
DISCORD_CLIENT_SECRET=your_discord_client_secret_here

# その他の必要な変数
SESSION_SECRET=your_random_session_secret
PORT=8080
```

### Discord Developer Portal設定

Discordアプリケーション設定（https://discord.com/developers/applications）で：

1. **OAuth2** → **General** に移動
2. 以下のリダイレクトURIを追加：
   ```
   https://your-codespace-name-8080.app.github.dev/auth/discord/callback
   ```
3. `your-codespace-name-8080`を実際のcodespace URLに置き換えてください

### 確認方法

修正が動作していることを確認するには：

1. サーバーを起動: `npm start`
2. ログで適切な環境検出を確認：
   ```
   [情報] 認証環境: GitHub Codespace
   [情報] Discord OAuth Callback URL: https://your-codespace-name-8080.app.github.dev/auth/discord/callback
   ```
3. ヘルスエンドポイントをテスト: `curl https://your-codespace-url/api/health`
4. ステータスエンドポイントをテスト: `curl https://your-codespace-url/status`

### トラブルシューティング

まだ問題が発生する場合：

1. **サーバーバインディングを確認**: ログに`Webサーバーが 0.0.0.0:8080 で起動しました`と表示されることを確認
2. **ドメイン検出を確認**: 環境が「GitHub Codespace」として検出されているか確認
3. **ローカルアクセス可能性をテスト**: テストスクリプトを使用してルートがアクセス可能か確認
4. **Discord アプリ設定を確認**: コールバックURLが正確に一致していることを確認

### テストスクリプト

付属のテストスクリプトを実行して、すべてのルートが動作していることを確認：

```bash
node /tmp/test_oauth_callback.js
```

これにより、適切なステータスコード（200/302/400、404ではない）ですべてのテストが合格することが表示されるはずです。

## 行われた変更

- `server.js`: 外部アクセス用のサーバーバインディングロジックを更新
- `services/auth.js`: 環境検出とコールバックURL生成を強化
- OAuth コールバック機能の包括的なテストを追加