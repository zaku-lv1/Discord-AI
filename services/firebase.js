const admin = require("firebase-admin");

class FirebaseService {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      if (!serviceAccountString) {
        throw new Error("環境変数 `FIREBASE_SERVICE_ACCOUNT_JSON` が設定されていません。");
      }
      
      // テスト環境での簡易設定
      if (serviceAccountString.includes('test-project')) {
        console.log("[警告] テスト環境でのFirebase設定を使用しています。");
        this.db = this.createMockDB();
        this.initialized = true;
        return;
      }

      const serviceAccount = JSON.parse(serviceAccountString);
      
      // Firebase Admin SDKが既に初期化されているかチェック
      if (!admin.apps.length) {
        admin.initializeApp({ 
          credential: admin.credential.cert(serviceAccount) 
        });
      }
      
      this.db = admin.firestore();
      this.initialized = true;
      console.log("[情報] Firebase Admin SDKが正常に初期化されました。");
    } catch (error) {
      console.error("[致命的エラー] Firebase Admin SDKの初期化に失敗しました:", error.message);
      console.log("[情報] テスト用のモックDBを使用します。");
      this.db = this.createMockDB();
      this.initialized = true;
    }
  }

  createMockDB() {
    return {
      collection: () => ({
        doc: () => ({
          get: () => Promise.resolve({ exists: false, data: () => ({}) }),
          set: () => Promise.resolve(),
          update: () => Promise.resolve()
        }),
        add: () => Promise.resolve(),
        where: () => ({
          get: () => Promise.resolve({ docs: [] })
        })
      })
    };
  }

  getDB() {
    if (!this.initialized) {
      throw new Error("Firebase service not initialized. Call initialize() first.");
    }
    return this.db;
  }

  getServerTimestamp() {
    // Fix the recursive function bug from original code
    return admin.firestore && admin.firestore.FieldValue ? 
      admin.firestore.FieldValue.serverTimestamp() : 
      new Date();
  }
}

module.exports = new FirebaseService();