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
    // Simple in-memory storage for testing
    const storage = new Map();
    
    return {
      collection: (collectionName) => ({
        doc: (docId) => ({
          get: () => {
            const key = `${collectionName}/${docId}`;
            const data = storage.get(key);
            return Promise.resolve({ 
              exists: !!data, 
              data: () => data || {}
            });
          },
          set: (data) => {
            const key = `${collectionName}/${docId}`;
            storage.set(key, data);
            return Promise.resolve();
          },
          update: (data) => {
            const key = `${collectionName}/${docId}`;
            const existing = storage.get(key) || {};
            storage.set(key, { ...existing, ...data });
            return Promise.resolve();
          }
        }),
        add: (data) => {
          const docId = Date.now().toString();
          const key = `${collectionName}/${docId}`;
          storage.set(key, { ...data, id: docId });
          return Promise.resolve();
        },
        where: (field, operator, value) => ({
          get: () => {
            const docs = [];
            for (const [key, data] of storage.entries()) {
              if (key.startsWith(`${collectionName}/`) && data[field] === value) {
                docs.push({
                  data: () => data,
                  ref: {
                    update: (updateData) => {
                      storage.set(key, { ...data, ...updateData });
                      return Promise.resolve();
                    }
                  }
                });
              }
            }
            return Promise.resolve({ 
              docs,
              empty: docs.length === 0
            });
          }
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

  getArraySafeTimestamp() {
    // Always return a regular Date object for use in arrays
    // FieldValue.serverTimestamp() cannot be used inside arrays in Firestore
    return new Date();
  }
}

module.exports = new FirebaseService();