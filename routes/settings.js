const express = require("express");
const { verifyAuthentication } = require("../middleware/auth");
const firebaseService = require("../services/firebase");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();

// 設定取得
router.get("/toka", verifyAuthentication, async (req, res) => {
  try {
    const db = firebaseService.getDB();
    const doc = await db.collection("bot_settings").doc("toka_profile").get();
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
        discriminator: req.user.discriminator,
        avatar: req.user.avatar,
        discordId: req.user.id
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
router.post("/toka", verifyAuthentication, async (req, res) => {
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
      .doc("toka_profile")
      .set(dataToSave, { merge: true });

    res.status(200).json({ message: "とーか設定を更新しました。" });
  } catch (error) {
    console.error("設定保存エラー:", error);
    res.status(500).json({ message: "サーバーエラー" });
  }
});

// 管理者設定
router.post("/admins", verifyAuthentication, async (req, res) => {
  try {
    const { admins: newAdminsList } = req.body;
    const db = firebaseService.getDB();
    const docRef = db.collection("bot_settings").doc("toka_profile");
    const docSnap = await docRef.get();
    const currentAdmins =
      docSnap.exists && Array.isArray(docSnap.data().admins)
        ? docSnap.data().admins
        : [];

    const newAdminEmails = (newAdminsList || []).map((a) => a.email);
    const newAdminDiscordIds = (newAdminsList || []).map((a) => a.discordId);
    const currentAdminEmails = currentAdmins.map((a) => a.email);
    const currentAdminDiscordIds = currentAdmins.map((a) => a.discordId);
    
    const adminsChanged =
      JSON.stringify([...currentAdminEmails].sort()) !==
      JSON.stringify([...newAdminEmails].sort()) ||
      JSON.stringify([...currentAdminDiscordIds].sort()) !==
      JSON.stringify([...newAdminDiscordIds].sort());

    if (adminsChanged && !req.user.isSuperAdmin) {
      return res.status(403).json({
        message: "エラー: 管理者リストの変更は最高管理者のみ許可されています。",
      });
    }

    let finalAdmins = newAdminsList || [];
    if (!docSnap.exists || finalAdmins.length === 0) {
      finalAdmins = [
        { 
          name: req.user.username || "管理者", 
          email: req.user.email,
          discordId: req.user.id,
          username: req.user.username,
          discriminator: req.user.discriminator,
          avatar: req.user.avatar
        },
      ];
    }

    await docRef.set({ admins: finalAdmins }, { merge: true });
    res.status(200).json({ message: "管理者リストを更新しました。" });
  } catch (error) {
    console.error("管理者設定エラー:", error);
    res.status(500).json({ message: "サーバーエラー" });
  }
});

// 招待コード生成
router.post("/generate-invite-code", verifyAuthentication, async (req, res) => {
  try {
    if (!req.user.isSuperAdmin) {
      return res.status(403).json({
        message: "招待コードの発行は最高管理者のみ許可されています。",
      });
    }
    
    const newCode = uuidv4().split("-")[0].toUpperCase();
    const db = firebaseService.getDB();
    
    await db.collection("invitation_codes").doc(newCode).set({
      code: newCode,
      createdAt: firebaseService.getServerTimestamp(),
      createdBy: req.user.email || req.user.username,
      createdByDiscordId: req.user.id,
      used: false,
      usedBy: null,
      usedByDiscordId: null,
      usedAt: null,
    });

    res.status(201).json({ code: newCode });
  } catch (error) {
    console.error("招待コード生成エラー:", error);
    res.status(500).json({ message: "招待コードの生成に失敗しました。" });
  }
});

module.exports = router;