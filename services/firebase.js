const admin = require("firebase-admin");

class FirebaseService {
  constructor() {
    this.db = null;
    this.initialized = false;
    this.useMockDB = false;
    this.mockDB = null;
  }

  async initialize() {
    try {
      const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      if (!serviceAccountString) {
        throw new Error("環境変数 `FIREBASE_SERVICE_ACCOUNT_JSON` が設定されていません。");
      }
      
      // 開発環境またはテスト環境での簡易設定
      const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
      const isTest = process.env.NODE_ENV === 'test';
      const isExampleConfig = serviceAccountString.includes('your-project') || 
                              serviceAccountString.includes('your-firebase-project') ||
                              serviceAccountString.includes('test-project');
      
      if ((isDevelopment || isTest) && isExampleConfig) {
        console.log("[警告] 開発/テスト環境でのFirebase設定を使用しています。モックDBに切り替えます。");
        this.useMockDB = true;
        this.mockDB = this.createMockDB();
        this.db = this.createProxyDB();
        this.initialized = true;
        return;
      }

      // Validate service account JSON structure
      const serviceAccount = this.validateServiceAccountJSON(serviceAccountString);
      
      // Firebase Admin SDKが既に初期化されているかチェック
      if (!admin.apps.length) {
        admin.initializeApp({ 
          credential: admin.credential.cert(serviceAccount) 
        });
      }
      
      this.db = this.createProxyDB(admin.firestore());
      this.initialized = true;
      console.log("[情報] Firebase Admin SDKが正常に初期化されました。");
    } catch (error) {
      this.handleInitializationError(error);
    }
  }

  validateServiceAccountJSON(serviceAccountString) {
    try {
      const serviceAccount = JSON.parse(serviceAccountString);
      
      // Check required fields
      const requiredFields = [
        'type', 'project_id', 'private_key_id', 'private_key', 
        'client_email', 'client_id', 'auth_uri', 'token_uri'
      ];
      
      const missingFields = requiredFields.filter(field => !serviceAccount[field]);
      if (missingFields.length > 0) {
        throw new Error(`Firebase サービスアカウントJSONに必要なフィールドが不足しています: ${missingFields.join(', ')}`);
      }
      
      // Validate service account type
      if (serviceAccount.type !== 'service_account') {
        throw new Error('Firebase サービスアカウントJSONのtypeが "service_account" ではありません。');
      }
      
      // Validate private key format
      if (!serviceAccount.private_key.includes('BEGIN PRIVATE KEY') || 
          !serviceAccount.private_key.includes('END PRIVATE KEY')) {
        throw new Error('Firebase サービスアカウントJSONのprivate_keyの形式が正しくありません。');
      }
      
      // Validate email format
      if (!serviceAccount.client_email.includes('@') || 
          !serviceAccount.client_email.includes('.iam.gserviceaccount.com')) {
        throw new Error('Firebase サービスアカウントJSONのclient_emailの形式が正しくありません。');
      }
      
      return serviceAccount;
    } catch (parseError) {
      if (parseError.message.includes('Unexpected token')) {
        throw new Error('Firebase サービスアカウントJSONの形式が正しくありません。有効なJSONではありません。');
      }
      throw parseError;
    }
  }

  handleInitializationError(error) {
    const isAuthError = error.message.includes('UNAUTHENTICATED') ||
                       error.message.includes('authentication credentials') ||
                       error.message.includes('OAuth') ||
                       error.message.includes('private key') ||
                       error.code === 16;

    const isMissingCredentials = error.message.includes('環境変数') ||
                                error.message.includes('が設定されていません');

    if (isAuthError || isMissingCredentials) {
      if (isMissingCredentials) {
        console.error("[エラー] Firebase設定エラー:", error.message);
      } else {
        console.error("[エラー] Firebase認証エラー:", error.message);
      }
      
      console.log("\n=== Firebase設定ガイド ===");
      console.log("このエラーを解決するには:");
      console.log("1. Firebase Console (https://console.firebase.google.com) にアクセス");
      console.log("2. プロジェクト設定 → サービスアカウント → Firebase Admin SDK");
      console.log("3. '新しい秘密鍵の生成' ボタンをクリック");
      console.log("4. ダウンロードしたJSONファイルを開く");
      console.log("5. .env ファイルに以下の形式で設定:");
      console.log("   FIREBASE_SERVICE_ACCOUNT_JSON='{\"type\":\"service_account\",\"project_id\":\"your-project-id\",\"private_key_id\":\"...\",\"private_key\":\"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n\",\"client_email\":\"...\",\"client_id\":\"...\",\"auth_uri\":\"https://accounts.google.com/o/oauth2/auth\",\"token_uri\":\"https://oauth2.googleapis.com/token\"}'");
      console.log("6. .env ファイルを保存してアプリケーションを再起動");
      console.log("詳細な手順は FIREBASE_SETUP.md を参照してください。");
      console.log("========================\n");
    } else {
      console.error("[致命的エラー] Firebase Admin SDKの初期化に失敗しました:", error.message);
    }
    
    console.log("[情報] モックDBに切り替えて続行します。データは一時的にメモリに保存されます。");
    this.useMockDB = true;
    this.mockDB = this.createMockDB();
    this.db = this.createProxyDB();
    this.initialized = true;
  }

  createProxyDB(realDB = null) {
    // Create a proxy that handles authentication errors gracefully
    const mockDB = this.mockDB || this.createMockDB();
    
    // Helper function to create a query builder that supports chaining
    const createQueryBuilder = (collectionName, conditions = []) => {
      return {
        where: (field, operator, value) => {
          const newConditions = [...conditions, { field, operator, value }];
          return createQueryBuilder(collectionName, newConditions);
        },
        get: async () => {
          if (this.useMockDB || !realDB) {
            return this.executeMockQuery(mockDB, collectionName, conditions);
          }
          try {
            return await this.executeRealQuery(realDB, collectionName, conditions);
          } catch (error) {
            return this.handleFirebaseError(error, () => 
              this.executeMockQuery(mockDB, collectionName, conditions)
            );
          }
        }
      };
    };
    
    return {
      collection: (collectionName) => ({
        doc: (docId) => ({
          get: async () => {
            if (this.useMockDB || !realDB) {
              return mockDB.collection(collectionName).doc(docId).get();
            }
            try {
              return await realDB.collection(collectionName).doc(docId).get();
            } catch (error) {
              return this.handleFirebaseError(error, () => 
                mockDB.collection(collectionName).doc(docId).get()
              );
            }
          },
          set: async (data, options) => {
            if (this.useMockDB || !realDB) {
              return mockDB.collection(collectionName).doc(docId).set(data);
            }
            try {
              return await realDB.collection(collectionName).doc(docId).set(data, options);
            } catch (error) {
              return this.handleFirebaseError(error, () => 
                mockDB.collection(collectionName).doc(docId).set(data)
              );
            }
          },
          update: async (data) => {
            if (this.useMockDB || !realDB) {
              return mockDB.collection(collectionName).doc(docId).update(data);
            }
            try {
              return await realDB.collection(collectionName).doc(docId).update(data);
            } catch (error) {
              return this.handleFirebaseError(error, () => 
                mockDB.collection(collectionName).doc(docId).update(data)
              );
            }
          }
        }),
        add: async (data) => {
          if (this.useMockDB || !realDB) {
            return mockDB.collection(collectionName).add(data);
          }
          try {
            return await realDB.collection(collectionName).add(data);
          } catch (error) {
            return this.handleFirebaseError(error, () => 
              mockDB.collection(collectionName).add(data)
            );
          }
        },
        where: (field, operator, value) => {
          return createQueryBuilder(collectionName, [{ field, operator, value }]);
        },
        get: async () => {
          if (this.useMockDB || !realDB) {
            return mockDB.collection(collectionName).get();
          }
          try {
            return await realDB.collection(collectionName).get();
          } catch (error) {
            return this.handleFirebaseError(error, () => 
              mockDB.collection(collectionName).get()
            );
          }
        }
      })
    };
  }

  handleFirebaseError(error, fallbackOperation) {
    // Check if this is an authentication error
    if (error.code === 16 || 
        error.message.includes('UNAUTHENTICATED') ||
        error.message.includes('invalid authentication credentials') ||
        error.message.includes('OAuth 2 access token') ||
        error.message.includes('login cookie')) {
      
      console.error('[ERROR] ローカル認証エラー:', error.message);
      console.log('[INFO] Firebase認証に失敗しました。モックDBに切り替えています...');
      
      if (!this.useMockDB) {
        console.log("\n=== Firebase認証エラーの解決方法 ===");
        console.log("このエラーは以下の原因で発生します:");
        console.log("1. FIREBASE_SERVICE_ACCOUNT_JSON 環境変数が設定されていない");
        console.log("2. サービスアカウントJSONの形式が正しくない");
        console.log("3. サービスアカウントの権限が不足している");
        console.log("4. プロジェクトIDが間違っている");
        console.log("\n解決手順:");
        console.log("1. Firebase Console → プロジェクト設定 → サービスアカウント");
        console.log("2. '新しい秘密鍵の生成' をクリック");
        console.log("3. ダウンロードしたJSONの内容を .env に設定:");
        console.log("   FIREBASE_SERVICE_ACCOUNT_JSON='{\"type\":\"service_account\",...}'");
        console.log("詳細な手順は FIREBASE_SETUP.md を参照してください。");
        console.log("=====================================\n");
      }
      
      // Switch to mock DB for future operations
      this.useMockDB = true;
      if (!this.mockDB) {
        this.mockDB = this.createMockDB();
      }
      
      // Execute the fallback operation
      return fallbackOperation();
    }
    
    // Re-throw non-authentication errors
    throw error;
  }

  // Execute query with multiple conditions on mock database
  executeMockQuery(mockDB, collectionName, conditions) {
    let query = mockDB.collection(collectionName);
    for (const condition of conditions) {
      query = query.where(condition.field, condition.operator, condition.value);
    }
    return query.get();
  }

  // Execute query with multiple conditions on real Firestore database
  async executeRealQuery(realDB, collectionName, conditions) {
    let query = realDB.collection(collectionName);
    for (const condition of conditions) {
      query = query.where(condition.field, condition.operator, condition.value);
    }
    return await query.get();
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
          set: (data, options = {}) => {
            const key = `${collectionName}/${docId}`;
            if (options.merge) {
              const existing = storage.get(key) || {};
              storage.set(key, { ...existing, ...data });
            } else {
              storage.set(key, data);
            }
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
          return Promise.resolve({ id: docId });
        },
        get: async () => {
          // Get all documents in the collection
          const docs = [];
          for (const [key, data] of storage.entries()) {
            if (key.startsWith(`${collectionName}/`)) {
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
          return { 
            docs,
            empty: docs.length === 0,
            // Add forEach method to emulate Firestore QuerySnapshot
            forEach: (callback) => {
              docs.forEach(callback);
            }
          };
        },
        where: (field, operator, value) => {
          const createChainableQuery = (conditions) => ({
            where: (newField, newOperator, newValue) => {
              return createChainableQuery([...conditions, { field: newField, operator: newOperator, value: newValue }]);
            },
            get: () => {
              const docs = [];
              for (const [key, data] of storage.entries()) {
                if (key.startsWith(`${collectionName}/`)) {
                  // Check if data matches all conditions
                  const matchesAll = conditions.every(condition => {
                    switch (condition.operator) {
                      case '==':
                        return data[condition.field] === condition.value;
                      case '!=':
                        return data[condition.field] !== condition.value;
                      case '>':
                        return data[condition.field] > condition.value;
                      case '>=':
                        return data[condition.field] >= condition.value;
                      case '<':
                        return data[condition.field] < condition.value;
                      case '<=':
                        return data[condition.field] <= condition.value;
                      default:
                        return data[condition.field] === condition.value;
                    }
                  });
                  
                  if (matchesAll) {
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
              }
              return Promise.resolve({ 
                docs,
                empty: docs.length === 0,
                // Add forEach method to emulate Firestore QuerySnapshot
                forEach: (callback) => {
                  docs.forEach(callback);
                }
              });
            }
          });
          
          return createChainableQuery([{ field, operator, value }]);
        }
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
    // Also handle the case where we're using mock DB
    if (this.useMockDB || !admin.firestore || !admin.firestore.FieldValue) {
      return new Date();
    }
    return admin.firestore.FieldValue.serverTimestamp();
  }

  getArraySafeTimestamp() {
    // Always return a regular Date object for use in arrays
    // FieldValue.serverTimestamp() cannot be used inside arrays in Firestore
    return new Date();
  }

  // Add utility method to check if we're using mock DB
  isUsingMockDB() {
    return this.useMockDB;
  }

  // Add method to force switch to mock DB (useful for testing)
  switchToMockDB() {
    console.log('[INFO] 手動でモックDBに切り替えました');
    this.useMockDB = true;
    this.mockDB = this.createMockDB();
    this.db = this.createProxyDB();
  }

  // Add method to reset mock database (useful for testing)
  resetMockDB() {
    if (this.useMockDB && this.mockDB) {
      console.log('[INFO] モックDBをリセットしました');
      this.mockDB = this.createMockDB();
      this.db = this.createProxyDB();
    } else {
      console.log('[警告] モックDBが使用されていないため、リセットできません');
    }
  }
}

module.exports = new FirebaseService();