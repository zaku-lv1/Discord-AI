const express = require("express");
const { verifyAuthentication, requireOwner } = require("../middleware/auth");
const systemSettingsService = require("../services/system-settings");
const roleService = require("../services/roles");

const router = express.Router();

/**
 * Get system settings (Owner only)
 */
router.get("/", verifyAuthentication, requireOwner, async (req, res) => {
  try {
    const settings = await systemSettingsService.getSettings();
    
    // Don't expose sensitive data
    const safeSettings = {
      requireInvitationCodes: settings.requireInvitationCodes,
      maintenanceMode: settings.maintenanceMode,
      maintenanceMessage: settings.maintenanceMessage,
      allowOpenRegistration: settings.allowOpenRegistration,
      systemVersion: settings.systemVersion,
      lastModified: settings.lastModified,
      modifiedBy: settings.modifiedBy,
      lastOwnershipTransfer: settings.lastOwnershipTransfer
    };

    res.json({
      success: true,
      settings: safeSettings,
      currentUser: {
        email: req.user.email,
        role: req.user.role,
        roleDisplay: req.user.roleDisplay
      }
    });
  } catch (error) {
    console.error("[エラー] システム設定の取得に失敗:", error);
    res.status(500).json({
      success: false,
      message: "システム設定の取得に失敗しました"
    });
  }
});

/**
 * Update system settings (Owner only)
 */
router.put("/", verifyAuthentication, requireOwner, async (req, res) => {
  try {
    const {
      requireInvitationCodes,
      maintenanceMode,
      maintenanceMessage,
      allowOpenRegistration
    } = req.body;

    const updates = {};

    // Validate and set each setting
    if (typeof requireInvitationCodes === 'boolean') {
      updates.requireInvitationCodes = requireInvitationCodes;
    }

    if (typeof maintenanceMode === 'boolean') {
      updates.maintenanceMode = maintenanceMode;
    }

    if (typeof allowOpenRegistration === 'boolean') {
      updates.allowOpenRegistration = allowOpenRegistration;
    }

    if (maintenanceMessage && typeof maintenanceMessage === 'string') {
      updates.maintenanceMessage = maintenanceMessage.trim();
    }

    // Update settings
    await systemSettingsService.updateSettings(updates, req.user.email);

    res.json({
      success: true,
      message: "システム設定を更新しました",
      updatedFields: Object.keys(updates)
    });
  } catch (error) {
    console.error("[エラー] システム設定の更新に失敗:", error);
    res.status(500).json({
      success: false,
      message: error.message || "システム設定の更新に失敗しました"
    });
  }
});

/**
 * Transfer ownership (Owner only)
 */
router.post("/transfer-ownership", verifyAuthentication, requireOwner, async (req, res) => {
  try {
    const { newOwnerEmail, confirmEmail } = req.body;

    if (!newOwnerEmail || !confirmEmail) {
      return res.status(400).json({
        success: false,
        message: "新しいオーナーのメールアドレスを入力してください"
      });
    }

    if (newOwnerEmail !== confirmEmail) {
      return res.status(400).json({
        success: false,
        message: "メールアドレスが一致しません"
      });
    }

    if (newOwnerEmail === req.user.email) {
      return res.status(400).json({
        success: false,
        message: "自分自身に権限を移譲することはできません"
      });
    }

    // Check if target user exists
    const targetUserRole = await roleService.getUserRole(newOwnerEmail);
    if (targetUserRole === roleService.roles.EDITOR || !targetUserRole) {
      // Target user must exist and be an editor to be eligible for ownership transfer
      if (!targetUserRole) {
        return res.status(400).json({
          success: false,
          message: "指定されたユーザーが見つからないか、システムに登録されていません"
        });
      }
    }

    // Transfer ownership
    await systemSettingsService.transferOwnership(
      req.user.email,
      newOwnerEmail,
      req.user.email
    );

    res.json({
      success: true,
      message: `オーナー権限を ${newOwnerEmail} に移譲しました`,
      newOwner: newOwnerEmail,
      formerOwner: req.user.email
    });
  } catch (error) {
    console.error("[エラー] オーナー権限の移譲に失敗:", error);
    res.status(500).json({
      success: false,
      message: error.message || "オーナー権限の移譲に失敗しました"
    });
  }
});

/**
 * Get system status (for public checks)
 */
router.get("/status", async (req, res) => {
  try {
    const isMaintenanceMode = await systemSettingsService.isMaintenanceMode();
    const requiresInvitation = await systemSettingsService.requiresInvitationCode();
    const isOwnerSetupCompleted = await systemSettingsService.isOwnerSetupCompleted();

    res.json({
      success: true,
      status: {
        maintenanceMode: isMaintenanceMode,
        requireInvitationCodes: requiresInvitation,
        ownerSetupCompleted: isOwnerSetupCompleted,
        maintenanceMessage: isMaintenanceMode ? await systemSettingsService.getMaintenanceMessage() : null
      }
    });
  } catch (error) {
    console.error("[エラー] システム状況の確認に失敗:", error);
    res.status(500).json({
      success: false,
      message: "システム状況の確認に失敗しました"
    });
  }
});

/**
 * Get available users for ownership transfer (Owner only)
 */
router.get("/users-for-transfer", verifyAuthentication, requireOwner, async (req, res) => {
  try {
    const users = await roleService.listUsersWithRoles();
    
    // Filter out the current owner and only include editor level users
    const eligibleUsers = users.filter(user => 
      user.email !== req.user.email &&
      roleService.hasRole(user.role, roleService.roles.EDITOR) &&
      user.verified
    );

    res.json({
      success: true,
      users: eligibleUsers.map(user => ({
        email: user.email,
        handle: user.handle,
        displayName: user.displayName,
        role: user.role,
        roleDisplay: user.roleDisplay
      }))
    });
  } catch (error) {
    console.error("[エラー] 移譲対象ユーザー一覧の取得に失敗:", error);
    res.status(500).json({
      success: false,
      message: "移譲対象ユーザー一覧の取得に失敗しました"
    });
  }
});

module.exports = router;