const firebaseService = require('./firebase');

/**
 * Service for managing conversation history in Firestore
 * Stores conversation history per channel for persistent AI conversations
 */
class ConversationHistoryStore {
  constructor() {
    this.useFirestore = false;
    this.memoryCache = new Map(); // Fallback in-memory storage
  }

  /**
   * Initialize Firestore connection
   */
  async initialize() {
    try {
      await firebaseService.initialize();
      
      if (!firebaseService.isUsingMockDB()) {
        this.useFirestore = true;
        console.log('[INFO] Conversation history store initialized with Firestore');
      } else {
        console.log('[INFO] Conversation history store using in-memory storage (Firebase not configured)');
      }
    } catch (error) {
      console.log('[INFO] Conversation history store using in-memory storage:', error.message);
      this.useFirestore = false;
    }
  }

  /**
   * Get conversation history for a specific channel
   * @param {string} channelId - Discord channel ID
   * @returns {Promise<Array>} Array of conversation messages
   */
  async getHistory(channelId) {
    if (this.useFirestore) {
      return await this.getHistoryFromFirestore(channelId);
    }
    return this.getHistoryFromMemory(channelId);
  }

  /**
   * Get conversation history from Firestore
   */
  async getHistoryFromFirestore(channelId) {
    try {
      const db = firebaseService.getDB();
      const docRef = db.collection('conversations').doc(channelId);
      const doc = await docRef.get();
      
      if (doc.exists) {
        const data = doc.data();
        return data.history || [];
      }
      return [];
    } catch (error) {
      console.error('[ERROR] Failed to get conversation history from Firestore:', error);
      return this.getHistoryFromMemory(channelId);
    }
  }

  /**
   * Get conversation history from memory
   */
  getHistoryFromMemory(channelId) {
    return this.memoryCache.get(channelId) || [];
  }

  /**
   * Save conversation history for a specific channel
   * @param {string} channelId - Discord channel ID
   * @param {Array} history - Array of conversation messages
   */
  async saveHistory(channelId, history) {
    if (this.useFirestore) {
      await this.saveHistoryToFirestore(channelId, history);
    } else {
      this.saveHistoryToMemory(channelId, history);
    }
  }

  /**
   * Save conversation history to Firestore
   */
  async saveHistoryToFirestore(channelId, history) {
    try {
      const db = firebaseService.getDB();
      const docRef = db.collection('conversations').doc(channelId);
      
      await docRef.set({
        channelId,
        history,
        lastUpdated: firebaseService.getServerTimestamp()
      }, { merge: true });
      
      console.log(`[INFO] Conversation history saved to Firestore for channel ${channelId}`);
    } catch (error) {
      console.error('[ERROR] Failed to save conversation history to Firestore:', error);
      // Fallback to memory storage
      this.saveHistoryToMemory(channelId, history);
    }
  }

  /**
   * Save conversation history to memory
   */
  saveHistoryToMemory(channelId, history) {
    this.memoryCache.set(channelId, history);
  }

  /**
   * Add a message to conversation history
   * @param {string} channelId - Discord channel ID
   * @param {Object} userMessage - User message object
   * @param {Object} modelMessage - AI model response object
   */
  async addMessage(channelId, userMessage, modelMessage) {
    const history = await this.getHistory(channelId);
    
    history.push(userMessage, modelMessage);
    
    // Keep only last 60 messages (30 exchanges)
    const maxMessages = 60;
    while (history.length > maxMessages) {
      history.shift();
    }
    
    await this.saveHistory(channelId, history);
  }

  /**
   * Clear conversation history for a specific channel
   * @param {string} channelId - Discord channel ID
   */
  async clearHistory(channelId) {
    if (this.useFirestore) {
      try {
        const db = firebaseService.getDB();
        const docRef = db.collection('conversations').doc(channelId);
        await docRef.set({
          channelId,
          history: [],
          lastUpdated: firebaseService.getServerTimestamp()
        });
        console.log(`[INFO] Conversation history cleared in Firestore for channel ${channelId}`);
      } catch (error) {
        console.error('[ERROR] Failed to clear conversation history in Firestore:', error);
      }
    }
    this.memoryCache.delete(channelId);
  }

  /**
   * Get all channel IDs with stored conversations
   * @returns {Promise<Array<string>>} Array of channel IDs
   */
  async getAllChannelIds() {
    if (this.useFirestore) {
      try {
        const db = firebaseService.getDB();
        const snapshot = await db.collection('conversations').get();
        return snapshot.docs.map(doc => doc.data().channelId);
      } catch (error) {
        console.error('[ERROR] Failed to get channel IDs from Firestore:', error);
        return Array.from(this.memoryCache.keys());
      }
    }
    return Array.from(this.memoryCache.keys());
  }
}

module.exports = new ConversationHistoryStore();
