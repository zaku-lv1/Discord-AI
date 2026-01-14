const fs = require('fs').promises;
const path = require('path');

class AIConfigStore {
  constructor() {
    this.configPath = path.join(__dirname, '../data/ai-config.json');
    this.cache = null;
    this.lastModified = null;
  }

  /**
   * Read AI configuration from file
   * Uses caching with file modification time check for performance
   */
  async getConfig() {
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
        const defaultConfig = {
          botName: "AI Assistant",
          botIconUrl: "",
          systemPrompt: "あなたは親しみやすくフレンドリーなAIアシスタントです。自然で親しみやすい口調で話してください。",
          modelMode: "hybrid",
          replyDelayMs: 0,
          errorOopsMessage: "ちょっと調子が悪いみたい...ごめんね！"
        };
        await this.saveConfig(defaultConfig);
        return defaultConfig;
      }
      throw error;
    }
  }

  /**
   * Save AI configuration to file
   */
  async saveConfig(config) {
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

      console.log('[INFO] AI config saved successfully');
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
