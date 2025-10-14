# 緊急管理者アクセス機能

## 概要

すべての管理者アカウントにログインできなくなった場合に、管理者権限を復旧するための緊急アクセス機能です。

## 使用方法

### 1. 緊急管理者キーの設定

`.env` ファイルに `EMERGENCY_ADMIN_KEY` を設定します：

```bash
EMERGENCY_ADMIN_KEY=your-secure-random-key-here
```

**重要：**
- 強力なランダムな文字列を使用してください
- 最低でも32文字以上の長さを推奨します
- 本番環境では、必ず安全な場所に保管してください
- このキーを使用した後は、セキュリティのため変更することを推奨します

### 2. 緊急管理者権限の付与

すべての管理者アカウントにログインできない場合、以下のAPIを使用して管理者権限を付与できます：

**エンドポイント:** `POST /api/system-settings/emergency-admin-access`

**リクエストボディ:**
```json
{
  "targetUser": "ユーザー名またはメールアドレス",
  "emergencyKey": "環境変数に設定したEMERGENCY_ADMIN_KEY"
}
```

**Curlコマンドの例:**
```bash
curl -X POST http://localhost:8080/api/system-settings/emergency-admin-access \
  -H "Content-Type: application/json" \
  -d '{
    "targetUser": "@username",
    "emergencyKey": "your-emergency-key"
  }'
```

または、メールアドレスを使用：
```bash
curl -X POST http://localhost:8080/api/system-settings/emergency-admin-access \
  -H "Content-Type: application/json" \
  -d '{
    "targetUser": "user@example.com",
    "emergencyKey": "your-emergency-key"
  }'
```

**成功レスポンスの例:**
```json
{
  "success": true,
  "message": "管理者権限を @username に付与しました",
  "targetUser": "@username",
  "grantedBy": "EMERGENCY_KEY",
  "warning": "この操作は緊急管理者キーを使用して実行されました。セキュリティのため、環境変数 EMERGENCY_ADMIN_KEY の変更を推奨します。"
}
```

### 3. 使用後の推奨手順

1. 緊急アクセスを使用して管理者権限を取得したら、すぐにログインしてください
2. システム設定で新しい管理者を追加するか、既存の管理者アカウントの問題を解決してください
3. セキュリティのため、`.env` ファイルの `EMERGENCY_ADMIN_KEY` を新しい値に変更してください
4. サーバーを再起動して新しいキーを適用してください

## セキュリティに関する注意事項

- **この機能は緊急時のみ使用してください**
- 緊急管理者キーは、認証なしで管理者権限を付与できる強力な機能です
- キーは安全に保管し、決して公開しないでください
- 使用後は必ずキーを変更してください
- この機能を無効にする場合は、`.env` から `EMERGENCY_ADMIN_KEY` を削除するか、空文字列に設定してください

## トラブルシューティング

### エラー: "緊急管理者キーが無効です"
- `.env` ファイルに `EMERGENCY_ADMIN_KEY` が正しく設定されているか確認してください
- サーバーを再起動して環境変数を再読み込みしてください
- リクエストで送信したキーが環境変数の値と完全に一致しているか確認してください

### エラー: "指定されたユーザーが見つかりません"
- ユーザー名またはメールアドレスが正しいか確認してください
- ユーザーがシステムに登録されているか確認してください
- ハンドル形式の場合は `@` が含まれているか確認してください

### エラー: "指定されたユーザーは既に管理者です"
- 指定したユーザーは既に管理者権限を持っています
- 別のユーザーに権限を付与するか、既存の管理者アカウントでログインを試みてください

## 機能の無効化

この緊急アクセス機能を無効にする場合：

1. `.env` ファイルから `EMERGENCY_ADMIN_KEY` を削除するか：
   ```bash
   # EMERGENCY_ADMIN_KEY=
   ```

2. または空文字列に設定：
   ```bash
   EMERGENCY_ADMIN_KEY=
   ```

3. サーバーを再起動

キーが設定されていない場合、緊急アクセスAPIは常に失敗します。
