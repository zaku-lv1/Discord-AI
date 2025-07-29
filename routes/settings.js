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
      // Clean admin object to avoid Firestore undefined values error
      const cleanAdminObject = {};
      if (req.user.username) cleanAdminObject.name = req.user.username;
      else cleanAdminObject.name = "管理者";
      
      if (req.user.email) cleanAdminObject.email = req.user.email;
      if (req.user.id) cleanAdminObject.discordId = req.user.id;
      if (req.user.username) cleanAdminObject.username = req.user.username;
      if (req.user.discriminator) cleanAdminObject.discriminator = req.user.discriminator;
      if (req.user.avatar) cleanAdminObject.avatar = req.user.avatar;
      
      finalAdmins = [cleanAdminObject];
    }

    // Clean all admin objects to remove undefined values
    finalAdmins = finalAdmins.map(admin => {
      const cleanAdmin = {};
      if (admin.name) cleanAdmin.name = admin.name;
      if (admin.email) cleanAdmin.email = admin.email;
      if (admin.discordId) cleanAdmin.discordId = admin.discordId;
      if (admin.username) cleanAdmin.username = admin.username;
      if (admin.discriminator) cleanAdmin.discriminator = admin.discriminator;
      if (admin.avatar) cleanAdmin.avatar = admin.avatar;
      return cleanAdmin;
    });

    await docRef.set({ admins: finalAdmins }, { merge: true });
    res.status(200).json({ message: "管理者リストを更新しました。" });
  } catch (error) {
    console.error("管理者設定エラー:", error);
    res.status(500).json({ message: "サーバーエラー" });
  }
});



module.exports = router;