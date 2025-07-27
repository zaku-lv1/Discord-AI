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
    const settingsRef = db.collection("bot_settings").doc("toka_profile");
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
    const { displayName } = req.body;
    const userDiscordId = req.user.id;
    const userEmail = req.user.email;

    console.log("プロファイル更新リクエスト:", {
      userDiscordId,
      userEmail,
      displayName,
      timestamp: new Date().toISOString(),
    });

    // 入力値の検証
    if (!displayName || typeof displayName !== "string") {
      return res.status(400).json({
        message: "表示名が正しく指定されていません。",
      });
    }

    // bot_settingsコレクションのtoka_profileドキュメントを取得
    const db = firebaseService.getDB();
    const settingsRef = db.collection("bot_settings").doc("toka_profile");
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
      updatedAdmins = [
        ...admins,
        {
          email: userEmail,
          discordId: userDiscordId,
          name: displayName,
          username: req.user.username,
          discriminator: req.user.discriminator,
          avatar: req.user.avatar,
          updatedAt: new Date().toISOString(),
        },
      ];
    } else {
      // 既存ユーザーの場合は更新
      updatedAdmins = admins.map((admin, index) => {
        if (index === adminIndex) {
          return {
            ...admin,
            name: displayName,
            discordId: userDiscordId,
            username: req.user.username,
            discriminator: req.user.discriminator,
            avatar: req.user.avatar,
            updatedAt: new Date().toISOString(),
          };
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
    res.json({
      message: "プロファイルを更新しました。",
      displayName,
      username: req.user.username,
      discriminator: req.user.discriminator,
      avatar: req.user.avatar,
      discordId: userDiscordId,
      email: userEmail,
      timestamp: new Date().toISOString(),
    });
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

module.exports = router;