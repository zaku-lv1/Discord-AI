# Firestore統合ガイド

## 概要

このシステムは、AI設定の保存に2つの方法をサポートしています：

1. **ファイルベース**: `data/ai-config.json`にローカル保存（デフォルト）
2. **Firestore**: Google Cloud Firestoreにクラウド保存

Firebase認証情報が設定されていない場合、システムは自動的にファイルベースストレージにフォールバックします。

## Firestoreの設定方法

### 1. Firebaseプロジェクトの作成

1. [Firebase Console](https://console.firebase.google.com)にアクセス
2. 新しいプロジェクトを作成するか、既存のプロジェクトを選択
3. Firestoreデータベースを有効化

### 2. サービスアカウントキーの取得

1. Firebase Console → プロジェクト設定 → サービスアカウント
2. 「Firebase Admin SDK」タブを選択
3. 「新しい秘密鍵の生成」ボタンをクリック
4. JSONファイルがダウンロードされます

### 3. 環境変数の設定

`.env`ファイルに以下を追加：

```bash
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"your-project-id","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token",...}'
```

**注意**: JSONファイルの内容全体を1行の文字列として貼り付けてください。

### 4. アプリケーションの再起動

```bash
npm start
```

起動ログに以下が表示されればFirestoreが有効です：

```
[INFO] AI config store initialized with Firestore
```

## データ構造

Firestoreのコレクション構造：

```
settings/
  └── ai-config/
      ├── botName: string
      ├── botIconUrl: string
      ├── systemPrompt: string
      ├── modelMode: string
      ├── replyDelayMs: number
      └── errorOopsMessage: string
```

## ファイルベースからFirestoreへの移行

既存のファイルベース設定からFirestoreに移行する場合：

1. Firebase認証情報を`.env`に設定
2. アプリケーションを起動
3. 既存の`data/ai-config.json`は保持されます（バックアップとして）
4. ダッシュボードで設定を変更すると、Firestoreに保存されます

## トラブルシューティング

### Firebaseエラーが発生する場合

システムは自動的にファイルベースストレージにフォールバックします。以下を確認してください：

1. `FIREBASE_SERVICE_ACCOUNT_JSON`環境変数が正しく設定されているか
2. JSONの形式が正しいか（改行が`\n`でエスケープされているか）
3. サービスアカウントキーに必要な権限があるか

### ログの確認

```
[INFO] AI config store initialized with Firestore  # Firestore有効
[INFO] AI config store using file-based storage    # ファイルベース使用
```

## セキュリティ注意事項

- サービスアカウントJSONは機密情報です
- `.env`ファイルをGitにコミットしないでください
- 本番環境では環境変数を使用してください（`.env`ファイルではなく）
