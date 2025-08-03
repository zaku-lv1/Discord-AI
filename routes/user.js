const express = require("express");
const { verifyAuthentication } = require("../middleware/auth");
const firebaseService = require("../services/firebase");

const router = express.Router();

// プロファイル更新
router.post("/update-profile", verifyAuthentication, async (req, res) => {
  try {
    const { displayName } = req.body;
    const userEmail = req.user.email;

    console.log("プロファイル更新リクエスト:", {
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

    // ユーザーのプロファイルを更新
    const db = firebaseService.getDB();
    const userQuery = await db.collection('users').where('email', '==', userEmail).get();
    
    if (userQuery.empty) {
      return res.status(404).json({
        message: "ユーザーが見つかりません。",
      });
    }

    const userDoc = userQuery.docs[0];
    await userDoc.ref.update({
      displayName: displayName,
      updatedAt: firebaseService.getServerTimestamp()
    });

    console.log("データベース更新完了");

    // 成功レスポンス
    const responseData = {
      message: "プロファイルを更新しました。",
      displayName,
      username: req.user.username,
      email: userEmail,
      timestamp: new Date().toISOString(),
    };
    
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

module.exports = router;