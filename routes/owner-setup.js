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
      return res.render("owner-setup", { 
        error: "オーナー設定は既に完了しています",
        completed: true 
      });
    }

    res.render("owner-setup", { completed: false });
  } catch (error) {
    console.error("[エラー] オーナー設定ページの表示に失敗:", error);
    res.render("owner-setup", { 
      error: "システムエラーが発生しました",
      completed: false 
    });
  }
});

/**
 * Process Owner Setup
 */
router.post("/", async (req, res) => {
  try {
    const { setupKey, username, email, password, confirmPassword } = req.body;

    // Validate required fields
    if (!setupKey || !username || !email || !password || !confirmPassword) {
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

    // Check if owner setup is already completed
    const isCompleted = await systemSettingsService.isOwnerSetupCompleted();
    if (isCompleted) {
      return res.status(400).json({
        success: false,
        message: "オーナー設定は既に完了しています"
      });
    }

    // Validate setup key
    await systemSettingsService.validateOwnerSetupKey(setupKey);

    // Create owner account
    const user = await authService.createLocalUser(
      username, 
      password, 
      email, 
      true, // Skip email verification for owner setup
      null  // No invitation code needed
    );

    // Note: The auth service automatically assigns OWNER role to first user
    // No need to call roleService.updateUserRole here

    // Complete owner setup
    await systemSettingsService.completeOwnerSetup(email);

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
    res.json({
      success: true,
      completed: isCompleted
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