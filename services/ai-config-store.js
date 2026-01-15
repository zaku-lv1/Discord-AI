const fs = require('fs').promises;
const path = require('path');

class AIConfigStore {
  constructor() {
    this.configPath = path.join(__dirname, '../data/ai-config.json');
    this.cache = null;
    this.lastModified = null;
    this.firebaseService = null;
    this.useFirestore = false;
  }

  /**
   * Initialize Firestore connection
   * In test/production environments, Firestore is required and will fail if not configured
   * In development environment, falls back to file-based storage if Firebase is not configured
   */
  async initializeFirestore() {
    try {
      // Lazy load firebase service to avoid circular dependencies
      if (!this.firebaseService) {
        this.firebaseService = require('./firebase');
      }
      
      await this.firebaseService.initialize();
      
      const isTest = process.env.NODE_ENV === 'test';
      const isProduction = process.env.NODE_ENV === 'production';
      const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
      
      // Check if Firebase is actually configured (not using mock DB)
      if (!this.firebaseService.isUsingMockDB()) {
        this.useFirestore = true;
        console.log('[INFO] AI config store initialized with Firestore');
      } else {
        // test/本番環境ではFirestoreが必須
        if (isTest || isProduction) {
          const errorMsg = `[致命的エラー] ${process.env.NODE_ENV}環境ではFirestoreが必須です。AI config storeの初期化に失敗しました。`;
          console.error(errorMsg);
          throw new Error(errorMsg);
        }
        // 開発環境のみファイルベースストレージへのフォールバックを許可
        console.log('[INFO] 開発環境のため、AI config storeはファイルベースストレージを使用します（Firebase未設定）');
      }
    } catch (error) {
      const isTest = process.env.NODE_ENV === 'test';
      const isProduction = process.env.NODE_ENV === 'production';
      
      // test/本番環境ではエラーを再スロー
      if (isTest || isProduction) {
        console.error(`[致命的エラー] ${process.env.NODE_ENV}環境でのAI config store初期化に失敗:`, error.message);
        throw error;
      }
      
      // 開発環境のみファイルベースストレージへのフォールバックを許可
      console.log('[INFO] 開発環境のため、AI config storeはファイルベースストレージを使用します:', error.message);
      this.useFirestore = false;
    }
  }

  /**
   * Read AI configuration from file or Firestore
   * Uses caching with file modification time check for performance
   */
  async getConfig() {
    // Use Firestore if available
    if (this.useFirestore) {
      return await this.getConfigFromFirestore();
    }
    
    // Fall back to file-based storage
    return await this.getConfigFromFile();
  }

  /**
   * Get configuration from Firestore
   */
  async getConfigFromFirestore() {
    try {
      const db = this.firebaseService.getDB();
      const docRef = db.collection('settings').doc('ai-config');
      const doc = await docRef.get();
      
      if (doc.exists) {
        return doc.data();
      } else {
        // Create default config if it doesn't exist
        const defaultConfig = this.getDefaultConfig();
        await docRef.set(defaultConfig);
        return defaultConfig;
      }
    } catch (error) {
      console.error('[ERROR] Failed to get config from Firestore:', error);
      
      const isTest = process.env.NODE_ENV === 'test';
      const isProduction = process.env.NODE_ENV === 'production';
      
      // test/本番環境ではエラーを再スロー（フォールバックしない）
      if (isTest || isProduction) {
        throw error;
      }
      
      // 開発環境のみファイルベースストレージへのフォールバックを許可
      console.log('[INFO] 開発環境のため、ファイルベースストレージにフォールバックします');
      return await this.getConfigFromFile();
    }
  }

  /**
   * Get configuration from file
   */
  async getConfigFromFile() {
    try {
      const stats = await fs.stat(this.configPath);
      const currentMtime = stats.mtime.getTime();

      // Return cache if file hasn't been modified
      if (this.cache && this.lastModified === currentMtime) {
        return this.cache;
      }

      // Read and parse config file
      const data = await fs.readFile(this.configPath, 'utf8');
      const config = JSON.parse(data);

      // Update cache
      this.cache = config;
      this.lastModified = currentMtime;

      return config;
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('[INFO] Config file not found, creating default config...');
        const defaultConfig = this.getDefaultConfig();
        await this.saveConfigToFile(defaultConfig);
        return defaultConfig;
      }
      throw error;
    }
  }

  /**
   * Get default configuration
   */
  getDefaultConfig() {
    return {
      botName: "AI Assistant",
      botIconUrl: "",
      systemPrompt: "あなたは親しみやすくフレンドリーなAIアシスタントです。自然で親しみやすい口調で話してください。",
      modelMode: "hybrid",
      replyDelayMs: 0,
      errorOopsMessage: "ちょっと調子が悪いみたい...ごめんね！",
      userNicknames: {} // Discord ID to nickname mapping: { "discordId": "nickname" }
    };
  }

  /**
   * Save AI configuration to file or Firestore
   */
  async saveConfig(config) {
    // Use Firestore if available
    if (this.useFirestore) {
      return await this.saveConfigToFirestore(config);
    }
    
    // Fall back to file-based storage
    return await this.saveConfigToFile(config);
  }

  /**
   * Save configuration to Firestore
   */
  async saveConfigToFirestore(config) {
    try {
      const db = this.firebaseService.getDB();
      const docRef = db.collection('settings').doc('ai-config');
      await docRef.set(config, { merge: true });
      console.log('[INFO] AI config saved to Firestore successfully');
    } catch (error) {
      console.error('[ERROR] Failed to save config to Firestore:', error);
      
      const isTest = process.env.NODE_ENV === 'test';
      const isProduction = process.env.NODE_ENV === 'production';
      
      // test/本番環境ではエラーを再スロー（フォールバックしない）
      if (isTest || isProduction) {
        throw error;
      }
      
      // 開発環境のみファイルベースストレージへのフォールバックを許可
      console.log('[INFO] 開発環境のため、ファイルベースストレージにフォールバックします');
      await this.saveConfigToFile(config);
    }
  }

  /**
   * Save configuration to file
   */
  async saveConfigToFile(config) {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.configPath);
      await fs.mkdir(dataDir, { recursive: true });

      // Write config to file with pretty formatting
      await fs.writeFile(
        this.configPath,
        JSON.stringify(config, null, 2),
        'utf8'
      );

      // Update cache with current file modification time
      const stats = await fs.stat(this.configPath);
      this.cache = config;
      this.lastModified = stats.mtime.getTime();

      console.log('[INFO] AI config saved to file successfully');
    } catch (error) {
      console.error('[ERROR] Failed to save AI config:', error);
      throw error;
    }
  }

  /**
   * Update specific fields in the configuration
   */
  async updateConfig(updates) {
    const currentConfig = await this.getConfig();
    const newConfig = { ...currentConfig, ...updates };
    await this.saveConfig(newConfig);
    return newConfig;
  }
}

module.exports = new AIConfigStore();
