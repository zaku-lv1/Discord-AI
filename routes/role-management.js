const express = require("express");
const { verifyAuthentication, requireOwner, requireEditor } = require("../middleware/auth");
const roleService = require("../services/roles");
const firebaseService = require("../services/firebase");

const router = express.Router();

// Get all users with their roles (Owner only)
router.get("/users", verifyAuthentication, requireOwner, async (req, res) => {
  try {
    const users = await roleService.listUsersWithRoles();
    res.json({
      success: true,
      users: users
    });
  } catch (error) {
    console.error("ユーザー一覧取得エラー:", error);
    res.status(500).json({
      success: false,
      message: "ユーザー一覧の取得に失敗しました"
    });
  }
});

// Update user role (Owner only)
router.put("/users/:identifier/role", verifyAuthentication, requireOwner, async (req, res) => {
  try {
    const { identifier } = req.params; // Can be email or handle
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({
        success: false,
        message: "ロールが指定されていません"
      });
    }

    // Validate role
    if (!Object.values(roleService.roles).includes(role)) {
      return res.status(400).json({
        success: false,
        message: "無効なロールです"
      });
    }

    // Prevent changing own role to non-owner
    if ((req.user.email === identifier || req.user.handle === identifier) && role !== roleService.roles.OWNER) {
      return res.status(400).json({
        success: false,
        message: "自分のオーナー権限を削除することはできません"
      });
    }

    await roleService.updateUserRole(identifier, role);

    res.json({
      success: true,
      message: "ユーザーのロールを更新しました"
    });
  } catch (error) {
    console.error("ロール更新エラー:", error);
    res.status(500).json({
      success: false,
      message: error.message || "ロールの更新に失敗しました"
    });
  }
});

// Create invitation code for specific role (Owner only)
router.post("/invitation-codes", verifyAuthentication, requireOwner, async (req, res) => {
  try {
    const { targetRole } = req.body;

    if (!targetRole) {
      return res.status(400).json({
        success: false,
        message: "対象ロールが指定されていません"
      });
    }

    // Validate role
    if (!Object.values(roleService.roles).includes(targetRole)) {
      return res.status(400).json({
        success: false,
        message: "無効なロールです"
      });
    }

    // Only owners can create owner codes, editors can only create editor codes
    if (targetRole === roleService.roles.OWNER && 
        !roleService.hasRole(req.user.role, roleService.roles.OWNER)) {
      return res.status(403).json({
        success: false,
        message: "オーナーの招待コードはオーナーのみ作成できます"
      });
    }

    const code = await roleService.createInvitationCode(targetRole, req.user.email);

    res.json({
      success: true,
      code: code,
      targetRole: targetRole,
      targetRoleDisplay: roleService.displayNames[targetRole],
      message: `${roleService.displayNames[targetRole]}用の招待コードを作成しました`
    });
  } catch (error) {
    console.error("招待コード作成エラー:", error);
    res.status(500).json({
      success: false,
      message: "招待コードの作成に失敗しました"
    });
  }
});

// Use invitation code to upgrade role
router.post("/use-invitation-code", verifyAuthentication, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "招待コードが指定されていません"
      });
    }

    const result = await roleService.useInvitationCode(code, req.user.email);

    res.json({
      success: true,
      newRole: result.newRole,
      newRoleDisplay: result.roleDisplay,
      message: `ロールが${result.roleDisplay}に更新されました`
    });
  } catch (error) {
    console.error("招待コード使用エラー:", error);
    res.status(400).json({
      success: false,
      message: error.message || "招待コードの使用に失敗しました"
    });
  }
});

// Get available roles
router.get("/roles", verifyAuthentication, (req, res) => {
  const roles = Object.entries(roleService.displayNames).map(([key, display]) => ({
    key: key,
    display: display,
    level: roleService.hierarchy[key]
  }));

  res.json({
    success: true,
    roles: roles,
    currentRole: req.user.role,
    currentRoleDisplay: req.user.roleDisplay
  });
});

// Debug endpoint to troubleshoot role detection issues
router.get("/debug/user-role", verifyAuthentication, async (req, res) => {
  try {
    const { email, handle } = req.user;
    const db = firebaseService.getDB();
    
    // Check users collection
    const usersQuery = await db.collection('users').where('email', '==', email).get();
    const userData = usersQuery.empty ? null : usersQuery.docs[0].data();
    
    // Check legacy admin system
    const settingsDoc = await db.collection("bot_settings").doc("ai_profile").get();
    const legacyData = settingsDoc.exists ? settingsDoc.data() : null;
    const admins = legacyData?.admins || [];
    const adminEntry = admins.find(a => a.email === email);
    
    // Get current role determination
    const determinedRole = await roleService.getUserRole(email);
    
    res.json({
      success: true,
      debug: {
        userEmail: email,
        userHandle: handle,
        currentSessionRole: req.user.role,
        currentSessionRoleDisplay: req.user.roleDisplay,
        determinedRole: determinedRole,
        determinedRoleDisplay: roleService.displayNames[determinedRole],
        usersCollection: {
          found: !usersQuery.empty,
          data: userData
        },
        legacyAdminSystem: {
          totalAdmins: admins.length,
          userInAdmins: !!adminEntry,
          isFirstAdmin: adminEntry && admins[0].email === email,
          adminEntry: adminEntry,
          allAdmins: admins.map(a => ({ email: a.email, name: a.name }))
        }
      }
    });
  } catch (error) {
    console.error("Role debug error:", error);
    res.status(500).json({
      success: false,
      message: "デバッグ情報の取得に失敗しました",
      error: error.message
    });
  }
});

module.exports = router;