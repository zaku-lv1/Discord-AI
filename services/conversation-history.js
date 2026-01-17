const firebaseService = require('./firebase');

/**
 * Service for managing conversation history in Firebase
 * Stores conversation history per channel to enable persistent conversations
 */
class ConversationHistoryService {
  constructor() {
    this.maxHistorySize = 60; // Maximum number of messages to keep in history
    this.memoryCache = new Map(); // In-memory cache for performance
  }

  /**
   * Generate a unique key for a conversation
   * @param {string} channelId - Discord channel ID
   * @param {string} botName - AI bot name
   * @returns {string} Unique conversation key
   */
  getConversationKey(channelId, botName) {
    return `${channelId}_${botName}`;
  }

  /**
   * Get conversation history from Firebase or cache
   * @param {string} channelId - Discord channel ID
   * @param {string} botName - AI bot name
   * @returns {Promise<Array>} Array of conversation messages
   */
  async getHistory(channelId, botName) {
    const conversationKey = this.getConversationKey(channelId, botName);
    
    // Check memory cache first
    if (this.memoryCache.has(conversationKey)) {
      return this.memoryCache.get(conversationKey);
    }

    try {
      // Try to get from Firebase (skip if using mock DB)
      if (!firebaseService.isUsingMockDB()) {
        const db = firebaseService.getDB();
        const docRef = db.collection('conversation_history').doc(conversationKey);
        const doc = await docRef.get();
        
        if (doc.exists) {
          const data = doc.data();
          const history = data.messages || [];
          
          // Update cache
          this.memoryCache.set(conversationKey, history);
          
          return history;
        }
      }
    } catch (error) {
      console.error('[ERROR] Failed to get conversation history from Firebase:', error);
    }

    // Return empty history if not found
    return [];
  }

  /**
   * Save conversation history to Firebase
   * @param {string} channelId - Discord channel ID
   * @param {string} botName - AI bot name
   * @param {Array} history - Conversation history array
   * @returns {Promise<void>}
   */
  async saveHistory(channelId, botName, history) {
    const conversationKey = this.getConversationKey(channelId, botName);
    
    // Trim history if it exceeds max size
    let trimmedHistory = history;
    if (history.length > this.maxHistorySize) {
      trimmedHistory = history.slice(history.length - this.maxHistorySize);
    }

    // Update memory cache
    this.memoryCache.set(conversationKey, trimmedHistory);

    try {
      // Save to Firebase (skip if using mock DB)
      if (!firebaseService.isUsingMockDB()) {
        const db = firebaseService.getDB();
        const docRef = db.collection('conversation_history').doc(conversationKey);
        
        await docRef.set({
          channelId,
          botName,
          messages: trimmedHistory,
          messageCount: trimmedHistory.length,
          updatedAt: firebaseService.getServerTimestamp()
        }, { merge: true });
        
        console.log(`[INFO] Conversation history saved to Firebase for ${conversationKey}`);
      }
    } catch (error) {
      console.error('[ERROR] Failed to save conversation history to Firebase:', error);
      // Continue with in-memory storage as fallback
    }
  }

  /**
   * Add a message pair (user + AI response) to conversation history
   * @param {string} channelId - Discord channel ID
   * @param {string} botName - AI bot name
   * @param {string} userMessage - User's message
   * @param {string} aiResponse - AI's response
   * @returns {Promise<Array>} Updated conversation history
   */
  async addMessage(channelId, botName, userMessage, aiResponse) {
    const history = await this.getHistory(channelId, botName);
    
    // Add new message pair using push for better performance
    // Avoid spread operator which creates new array copies
    history.push({ role: "user", parts: [{ text: userMessage }] });
    history.push({ role: "model", parts: [{ text: aiResponse }] });

    // Save updated history (will handle trimming)
    await this.saveHistory(channelId, botName, history);
    
    return history;
  }

  /**
   * Clear conversation history for a specific channel/bot
   * @param {string} channelId - Discord channel ID
   * @param {string} botName - AI bot name
   * @returns {Promise<void>}
   */
  async clearHistory(channelId, botName) {
    const conversationKey = this.getConversationKey(channelId, botName);
    
    // Remove from memory cache
    this.memoryCache.delete(conversationKey);

    try {
      // Remove from Firebase
      if (!firebaseService.isUsingMockDB()) {
        const db = firebaseService.getDB();
        const docRef = db.collection('conversation_history').doc(conversationKey);
        await docRef.delete();
        
        console.log(`[INFO] Conversation history cleared from Firebase for ${conversationKey}`);
      }
    } catch (error) {
      console.error('[ERROR] Failed to clear conversation history from Firebase:', error);
    }
  }

  /**
   * Get all conversation keys for a channel (useful for cleanup)
   * @param {string} channelId - Discord channel ID
   * @returns {Promise<Array>} Array of conversation keys
   */
  async getChannelConversations(channelId) {
    try {
      if (!firebaseService.isUsingMockDB()) {
        const db = firebaseService.getDB();
        const snapshot = await db.collection('conversation_history')
          .where('channelId', '==', channelId)
          .get();
        
        const conversations = [];
        snapshot.forEach(doc => {
          conversations.push({
            id: doc.id,
            ...doc.data()
          });
        });
        
        return conversations;
      }
    } catch (error) {
      console.error('[ERROR] Failed to get channel conversations from Firebase:', error);
    }

    return [];
  }

  /**
   * Clear all conversations for a channel
   * @param {string} channelId - Discord channel ID
   * @returns {Promise<void>}
   */
  async clearChannelHistory(channelId) {
    try {
      const conversations = await this.getChannelConversations(channelId);
      
      for (const conversation of conversations) {
        // Support both new botName field and legacy webhookName field for backward compatibility
        const nameToUse = conversation.botName || conversation.webhookName;
        if (nameToUse) {
          await this.clearHistory(channelId, nameToUse);
        }
      }
      
      console.log(`[INFO] All conversation history cleared for channel ${channelId}`);
    } catch (error) {
      console.error('[ERROR] Failed to clear channel history:', error);
    }
  }
}

module.exports = new ConversationHistoryService();
