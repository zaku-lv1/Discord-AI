const express = require("express");
const firebaseService = require("../services/firebase");

const router = express.Router();

// Default settings for new installations
const defaultSettings = {
  systemPrompt: "You are a helpful AI assistant.",
  modelMode: "hybrid",
  replyDelayMs: 0,
  enableNameRecognition: true,
  enableBotMessageResponse: false,
  errorOopsMessage: ""
};

// Get AI configuration
router.get("/ai", async (req, res) => {
  try {
    const db = firebaseService.getDB();
    const doc = await db.collection("bot_settings").doc("ai_profile").get();
    
    if (!doc.exists) {
      // Return defaults if no config exists yet
      return res.status(200).json(defaultSettings);
    }

    const data = doc.data();
    
    res.status(200).json({
      systemPrompt: data.systemPrompt || defaultSettings.systemPrompt,
      modelMode: data.modelMode || defaultSettings.modelMode,
      replyDelayMs: data.replyDelayMs ?? defaultSettings.replyDelayMs,
      enableNameRecognition: data.enableNameRecognition ?? defaultSettings.enableNameRecognition,
      enableBotMessageResponse: data.enableBotMessageResponse ?? defaultSettings.enableBotMessageResponse,
      errorOopsMessage: data.errorOopsMessage || defaultSettings.errorOopsMessage,
    });
  } catch (error) {
    console.error("[ERROR] Failed to get AI settings:", error);
    res.status(500).json({ message: "Failed to retrieve settings" });
  }
});

// Update AI configuration
router.put("/ai", async (req, res) => {
  try {
    const {
      systemPrompt,
      modelMode,
      replyDelayMs,
      enableNameRecognition,
      enableBotMessageResponse,
      errorOopsMessage,
    } = req.body;

    // Validate required fields
    if (!systemPrompt || typeof systemPrompt !== 'string') {
      return res.status(400).json({ message: "systemPrompt is required" });
    }

    const dataToSave = {
      systemPrompt,
      modelMode: modelMode || defaultSettings.modelMode,
      replyDelayMs: typeof replyDelayMs === "number" ? replyDelayMs : defaultSettings.replyDelayMs,
      enableNameRecognition: enableNameRecognition ?? defaultSettings.enableNameRecognition,
      enableBotMessageResponse: enableBotMessageResponse ?? defaultSettings.enableBotMessageResponse,
      errorOopsMessage: errorOopsMessage || defaultSettings.errorOopsMessage,
      updatedAt: new Date().toISOString()
    };

    const db = firebaseService.getDB();
    await db
      .collection("bot_settings")
      .doc("ai_profile")
      .set(dataToSave, { merge: true });

    console.log("[INFO] AI settings updated successfully");
    res.status(200).json({ message: "AI settings updated successfully" });
  } catch (error) {
    console.error("[ERROR] Failed to save AI settings:", error);
    res.status(500).json({ message: "Failed to save settings" });
  }
});

module.exports = router;