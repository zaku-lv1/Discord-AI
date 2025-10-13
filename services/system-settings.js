const firebaseService = require("./firebase");
const crypto = require("crypto");

/**
 * System Settings Service
 * Manages system-wide configuration settings
 */
class SystemSettingsService {
  constructor() {
    this.settingsDocId = "main";
    this.defaultSettings = {
      requireInvitationCodes: true, // Require invitation codes by default (except for first owner)
      maintenanceMode: false,
      ownerSetupCompleted: false,
      ownerSetupKey: null,
      maintenanceMessage: "システムメンテナンス中です。しばらくお待ちください。",
      allowOpenRegistration: false, // Disable open registration by default - use invitation codes
      systemVersion: "1.0.0",
      lastModified: null,
      modifiedBy: null
    };
  }

  /**
   * Initialize system settings
   */
  async initialize() {
    try {
      const db = firebaseService.getDB();
      const settingsRef = db.collection("system_settings").doc(this.settingsDocId);
      const settingsDoc = await settingsRef.get();

      if (!settingsDoc.exists) {
        // Create default settings without owner setup key (no longer needed)
        const defaultSettings = {
          ...this.defaultSettings,
          ownerSetupKey: null, // No setup key required for owner setup
          createdAt: firebaseService.getServerTimestamp()
        };
        
        await settingsRef.set(defaultSettings);
        console.log("[情報] システム設定を初期化しました");
        console.log("[情報] オーナー設定キーは不要です - 誰でも最初のオーナーになれます");
      }

      return true;
    } catch (error) {
      console.error("[エラー] システム設定の初期化に失敗:", error);
      return false;
    }
  }

  /**
   * Generate a secure owner setup key
   */
  generateOwnerSetupKey() {
    return crypto.randomBytes(16).toString('hex').toUpperCase();
  }

  /**
   * Get all system settings
   */
  async getSettings() {
    try {
      const db = firebaseService.getDB();
      const settingsDoc = await db.collection("system_settings").doc(this.settingsDocId).get();
      
      if (settingsDoc.exists) {
        return settingsDoc.data();
      }
      
      return this.defaultSettings;
    } catch (error) {
      console.error("[エラー] システム設定の取得に失敗:", error);
      return this.defaultSettings;
    }
  }

  /**
   * Update system settings
   */
  async updateSettings(updates, modifiedBy) {
    try {
      const db = firebaseService.getDB();
      const settingsRef = db.collection("system_settings").doc(this.settingsDocId);
      
      // Add metadata
      const updateData = {
        ...updates,
        lastModified: firebaseService.getServerTimestamp(),
        modifiedBy: modifiedBy
      };

      await settingsRef.update(updateData);
      console.log("[情報] システム設定を更新しました:", Object.keys(updates).join(", "));
      return true;
    } catch (error) {
      console.error("[エラー] システム設定の更新に失敗:", error);
      throw error;
    }
  }

  /**
   * Check if setup key can be skipped (always true for owner setup when not completed)
   */
  async canSkipSetupKey() {
    try {
      const settings = await this.getSettings();
      
      // If owner setup is already completed, setup is no longer available
      if (settings.ownerSetupCompleted) {
        return false;
      }

      // For owner setup, setup key is never required - anyone can set up the first owner
      return true;
    } catch (error) {
      console.error("[エラー] セットアップキースキップ確認に失敗:", error);
      return true; // Default to allowing setup for initial owner
    }
  }

  /**
   * Validate owner setup key (always valid when owner setup not completed)
   */
  async validateOwnerSetupKey(inputKey) {
    try {
      const settings = await this.getSettings();
      
      // Check if owner setup is already completed
      if (settings.ownerSetupCompleted) {
        throw new Error("オーナー設定は既に完了しています");
      }

      // For owner setup, no key validation is required - anyone can set up the first owner
      return true;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Complete owner setup
   */
  async completeOwnerSetup(modifiedBy) {
    try {
      await this.updateSettings({
        ownerSetupCompleted: true,
        ownerSetupKey: null // Remove the key for security
      }, modifiedBy);
      
      console.log("[情報] オーナー設定が完了しました");
      return true;
    } catch (error) {
      console.error("[エラー] オーナー設定の完了に失敗:", error);
      throw error;
    }
  }

  /**
   * Check if maintenance mode is active
   */
  async isMaintenanceMode() {
    try {
      const settings = await this.getSettings();
      return settings.maintenanceMode || false;
    } catch (error) {
      console.error("[エラー] メンテナンスモードの確認に失敗:", error);
      return false;
    }
  }

  /**
   * Check if invitation codes are required for registration
   * Respects the system setting for requireInvitationCodes
   */
  async requiresInvitationCode() {
    try {
      // Check if there are any users in the system
      const firebaseService = require("./firebase");
      const db = firebaseService.getDB();
      const usersSnapshot = await db.collection('users').get();
      
      // If no users exist, this is the first user (owner) - no invitation required
      if (usersSnapshot.empty) {
        return false;
      }
      
      // After the first user exists, invitation codes are always required
      return true;
    } catch (error) {
      console.error("[エラー] 招待コード要件の確認に失敗:", error);
      return true; // Default to requiring invitation codes for security
    }
  }

  /**
   * Check if new user registration is allowed (Synapse-Note style)
   */
  async allowRegistration() {
    try {
      const db = firebaseService.getDB();
      
      // Check if allowRegistration is set in system settings
      const settingsDoc = await db.collection('system_settings').doc('general').get();
      if (settingsDoc.exists) {
        const settings = settingsDoc.data();
        // Default to true if not set
        return settings.allowRegistration !== false;
      }
      
      // Default to allowing registration
      return true;
    } catch (error) {
      console.error("[エラー] 登録許可の確認に失敗:", error);
      return true; // Default to allowing registration
    }
  }

  /**
   * Check if owner setup is completed
   */
  async isOwnerSetupCompleted() {
    try {
      const settings = await this.getSettings();
      return settings.ownerSetupCompleted || false;
    } catch (error) {
      console.error("[エラー] オーナー設定状況の確認に失敗:", error);
      return false;
    }
  }

  /**
   * Get maintenance message
   */
  async getMaintenanceMessage() {
    try {
      const settings = await this.getSettings();
      return settings.maintenanceMessage || this.defaultSettings.maintenanceMessage;
    } catch (error) {
      console.error("[エラー] メンテナンスメッセージの取得に失敗:", error);
      return this.defaultSettings.maintenanceMessage;
    }
  }

  /**
   * Transfer ownership to another user (ensures only one owner exists)
   */
  async transferOwnership(currentOwnerEmail, newOwnerEmail, modifiedBy) {
    try {
      const roleService = require("./roles");
      
      // Verify current owner
      const currentOwnerRole = await roleService.getUserRole(currentOwnerEmail);
      if (currentOwnerRole !== roleService.roles.OWNER) {
        throw new Error("現在のユーザーはオーナーではありません");
      }

      // Ensure new owner exists and is not already owner
      const newOwnerRole = await roleService.getUserRole(newOwnerEmail);
      if (newOwnerRole === roleService.roles.OWNER) {
        throw new Error("指定されたユーザーは既にオーナーです");
      }

      // Update roles atomically - first demote current owner, then promote new owner
      await roleService.updateUserRole(currentOwnerEmail, roleService.roles.EDITOR);
      await roleService.updateUserRole(newOwnerEmail, roleService.roles.OWNER);

      // Log the transfer
      await this.updateSettings({
        lastOwnershipTransfer: {
          from: currentOwnerEmail,
          to: newOwnerEmail,
          transferredAt: firebaseService.getServerTimestamp(),
          transferredBy: modifiedBy
        }
      }, modifiedBy);

      console.log("[情報] オーナー権限を移譲しました:", currentOwnerEmail, "→", newOwnerEmail);
      return true;
    } catch (error) {
      console.error("[エラー] オーナー権限の移譲に失敗:", error);
      throw error;
    }
  }
}

module.exports = new SystemSettingsService();