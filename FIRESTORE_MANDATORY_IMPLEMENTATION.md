# Firestore必須化実装メモ

## 概要
test/本番環境で情報管理が必ずFirestoreを使うように実装しました。

## 実装日
2026-01-15

## 問題の背景
以前の実装では、Firebaseの設定が不完全な場合、以下のフォールバック機能がありました：
- `services/firebase.js`: モックDBへのフォールバック
- `services/ai-config-store.js`: ファイルベースストレージへのフォールバック

これにより、test/本番環境でもFirestoreが使用されないケースが発生していました。

## 実装した変更

### 1. services/firebase.js の変更

#### 変更箇所1: initialize() メソッド
**変更内容:**
- test/本番環境では、例示的なFirebase設定（'your-project'等）が検出された場合、エラーをスローして起動を中止
- 開発環境のみモックDBの使用を許可

**理由:**
test/本番環境では必ずFirestoreを使用する必要があるため

**コード変更:**
```javascript
// test/本番環境では必ずFirestoreを使用
if ((isTest || isProduction) && isExampleConfig) {
  const errorMsg = `[致命的エラー] ${process.env.NODE_ENV}環境ではFirestoreの設定が必須です。環境変数 FIREBASE_SERVICE_ACCOUNT_JSON を正しく設定してください。`;
  console.error(errorMsg);
  throw new Error(errorMsg);
}
```

#### 変更箇所2: handleInitializationError() メソッド
**変更内容:**
- test/本番環境では、初期化エラー発生時にモックDBへのフォールバックを許可せず、エラーをスロー
- 開発環境のみモックDBへのフォールバックを許可

**理由:**
test/本番環境でデータの整合性を保証するため

**コード変更:**
```javascript
// test/本番環境ではモックDBへのフォールバックを許可しない
if (isTest || isProduction) {
  console.error(`[致命的エラー] ${process.env.NODE_ENV}環境ではFirestoreが必須です。起動を中止します。`);
  throw error;
}
```

#### 変更箇所3: handleFirebaseError() メソッド
**変更内容:**
- test/本番環境では、Firebase認証エラー発生時にモックDBへのフォールバックを許可せず、エラーをスロー
- 開発環境のみモックDBへのフォールバックを許可

**理由:**
実行時のFirebase接続エラーもtest/本番環境では許容しない

**コード変更:**
```javascript
// test/本番環境ではフォールバックせずエラーをスロー
if (isTest || isProduction) {
  console.error(`[致命的エラー] ${process.env.NODE_ENV}環境ではFirestoreが必須です。認証エラーが発生しました。`);
  throw error;
}
```

### 2. services/ai-config-store.js の変更

#### 変更箇所1: initializeFirestore() メソッド
**変更内容:**
- モックDBが使用されている場合、test/本番環境ではエラーをスロー
- 初期化エラー発生時も、test/本番環境ではエラーを再スロー
- 開発環境のみファイルベースストレージへのフォールバックを許可

**理由:**
AI設定の保存先としてFirestoreを確実に使用するため

**コード変更:**
```javascript
// test/本番環境ではFirestoreが必須
if (isTest || isProduction) {
  const errorMsg = `[致命的エラー] ${process.env.NODE_ENV}環境ではFirestoreが必須です。AI config storeの初期化に失敗しました。`;
  console.error(errorMsg);
  throw new Error(errorMsg);
}
```

#### 変更箇所2: getConfigFromFirestore() メソッド
**変更内容:**
- Firestoreからの設定読み込みエラー時、test/本番環境ではエラーを再スロー
- 開発環境のみファイルベースストレージへのフォールバックを許可

**理由:**
設定読み込み時もFirestoreを必須とするため

#### 変更箇所3: saveConfigToFirestore() メソッド
**変更内容:**
- Firestoreへの設定保存エラー時、test/本番環境ではエラーを再スロー
- 開発環境のみファイルベースストレージへのフォールバックを許可

**理由:**
設定保存時もFirestoreを必須とするため

## 影響範囲

### 影響を受けるコンポーネント
1. **Discord Bot起動処理** (`server.js`, `bot/discord-bot.js`)
   - Firestore接続に失敗すると、test/本番環境では起動できなくなる

2. **AI設定管理** (`services/ai-config-store.js`)
   - AI設定の読み込み・保存がFirestore必須になる

3. **ダッシュボードのAI管理機能** (`routes/ai.js`)
   - AI プロファイルの作成・更新・削除が全てFirestore経由になる

4. **ニックネーム管理機能** (`routes/ai.js` のニックネームCRUD API)
   - ニックネームの追加・更新・削除が全てFirestore経由になる

### 影響を受けない機能
- 認証システム (`services/auth.js`)
  - すでにFirestoreベースで実装済み
- ユーザー管理 (`routes/user.js`)
  - すでにFirestoreベースで実装済み
- システム設定 (`routes/system-settings.js`)
  - すでにFirestoreベースで実装済み

## 環境別の動作

### 開発環境 (NODE_ENV=development または未設定)
- Firestore設定が不完全な場合、モックDBまたはファイルベースストレージにフォールバック
- 警告メッセージが表示されるが、起動は継続
- データはメモリまたはローカルファイルに保存（再起動で消失する場合がある）

### テスト環境 (NODE_ENV=test)
- Firestore設定が必須
- 設定が不完全な場合、エラーメッセージを表示して起動を中止
- すべてのデータはFirestoreに保存

### 本番環境 (NODE_ENV=production)
- Firestore設定が必須
- 設定が不完全な場合、エラーメッセージを表示して起動を中止
- すべてのデータはFirestoreに保存

## エラーメッセージ

### Firebase設定が不完全な場合
```
[致命的エラー] test環境ではFirestoreの設定が必須です。環境変数 FIREBASE_SERVICE_ACCOUNT_JSON を正しく設定してください。
```

### Firebase初期化エラーの場合
```
[致命的エラー] test環境ではFirestoreが必須です。起動を中止します。
```

### Firebase認証エラーの場合
```
[致命的エラー] test環境ではFirestoreが必須です。認証エラーが発生しました。
```

### AI config store初期化エラーの場合
```
[致命的エラー] test環境ではFirestoreが必須です。AI config storeの初期化に失敗しました。
```

## 動作確認項目

### ✅ 必須確認項目（test/本番環境）

1. **Firestore正常動作時**
   - [ ] システムが正常に起動する
   - [ ] AI設定の読み込みができる
   - [ ] AI設定の保存ができる
   - [ ] AIプロファイルの作成・更新・削除ができる
   - [ ] ニックネームの追加・更新・削除ができる

2. **Firestore設定が不完全な場合**
   - [ ] エラーメッセージが表示される
   - [ ] システムの起動が中止される
   - [ ] 適切なエラーログが出力される

3. **Firestore接続エラーの場合**
   - [ ] エラーメッセージが表示される
   - [ ] システムの起動が中止される
   - [ ] 適切なエラーログが出力される

### ✅ 開発環境での確認項目

1. **Firestore設定が不完全な場合**
   - [ ] 警告メッセージが表示される
   - [ ] モックDBまたはファイルベースストレージにフォールバック
   - [ ] システムは起動を継続する
   - [ ] データの読み書きができる

## テスト方法

### test環境でのテスト
```bash
# .envファイルで正しいFirebase設定を使用
NODE_ENV=test npm start

# Firebase設定を無効にしてテスト（エラーが期待される）
NODE_ENV=test FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"test-project"}' npm start
```

### 本番環境でのテスト
```bash
# .envファイルで正しいFirebase設定を使用
NODE_ENV=production npm start

# Firebase設定を無効にしてテスト（エラーが期待される）
NODE_ENV=production FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"test-project"}' npm start
```

### 開発環境でのテスト
```bash
# Firebase設定なしでも起動する（モックDBにフォールバック）
NODE_ENV=development FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"test-project"}' npm start

# または
npm run dev
```

## ニックネーム機能の確認

ダッシュボードでのニックネーム機能は既に実装されており、以下の操作が可能です：

### UI操作
1. AI編集モーダルを開く
2. 「このAI固有のニックネーム」セクションで以下を操作:
   - Discord IDとニックネームを入力して追加
   - 既存のニックネームを編集
   - 既存のニックネームを削除
   - ニックネーム認識を検証

### API エンドポイント（すべてFirestore使用）
- `GET /api/ais/:id/nicknames` - ニックネーム取得
- `POST /api/ais/:id/nicknames` - ニックネーム追加
- `PUT /api/ais/:id/nicknames/:discordId` - ニックネーム更新
- `DELETE /api/ais/:id/nicknames/:discordId` - ニックネーム削除
- `POST /api/ais/:id/verify-nicknames` - ニックネーム認識検証

## 注意事項

1. **本番環境への影響**
   - この変更により、本番環境ではFirestoreが必須になります
   - デプロイ前に必ずFirebase設定が正しいことを確認してください

2. **後方互換性**
   - 開発環境では従来通りモックDBやファイルベースストレージへのフォールバックが動作します
   - 既存の開発ワークフローには影響ありません

3. **エラーハンドリング**
   - エラーが発生した場合、詳細なエラーメッセージとFirebase設定ガイドが表示されます
   - FIREBASE_SETUP.mdドキュメントを参照してください

## 今後の改善案

1. **ヘルスチェック機能**
   - 起動時にFirestore接続をテストするヘルスチェックエンドポイントの追加
   - 定期的な接続確認とアラート機能

2. **監視とログ**
   - Firestore操作のメトリクス収集
   - エラー発生時の詳細なログ記録

3. **テストの充実**
   - Firestore必須化に関する自動テストの追加
   - CI/CDパイプラインでの検証

## 参考資料

- [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) - Firebase設定手順
- [FIRESTORE_GUIDE.md](./FIRESTORE_GUIDE.md) - Firestore使用ガイド
- [NAME_MAPPING_FEATURE.md](./NAME_MAPPING_FEATURE.md) - ニックネーム機能の詳細

## 変更履歴

- 2026-01-15: 初版作成 - test/本番環境でのFirestore必須化実装
