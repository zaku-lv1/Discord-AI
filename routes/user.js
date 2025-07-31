const express = require("express");
const { verifyAuthentication } = require("../middleware/auth");
const firebaseService = require("../services/firebase");

const router = express.Router();

// メールアドレス更新
router.post("/update-email", verifyAuthentication, async (req, res) => {
  try {
    const { oldEmail, newEmail } = req.body;
    const userEmail = req.user.email;
    const userDiscordId = req.user.id;

    // 権限チェック
    if (userEmail !== oldEmail) {
      return res.status(403).json({
        message: "他のユーザーのメールアドレスは更新できません。",
      });
    }

    // Firestoreでのメールアドレス更新
    const db = firebaseService.getDB();
    const settingsRef = db.collection("bot_settings").doc("ai_profile");
    const settingsDoc = await settingsRef.get();

    if (settingsDoc.exists) {
      const data = settingsDoc.data();
      const admins = Array.isArray(data.admins) ? data.admins : [];

      const updatedAdmins = admins.map((admin) => {
        if (admin.email === oldEmail || admin.discordId === userDiscordId) {
          return { ...admin, email: newEmail };
        }
        return admin;
      });

      await settingsRef.update({
        admins: updatedAdmins,
        updatedAt: firebaseService.getServerTimestamp(),
      });
    }

    res.json({
      message: "メールアドレスを更新しました。",
      email: newEmail,
    });
  } catch (error) {
    console.error("メールアドレス更新エラー:", error);
    res.status(500).json({
      message: "メールアドレスの更新中にエラーが発生しました。",
      details: error.message,
    });
  }
});

// プロファイル更新
router.post("/update-profile", verifyAuthentication, async (req, res) => {
  try {
    const { displayName, discordId } = req.body;
    const userDiscordId = req.user.id;
    const userEmail = req.user.email;

    console.log("プロファイル更新リクエスト:", {
      userDiscordId,
      userEmail,
      displayName,
      discordId,
      timestamp: new Date().toISOString(),
    });

    // 入力値の検証
    if (!displayName || typeof displayName !== "string") {
      return res.status(400).json({
        message: "表示名が正しく指定されていません。",
      });
    }

    // Discord IDの検証（オプション）
    if (discordId && !/^\d{17,19}$/.test(discordId)) {
      return res.status(400).json({
        message: "Discord IDは17-19桁の数字である必要があります。",
      });
    }

    // bot_settingsコレクションのai_profileドキュメントを取得
    const db = firebaseService.getDB();
    const settingsRef = db.collection("bot_settings").doc("ai_profile");
    const settingsDoc = await settingsRef.get();

    console.log("設定ドキュメントの存在:", settingsDoc.exists);

    let admins = [];
    if (settingsDoc.exists) {
      const data = settingsDoc.data();
      admins = Array.isArray(data.admins) ? data.admins : [];
    }

    console.log("現在の管理者リスト:", admins);

    // 管理者リストの更新（Discord IDまたはemailで検索）
    let updatedAdmins;
    const adminIndex = admins.findIndex((admin) => 
      admin.email === userEmail || admin.discordId === userDiscordId
    );

    if (adminIndex === -1) {
      // 新規ユーザーの場合は追加
      const newAdmin = {
        email: userEmail,
        discordId: userDiscordId,
        name: displayName,
        profileDiscordId: discordId || '',
        updatedAt: new Date().toISOString(),
      };
      
      // Optional fields - only add if they exist to avoid Firestore undefined errors
      if (req.user.username) newAdmin.username = req.user.username;
      if (req.user.discriminator) newAdmin.discriminator = req.user.discriminator;
      if (req.user.avatar) newAdmin.avatar = req.user.avatar;
      
      updatedAdmins = [...admins, newAdmin];
    } else {
      // 既存ユーザーの場合は更新
      updatedAdmins = admins.map((admin, index) => {
        if (index === adminIndex) {
          const updatedAdmin = {
            ...admin,
            name: displayName,
            discordId: userDiscordId,
            profileDiscordId: discordId || '',
            updatedAt: new Date().toISOString(),
          };
          
          // Optional fields - only add if they exist to avoid Firestore undefined errors
          if (req.user.username) updatedAdmin.username = req.user.username;
          if (req.user.discriminator) updatedAdmin.discriminator = req.user.discriminator;
          if (req.user.avatar) updatedAdmin.avatar = req.user.avatar;
          
          return updatedAdmin;
        }
        return admin;
      });
    }

    console.log("更新する管理者リスト:", updatedAdmins);

    // Firestoreの更新
    await settingsRef.set(
      {
        admins: updatedAdmins,
        updatedAt: firebaseService.getServerTimestamp(),
      },
      { merge: true }
    );

    console.log("データベース更新完了");

    // 成功レスポンス
    const responseData = {
      message: "プロファイルを更新しました。",
      displayName,
      username: req.user.username,
      avatar: req.user.avatar,
      discordId: userDiscordId,
      profileDiscordId: discordId || '',
      email: userEmail,
      timestamp: new Date().toISOString(),
    };
    
    // Optional fields - only add if they exist
    if (req.user.discriminator) responseData.discriminator = req.user.discriminator;
    
    res.json(responseData);
  } catch (error) {
    // エラーの詳細をログに記録
    console.error("プロファイル更新エラー:", {
      message: error.message,
      stack: error.stack,
      userEmail: req.user?.email,
      timestamp: new Date().toISOString(),
    });

    // クライアントへのエラーレスポンス
    res.status(500).json({
      message: "プロファイルの更新中にエラーが発生しました。",
      details: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Discord ID管理エンドポイント

// Discord ID/ニックネーム マッピング取得
router.get("/discord-mappings", verifyAuthentication, async (req, res) => {
  try {
    const db = firebaseService.getDB();
    const userEmail = req.user.email;
    
    // ユーザーのDiscord IDマッピングを取得
    const mappingsRef = db.collection("discord_id_mappings").doc(userEmail);
    const mappingsDoc = await mappingsRef.get();
    
    if (!mappingsDoc.exists) {
      return res.json({ mappings: {} });
    }
    
    const data = mappingsDoc.data();
    res.json({ mappings: data.mappings || {} });
  } catch (error) {
    console.error("Discord IDマッピング取得エラー:", error);
    res.status(500).json({
      message: "Discord IDマッピングの取得中にエラーが発生しました。",
      details: error.message,
    });
  }
});

// Discord ID/ニックネーム マッピング追加
router.post("/discord-mappings", verifyAuthentication, async (req, res) => {
  try {
    const { discordId, nickname } = req.body;
    const userEmail = req.user.email;
    
    // 入力値の検証
    if (!discordId || !nickname) {
      return res.status(400).json({
        message: "Discord IDとニックネームの両方が必要です。",
      });
    }
    
    // Discord IDの形式チェック（18桁の数字）
    if (!/^\d{17,19}$/.test(discordId)) {
      return res.status(400).json({
        message: "Discord IDは17-19桁の数字である必要があります。",
      });
    }
    
    const db = firebaseService.getDB();
    const mappingsRef = db.collection("discord_id_mappings").doc(userEmail);
    const mappingsDoc = await mappingsRef.get();
    
    let currentMappings = {};
    if (mappingsDoc.exists) {
      currentMappings = mappingsDoc.data().mappings || {};
    }
    
    // Discord IDが重複していないかチェック
    if (currentMappings[discordId]) {
      return res.status(400).json({
        message: "このDiscord IDは既に登録されています。",
      });
    }
    
    // 新しいマッピングを追加
    currentMappings[discordId] = {
      nickname: nickname.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await mappingsRef.set({
      mappings: currentMappings,
      updatedAt: firebaseService.getServerTimestamp(),
      userEmail: userEmail
    }, { merge: true });
    
    res.json({
      message: "Discord IDマッピングを追加しました。",
      discordId,
      nickname: nickname.trim(),
      mappings: currentMappings
    });
  } catch (error) {
    console.error("Discord IDマッピング追加エラー:", error);
    res.status(500).json({
      message: "Discord IDマッピングの追加中にエラーが発生しました。",
      details: error.message,
    });
  }
});

// Discord ID/ニックネーム マッピング更新
router.put("/discord-mappings/:discordId", verifyAuthentication, async (req, res) => {
  try {
    const { discordId } = req.params;
    const { nickname } = req.body;
    const userEmail = req.user.email;
    
    if (!nickname) {
      return res.status(400).json({
        message: "ニックネームが必要です。",
      });
    }
    
    const db = firebaseService.getDB();
    const mappingsRef = db.collection("discord_id_mappings").doc(userEmail);
    const mappingsDoc = await mappingsRef.get();
    
    if (!mappingsDoc.exists) {
      return res.status(404).json({
        message: "Discord IDマッピングが見つかりません。",
      });
    }
    
    const currentMappings = mappingsDoc.data().mappings || {};
    
    if (!currentMappings[discordId]) {
      return res.status(404).json({
        message: "指定されたDiscord IDが見つかりません。",
      });
    }
    
    // マッピングを更新
    currentMappings[discordId] = {
      ...currentMappings[discordId],
      nickname: nickname.trim(),
      updatedAt: new Date().toISOString()
    };
    
    await mappingsRef.update({
      mappings: currentMappings,
      updatedAt: firebaseService.getServerTimestamp()
    });
    
    res.json({
      message: "Discord IDマッピングを更新しました。",
      discordId,
      nickname: nickname.trim(),
      mappings: currentMappings
    });
  } catch (error) {
    console.error("Discord IDマッピング更新エラー:", error);
    res.status(500).json({
      message: "Discord IDマッピングの更新中にエラーが発生しました。",
      details: error.message,
    });
  }
});

// Discord ID/ニックネーム マッピング削除
router.delete("/discord-mappings/:discordId", verifyAuthentication, async (req, res) => {
  try {
    const { discordId } = req.params;
    const userEmail = req.user.email;
    
    const db = firebaseService.getDB();
    const mappingsRef = db.collection("discord_id_mappings").doc(userEmail);
    const mappingsDoc = await mappingsRef.get();
    
    if (!mappingsDoc.exists) {
      return res.status(404).json({
        message: "Discord IDマッピングが見つかりません。",
      });
    }
    
    const currentMappings = mappingsDoc.data().mappings || {};
    
    if (!currentMappings[discordId]) {
      return res.status(404).json({
        message: "指定されたDiscord IDが見つかりません。",
      });
    }
    
    // マッピングを削除
    delete currentMappings[discordId];
    
    await mappingsRef.update({
      mappings: currentMappings,
      updatedAt: firebaseService.getServerTimestamp()
    });
    
    res.json({
      message: "Discord IDマッピングを削除しました。",
      discordId,
      mappings: currentMappings
    });
  } catch (error) {
    console.error("Discord IDマッピング削除エラー:", error);
    res.status(500).json({
      message: "Discord IDマッピングの削除中にエラーが発生しました。",
      details: error.message,
    });
  }
});

module.exports = router;