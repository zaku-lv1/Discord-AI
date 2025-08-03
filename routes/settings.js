const express = require("express");
const { verifyAuthentication } = require("../middleware/auth");
const firebaseService = require("../services/firebase");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();

// 設定取得
router.get("/ai", verifyAuthentication, async (req, res) => {
  try {
    const db = firebaseService.getDB();
    const doc = await db.collection("bot_settings").doc("ai_profile").get();
    if (!doc.exists) {
      return res.status(404).json({ message: "設定がまだありません。" });
    }

    const data = doc.data();
    const admins = data.admins || [];

    res.status(200).json({
      baseUserId: data.baseUserId || null,
      systemPrompt: data.systemPrompt || "",
      enableNameRecognition: data.enableNameRecognition ?? true,
      userNicknames: data.userNicknames || {},
      modelMode: data.modelMode || "hybrid",
      enableBotMessageResponse: data.enableBotMessageResponse ?? false,
      admins: admins,
      currentUser: { 
        isSuperAdmin: req.user.isSuperAdmin,
        username: req.user.username,
        avatar: req.user.avatar,
        discordId: req.user.id,
        ...(req.user.discriminator && { discriminator: req.user.discriminator })
      },
      replyDelayMs: data.replyDelayMs ?? 0,
      errorOopsMessage: data.errorOopsMessage || "",
    });
  } catch (error) {
    console.error("設定取得エラー:", error);
    res.status(500).json({ message: "サーバーエラー" });
  }
});

// 設定保存
router.post("/ai", verifyAuthentication, async (req, res) => {
  try {
    const {
      baseUserId,
      systemPrompt,
      enableNameRecognition,
      userNicknames,
      modelMode,
      enableBotMessageResponse,
      replyDelayMs,
    } = req.body;

    const dataToSave = {
      baseUserId,
      systemPrompt,
      enableNameRecognition,
      userNicknames,
      modelMode,
      enableBotMessageResponse,
      replyDelayMs: typeof replyDelayMs === "number" ? replyDelayMs : 0,
    };

    const db = firebaseService.getDB();
    await db
      .collection("bot_settings")
      .doc("ai_profile")
      .set(dataToSave, { merge: true });

    res.status(200).json({ message: "AI設定を更新しました。" });
  } catch (error) {
    console.error("設定保存エラー:", error);
    res.status(500).json({ message: "サーバーエラー" });
  }
});


module.exports = router;