const express = require("express");
const systemSettingsService = require("../services/system-settings");
const authService = require("../services/auth");
const roleService = require("../services/roles");

const router = express.Router();

/**
 * Owner Setup Page - One-time setup for system owner
 */
router.get("/", async (req, res) => {
  try {
    // Check if owner setup is already completed
    const isCompleted = await systemSettingsService.isOwnerSetupCompleted();
    if (isCompleted) {
      // Return 404 if owner setup is already completed - this page should not be accessible
      return res.status(404).render("404", { 
        requestedPath: req.originalUrl
      });
    }

    // Check if setup key can be skipped (always true when owner setup not completed)
    const canSkipSetupKey = await systemSettingsService.canSkipSetupKey();

    res.render("owner-setup", { 
      completed: false,
      canSkipSetupKey: canSkipSetupKey
    });
  } catch (error) {
    console.error("[エラー] オーナー設定ページの表示に失敗:", error);
    res.render("owner-setup", { 
      error: "システムエラーが発生しました",
      completed: false,
      canSkipSetupKey: false
    });
  }
});

/**
 * Process Owner Setup
 */
router.post("/", async (req, res) => {
  try {
    // Check if owner setup is already completed - this must be the first check
    const isCompleted = await systemSettingsService.isOwnerSetupCompleted();
    if (isCompleted) {
      return res.status(404).json({
        success: false,
        message: "このページは利用できません"
      });
    }

    const { setupKey, username, password, confirmPassword } = req.body;

    // Check if setup key can be skipped (always true when owner setup not completed)
    const canSkipSetupKey = await systemSettingsService.canSkipSetupKey();

    // Validate required fields (setupKey and email are not required for owner setup)
    if (!username || !password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "全ての項目を入力してください"
      });
    }

    // Validate password confirmation
    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "パスワードが一致しません"
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "パスワードは6文字以上で入力してください"
      });
    }

    // Validate owner setup (no key required)
    await systemSettingsService.validateOwnerSetupKey(setupKey);

    // Create owner account
    const user = await authService.createLocalUser(
      username, 
      password, 
      null, // Email is optional now
      true, // Skip email verification for owner setup
      null  // No invitation code needed
    );

    // Note: The auth service automatically assigns OWNER role to first user
    // No need to call roleService.updateUserRole here

    // Complete owner setup
    await systemSettingsService.completeOwnerSetup(user.email);

    res.json({
      success: true,
      message: "オーナーアカウントが正常に作成されました。ログインしてください。",
      user: {
        handle: user.handle,
        email: user.email,
        role: roleService.roles.OWNER
      }
    });

  } catch (error) {
    console.error("[エラー] オーナー設定の処理に失敗:", error);
    res.status(400).json({
      success: false,
      message: error.message || "オーナー設定に失敗しました"
    });
  }
});

/**
 * Check owner setup status
 */
router.get("/status", async (req, res) => {
  try {
    const isCompleted = await systemSettingsService.isOwnerSetupCompleted();
    const canSkipSetupKey = await systemSettingsService.canSkipSetupKey();
    res.json({
      success: true,
      completed: isCompleted,
      canSkipSetupKey: canSkipSetupKey
    });
  } catch (error) {
    console.error("[エラー] オーナー設定状況の確認に失敗:", error);
    res.status(500).json({
      success: false,
      message: "システムエラーが発生しました"
    });
  }
});

module.exports = router;