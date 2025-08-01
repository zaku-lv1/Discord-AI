const express = require("express");
const { verifyAuthentication, requireEditor } = require("../middleware/auth");
const firebaseService = require("../services/firebase");

const router = express.Router();

// AI一覧取得
router.get("/", verifyAuthentication, async (req, res) => {
  try {
    const db = firebaseService.getDB();
    const doc = await db.collection("bot_settings").doc("ai_profiles").get();
    if (!doc.exists) {
      return res.status(200).json([]);
    }
    
    const data = doc.data();
    const aiProfiles = data.profiles || [];
    
    res.status(200).json(aiProfiles);
  } catch (error) {
    console.error("AI取得エラー:", error);
    res.status(500).json({ message: "サーバーエラー" });
  }
});

// AI作成
router.post("/", verifyAuthentication, requireEditor, async (req, res) => {
  try {
    const {
      id,
      name,
      systemPrompt,
      modelMode,
      enableNameRecognition,
      enableBotMessageResponse,
      replyDelayMs,
      errorOopsMessage,
      userNicknames
    } = req.body;

    if (!id || !name) {
      return res.status(400).json({ message: "IDと名前は必須です。" });
    }

    const db = firebaseService.getDB();
    const doc = await db.collection("bot_settings").doc("ai_profiles").get();
    const existingProfiles = doc.exists ? (doc.data().profiles || []) : [];
    
    // ID重複チェック
    if (existingProfiles.some(profile => profile.id === id)) {
      return res.status(400).json({ message: "このIDは既に使用されています。" });
    }

    const newProfile = {
      id,
      name,
      systemPrompt: systemPrompt || "",
      modelMode: modelMode || "hybrid",
      enableNameRecognition: enableNameRecognition ?? true,
      enableBotMessageResponse: enableBotMessageResponse ?? false,
      replyDelayMs: replyDelayMs ?? 0,
      errorOopsMessage: errorOopsMessage || "",
      userNicknames: userNicknames || {},
      createdAt: firebaseService.getArraySafeTimestamp(),
      updatedAt: firebaseService.getArraySafeTimestamp()
    };

    existingProfiles.push(newProfile);

    await db.collection("bot_settings").doc("ai_profiles").set({
      profiles: existingProfiles,
      updatedAt: firebaseService.getServerTimestamp()
    }, { merge: true });

    res.status(201).json({ message: `AI "${name}" を作成しました。`, ai: newProfile });
  } catch (error) {
    console.error("AI作成エラー:", error);
    res.status(500).json({ message: "サーバーエラー" });
  }
});

// AI更新
router.put("/:id", verifyAuthentication, requireEditor, async (req, res) => {
  try {
    const aiId = req.params.id;
    const {
      name,
      systemPrompt,
      modelMode,
      enableNameRecognition,
      enableBotMessageResponse,
      replyDelayMs,
      errorOopsMessage,
      userNicknames
    } = req.body;

    const db = firebaseService.getDB();
    const doc = await db.collection("bot_settings").doc("ai_profiles").get();
    if (!doc.exists) {
      return res.status(404).json({ message: "AIが見つかりません。" });
    }

    const existingProfiles = doc.data().profiles || [];
    const profileIndex = existingProfiles.findIndex(profile => profile.id === aiId);
    
    if (profileIndex === -1) {
      return res.status(404).json({ message: "AIが見つかりません。" });
    }

    existingProfiles[profileIndex] = {
      ...existingProfiles[profileIndex],
      name: name || existingProfiles[profileIndex].name,
      systemPrompt: systemPrompt !== undefined ? systemPrompt : existingProfiles[profileIndex].systemPrompt,
      modelMode: modelMode || existingProfiles[profileIndex].modelMode,
      enableNameRecognition: enableNameRecognition !== undefined ? enableNameRecognition : existingProfiles[profileIndex].enableNameRecognition,
      enableBotMessageResponse: enableBotMessageResponse !== undefined ? enableBotMessageResponse : existingProfiles[profileIndex].enableBotMessageResponse,
      replyDelayMs: replyDelayMs !== undefined ? replyDelayMs : existingProfiles[profileIndex].replyDelayMs,
      errorOopsMessage: errorOopsMessage !== undefined ? errorOopsMessage : existingProfiles[profileIndex].errorOopsMessage,
      userNicknames: userNicknames !== undefined ? userNicknames : existingProfiles[profileIndex].userNicknames,
      updatedAt: firebaseService.getArraySafeTimestamp()
    };

    await db.collection("bot_settings").doc("ai_profiles").set({
      profiles: existingProfiles,
      updatedAt: firebaseService.getServerTimestamp()
    }, { merge: true });

    res.status(200).json({ message: `AI "${existingProfiles[profileIndex].name}" を更新しました。` });
  } catch (error) {
    console.error("AI更新エラー:", error);
    res.status(500).json({ message: "サーバーエラー" });
  }
});

// AI削除
router.delete("/:id", verifyAuthentication, requireEditor, async (req, res) => {
  try {
    const aiId = req.params.id;

    const db = firebaseService.getDB();
    const doc = await db.collection("bot_settings").doc("ai_profiles").get();
    if (!doc.exists) {
      return res.status(404).json({ message: "AIが見つかりません。" });
    }

    const existingProfiles = doc.data().profiles || [];
    const profileIndex = existingProfiles.findIndex(profile => profile.id === aiId);
    
    if (profileIndex === -1) {
      return res.status(404).json({ message: "AIが見つかりません。" });
    }

    const deletedName = existingProfiles[profileIndex].name;
    existingProfiles.splice(profileIndex, 1);

    await db.collection("bot_settings").doc("ai_profiles").set({
      profiles: existingProfiles,
      updatedAt: firebaseService.getServerTimestamp()
    }, { merge: true });

    res.status(200).json({ message: `AI "${deletedName}" を削除しました。` });
  } catch (error) {
    console.error("AI削除エラー:", error);
    res.status(500).json({ message: "サーバーエラー" });
  }
});

// AI固有のニックネーム取得
router.get("/:id/nicknames", verifyAuthentication, async (req, res) => {
  try {
    const aiId = req.params.id;
    const db = firebaseService.getDB();
    
    const doc = await db.collection("bot_settings").doc("ai_profiles").get();
    if (!doc.exists) {
      return res.status(404).json({ message: "AIが見つかりません。" });
    }
    
    const existingProfiles = doc.data().profiles || [];
    const profile = existingProfiles.find(p => p.id === aiId);
    
    if (!profile) {
      return res.status(404).json({ message: "AIが見つかりません。" });
    }
    
    res.json({ nicknames: profile.userNicknames || {} });
  } catch (error) {
    console.error("AI固有ニックネーム取得エラー:", error);
    res.status(500).json({
      message: "ニックネームの取得中にエラーが発生しました。",
      details: error.message,
    });
  }
});

// AI固有のニックネーム追加
router.post("/:id/nicknames", verifyAuthentication, requireEditor, async (req, res) => {
  try {
    const aiId = req.params.id;
    const { discordId, nickname } = req.body;
    
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
    const doc = await db.collection("bot_settings").doc("ai_profiles").get();
    if (!doc.exists) {
      return res.status(404).json({ message: "AIが見つかりません。" });
    }
    
    const existingProfiles = doc.data().profiles || [];
    const profileIndex = existingProfiles.findIndex(p => p.id === aiId);
    
    if (profileIndex === -1) {
      return res.status(404).json({ message: "AIが見つかりません。" });
    }
    
    const currentNicknames = existingProfiles[profileIndex].userNicknames || {};
    
    // Discord IDが重複していないかチェック
    if (currentNicknames[discordId]) {
      return res.status(400).json({
        message: "このDiscord IDは既に登録されています。",
      });
    }
    
    // 新しいニックネームを追加
    currentNicknames[discordId] = {
      nickname: nickname.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    existingProfiles[profileIndex].userNicknames = currentNicknames;
    existingProfiles[profileIndex].updatedAt = firebaseService.getArraySafeTimestamp();
    
    await db.collection("bot_settings").doc("ai_profiles").set({
      profiles: existingProfiles,
      updatedAt: firebaseService.getServerTimestamp()
    }, { merge: true });
    
    res.json({
      message: "ニックネームを追加しました。",
      discordId,
      nickname: nickname.trim(),
      nicknames: currentNicknames
    });
  } catch (error) {
    console.error("AI固有ニックネーム追加エラー:", error);
    res.status(500).json({
      message: "ニックネームの追加中にエラーが発生しました。",
      details: error.message,
    });
  }
});

// AI固有のニックネーム更新
router.put("/:id/nicknames/:discordId", verifyAuthentication, requireEditor, async (req, res) => {
  try {
    const aiId = req.params.id;
    const { discordId } = req.params;
    const { nickname } = req.body;
    
    if (!nickname) {
      return res.status(400).json({
        message: "ニックネームが必要です。",
      });
    }
    
    const db = firebaseService.getDB();
    const doc = await db.collection("bot_settings").doc("ai_profiles").get();
    if (!doc.exists) {
      return res.status(404).json({ message: "AIが見つかりません。" });
    }
    
    const existingProfiles = doc.data().profiles || [];
    const profileIndex = existingProfiles.findIndex(p => p.id === aiId);
    
    if (profileIndex === -1) {
      return res.status(404).json({ message: "AIが見つかりません。" });
    }
    
    const currentNicknames = existingProfiles[profileIndex].userNicknames || {};
    
    if (!currentNicknames[discordId]) {
      return res.status(404).json({
        message: "指定されたDiscord IDが見つかりません。",
      });
    }
    
    // ニックネームを更新
    currentNicknames[discordId] = {
      ...currentNicknames[discordId],
      nickname: nickname.trim(),
      updatedAt: new Date().toISOString()
    };
    
    existingProfiles[profileIndex].userNicknames = currentNicknames;
    existingProfiles[profileIndex].updatedAt = firebaseService.getArraySafeTimestamp();
    
    await db.collection("bot_settings").doc("ai_profiles").set({
      profiles: existingProfiles,
      updatedAt: firebaseService.getServerTimestamp()
    }, { merge: true });
    
    res.json({
      message: "ニックネームを更新しました。",
      discordId,
      nickname: nickname.trim(),
      nicknames: currentNicknames
    });
  } catch (error) {
    console.error("AI固有ニックネーム更新エラー:", error);
    res.status(500).json({
      message: "ニックネームの更新中にエラーが発生しました。",
      details: error.message,
    });
  }
});

// AI固有のニックネーム削除
router.delete("/:id/nicknames/:discordId", verifyAuthentication, requireEditor, async (req, res) => {
  try {
    const aiId = req.params.id;
    const { discordId } = req.params;
    
    const db = firebaseService.getDB();
    const doc = await db.collection("bot_settings").doc("ai_profiles").get();
    if (!doc.exists) {
      return res.status(404).json({ message: "AIが見つかりません。" });
    }
    
    const existingProfiles = doc.data().profiles || [];
    const profileIndex = existingProfiles.findIndex(p => p.id === aiId);
    
    if (profileIndex === -1) {
      return res.status(404).json({ message: "AIが見つかりません。" });
    }
    
    const currentNicknames = existingProfiles[profileIndex].userNicknames || {};
    
    if (!currentNicknames[discordId]) {
      return res.status(404).json({
        message: "指定されたDiscord IDが見つかりません。",
      });
    }
    
    // ニックネームを削除
    delete currentNicknames[discordId];
    
    existingProfiles[profileIndex].userNicknames = currentNicknames;
    existingProfiles[profileIndex].updatedAt = firebaseService.getArraySafeTimestamp();
    
    await db.collection("bot_settings").doc("ai_profiles").set({
      profiles: existingProfiles,
      updatedAt: firebaseService.getServerTimestamp()
    }, { merge: true });
    
    res.json({
      message: "ニックネームを削除しました。",
      discordId,
      nicknames: currentNicknames
    });
  } catch (error) {
    console.error("AI固有ニックネーム削除エラー:", error);
    res.status(500).json({
      message: "ニックネームの削除中にエラーが発生しました。",
      details: error.message,
    });
  }
});

// 全ユーザーのDiscord IDマッピング取得（AI使用用）- 後方互換性のため保持
router.get("/discord-mappings", verifyAuthentication, async (req, res) => {
  try {
    const db = firebaseService.getDB();
    
    // 全ユーザーのDiscord IDマッピングを取得
    const mappingsSnapshot = await db.collection("discord_id_mappings").get();
    
    let globalMappings = {};
    
    mappingsSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.mappings) {
        // 各ユーザーのマッピングをグローバルマッピングにマージ
        Object.assign(globalMappings, data.mappings);
      }
    });
    
    res.json({ mappings: globalMappings });
  } catch (error) {
    console.error("グローバルDiscord IDマッピング取得エラー:", error);
    res.status(500).json({
      message: "Discord IDマッピングの取得中にエラーが発生しました。",
      details: error.message,
    });
  }
});

module.exports = router;