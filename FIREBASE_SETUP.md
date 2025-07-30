# Firebase セットアップガイド

Firebase Admin SDK の認証エラーを解決するための詳細ガイドです。

## エラーメッセージの例
```
[ERROR] ローカル認証エラー: 16 UNAUTHENTICATED: Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication credential.
```

## 解決手順

### 1. Firebase プロジェクトの作成
1. [Firebase Console](https://console.firebase.google.com) にアクセス
2. 「プロジェクトを追加」をクリック
3. プロジェクト名を入力して作成

### 2. サービスアカウントキーの生成
1. Firebase Console でプロジェクトを選択
2. 左側メニューから「プロジェクトの設定」（歯車アイコン）をクリック
3. 「サービス アカウント」タブを選択
4. 「Firebase Admin SDK」セクションで「新しい秘密鍵の生成」をクリック
5. 確認ダイアログで「キーを生成」をクリック
6. JSON ファイルがダウンロードされます

### 3. 環境変数の設定
1. ダウンロードした JSON ファイルを開く
2. JSON の内容を1行の文字列にコピー
3. `.env` ファイルに以下の形式で設定:

```bash
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"your-project-id","private_key_id":"abc123","private_key":"-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANB...長い文字列...\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk-xyz@your-project.iam.gserviceaccount.com","client_id":"123456789","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xyz%40your-project.iam.gserviceaccount.com"}'
```

### 4. 注意点
- **改行文字**: private_key 内の改行は `\n` として記述してください
- **引用符**: JSON 全体をシングルクォート `'` で囲んでください
- **エスケープ**: JSON 内のダブルクォートはエスケープ不要です
- **セキュリティ**: サービスアカウントキーは機密情報です。リポジトリにコミットしないでください

### 5. Firestore の設定
1. Firebase Console でプロジェクトを選択
2. 左側メニューから「Firestore Database」を選択
3. 「データベースの作成」をクリック
4. セキュリティルールを設定（テストモードまたは本番モード）

### 6. 設定の確認
アプリケーションを起動して以下のメッセージが表示されることを確認:
```
[情報] Firebase Admin SDKが正常に初期化されました。
```

## トラブルシューティング

### エラー: "Failed to parse private key"
- private_key の改行文字が正しく `\n` でエスケープされているか確認
- JSON 形式が正しいか確認（JSONLint などでチェック）

### エラー: "insufficient_permissions"
- サービスアカウントに適切な権限が付与されているか確認
- プロジェクトIDが正しいか確認

### エラー: "project_not_found"
- FIREBASE_SERVICE_ACCOUNT_JSON のproject_idが存在するプロジェクトか確認
- Firebase Console でプロジェクトが有効になっているか確認

## テスト環境
開発・テスト環境では、アプリケーションは自動的にモックDBに切り替わり、エラーが発生してもアプリケーションは動作し続けます。本番環境では適切なFirebase設定が必要です。