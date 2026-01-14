# Firebase統合ガイド - AI設定と会話履歴の永続化

## 概要

このドキュメントでは、Discord AI BotにおけるFirebase統合機能について説明します。以下の機能が実装されています：

1. **AI設定のFirestore保存**
2. **会話履歴のFirestore保存**
3. **ニックネーム設定機能**

## 機能詳細

### 1. AI設定のFirestore保存

AI設定は以下の場所に保存されます：
- Firestore: `settings/ai-config` コレクション
- ファイル: `data/ai-config.json` (フォールバック)

#### 保存される設定項目

```json
{
  "botName": "AI Assistant",
  "botIconUrl": "https://example.com/avatar.png",
  "systemPrompt": "あなたは親しみやすくフレンドリーなAIアシスタントです。",
  "modelMode": "hybrid",
  "replyDelayMs": 0,
  "errorOopsMessage": "ちょっと調子が悪いみたい...ごめんね！",
  "userNicknames": {
    "123456789012345678": "A-kun",
    "987654321098765432": "B-chan"
  }
}
```

#### API経由での設定更新

```bash
curl -X PUT http://localhost:8080/api/settings/ai \
  -H "Content-Type: application/json" \
  -d '{
    "botName": "カスタムAI",
    "systemPrompt": "カスタムプロンプト",
    "modelMode": "hybrid",
    "replyDelayMs": 1000,
    "errorOopsMessage": "エラーメッセージ",
    "userNicknames": {
      "123456789012345678": "田中さん",
      "987654321098765432": "佐藤さん"
    }
  }'
```

### 2. 会話履歴のFirestore保存

会話履歴は以下の場所に保存されます：
- Firestore: `conversation_history` コレクション
- メモリ: インメモリキャッシュ (パフォーマンス向上)

#### データ構造

```json
{
  "channelId": "1234567890123456",
  "webhookName": "AI Assistant",
  "messages": [
    {
      "role": "user",
      "parts": [{ "text": "[発言者: ユーザー名]\nこんにちは！" }]
    },
    {
      "role": "model",
      "parts": [{ "text": "こんにちは！お手伝いできることはありますか？" }]
    }
  ],
  "messageCount": 2,
  "updatedAt": "2024-01-14T12:00:00.000Z"
}
```

#### 特徴

- **自動トリミング**: 最新60メッセージまで保存
- **チャンネル別管理**: 各チャンネルごとに独立した会話履歴
- **ボット再起動後も保持**: Firestoreに保存されるため永続化
- **パフォーマンス最適化**: インメモリキャッシュで高速アクセス

### 3. ニックネーム設定機能

ニックネーム機能により、Discord IDと人間が読める名前を関連付けることができます。

#### 仕組み

1. **ユーザーがニックネームを含むメッセージを送信**
   ```
   ユーザー: "A-kunはどこにいる？"
   ```

2. **ボットがニックネームをメンションに変換**
   ```
   処理後: "<@123456789012345678>はどこにいる？"
   ```

3. **AIへの入力時にメンションをニックネームに戻す**
   ```
   AI入力: "@A-kunはどこにいる？"
   ```

4. **AIが自然な形で理解・応答**
   ```
   AI応答: "A-kunは今忙しいみたいです"
   ```

#### ニックネームの設定方法

**方法1: API経由**

```bash
# 設定を更新
curl -X PUT http://localhost:8080/api/settings/ai \
  -H "Content-Type: application/json" \
  -d '{
    "botName": "AI Assistant",
    "systemPrompt": "プロンプト",
    "userNicknames": {
      "123456789012345678": "田中太郎",
      "987654321098765432": "佐藤花子"
    }
  }'
```

**方法2: 直接編集 (開発環境)**

`data/ai-config.json`を編集：

```json
{
  "botName": "AI Assistant",
  "userNicknames": {
    "123456789012345678": "田中太郎",
    "987654321098765432": "佐藤花子"
  }
}
```

#### マッチングルール

ニックネームは以下のパターンでマッチングされます：

1. **完全単語マッチ**: `\b田中太郎\b`
2. **境界文字マッチ**: 英数字・アンダースコア・ハイフン以外の境界
3. **句読点マッチ**: 空白、句読点、文頭・文末での境界

**例：**

| 入力 | 変換結果 | 理由 |
|------|----------|------|
| `田中太郎さん` | `<@123456789012345678>さん` | ✅ 完全マッチ |
| `田中太郎は` | `<@123456789012345678>は` | ✅ 完全マッチ |
| `田中太郎` | `<@123456789012345678>` | ✅ 完全マッチ |
| `田中太郎くん` | 変換なし | ❌ 部分文字列 |

## Firebase設定

### 必要な環境変数

```bash
# .env ファイル
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token"}'
```

### Firebase Consoleでの設定手順

1. [Firebase Console](https://console.firebase.google.com) にアクセス
2. プロジェクトを選択または作成
3. **プロジェクト設定** → **サービスアカウント**
4. **Firebase Admin SDK** タブを選択
5. **新しい秘密鍵の生成** をクリック
6. ダウンロードしたJSONファイルの内容を環境変数に設定

### フォールバック動作

Firebaseが設定されていない場合：
- AI設定 → ファイルベースのストレージ (`data/ai-config.json`)
- 会話履歴 → インメモリストレージ (再起動で消失)
- ニックネーム → ファイルベースのストレージ

## テスト

実装をテストするには：

```bash
# テストスクリプトを実行
node test_firebase_integration.js
```

### テスト内容

1. **AI設定ストアテスト**
   - 設定の読み込み
   - ニックネームフィールドの存在確認
   - 設定の更新と永続化

2. **会話履歴テスト**
   - 履歴の読み込み
   - メッセージの追加
   - 履歴のクリア

3. **ニックネーム機能テスト**
   - 正規表現エスケープ
   - ニックネームからメンションへの変換
   - メンションからニックネームへの変換

## トラブルシューティング

### 問題: Firebase接続エラー

**症状**: `Firebase設定エラー` のメッセージが表示される

**解決方法**:
1. 環境変数 `FIREBASE_SERVICE_ACCOUNT_JSON` が正しく設定されているか確認
2. JSONが有効な形式か確認（改行は `\n` でエスケープ）
3. サービスアカウントに必要な権限があるか確認

### 問題: 会話履歴が保存されない

**症状**: ボット再起動後に会話が失われる

**解決方法**:
1. Firebaseが正しく設定されているか確認
2. コンソールログで `[INFO] Conversation history saved to Firebase` が表示されるか確認
3. Firebase Consoleで `conversation_history` コレクションを確認

### 問題: ニックネームが認識されない

**症状**: ニックネームがメンションに変換されない

**解決方法**:
1. `userNicknames` が正しく設定されているか確認
2. Discord IDが正しいか確認（18-19桁の数字）
3. ニックネームが境界文字で区切られているか確認

## セキュリティ考慮事項

1. **Firebase認証情報**: 環境変数として安全に保存
2. **Discord ID検証**: 存在しないユーザーへのマッピングは無視
3. **正規表現インジェクション**: すべての入力をエスケープ処理
4. **ギルドメンバー確認**: ギルド外のユーザーは変換しない

## パフォーマンス最適化

1. **インメモリキャッシュ**: 頻繁なFirestoreアクセスを削減
2. **バッチ更新**: 会話履歴を効率的に保存
3. **自動トリミング**: 古いメッセージを自動削除して容量を節約
4. **長い名前優先**: 部分マッチを防ぐために長い名前から処理

## まとめ

この統合により、Discord AI Botは以下の利点を得ます：

- ✅ **永続的な設定**: ボット再起動後も設定が保持
- ✅ **会話の継続性**: チャンネルごとの会話履歴が永続化
- ✅ **自然な対話**: ニックネームによる親しみやすい会話
- ✅ **スケーラビリティ**: Firestoreによるクラウドストレージ
- ✅ **フォールバック**: Firebase未設定でも動作可能
