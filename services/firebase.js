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
      
      // テスト環境での簡易設定
      if (serviceAccountString.includes('test-project') || 
          process.env.NODE_ENV === 'test' ||
          process.env.NODE_ENV === 'development') {
        console.log("[警告] テスト環境でのFirebase設定を使用しています。");
        this.useMockDB = true;
        this.mockDB = this.createMockDB();
        this.db = this.createProxyDB();
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
      
      this.db = this.createProxyDB(admin.firestore());
      this.initialized = true;
      console.log("[情報] Firebase Admin SDKが正常に初期化されました。");
    } catch (error) {
      console.error("[致命的エラー] Firebase Admin SDKの初期化に失敗しました:", error.message);
      console.log("[情報] テスト用のモックDBを使用します。");
      this.useMockDB = true;
      this.mockDB = this.createMockDB();
      this.db = this.createProxyDB();
      this.initialized = true;
    }
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
        }
      })
    };
  }

  handleFirebaseError(error, fallbackOperation) {
    // Check if this is an authentication error
    if (error.code === 16 || 
        error.message.includes('UNAUTHENTICATED') ||
        error.message.includes('invalid authentication credentials')) {
      
      console.error('[ERROR] ローカル認証エラー:', error.message);
      console.log('[INFO] モックDBに切り替えています...');
      
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
                empty: docs.length === 0
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
    if (!this.mockDB) {
      this.mockDB = this.createMockDB();
    }
  }
}

module.exports = new FirebaseService();