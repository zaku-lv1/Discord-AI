const express = require("express");
const aiConfigStore = require("../services/ai-config-store");

const router = express.Router();

// Get AI settings
router.get("/ai", async (req, res) => {
  try {
    const config = await aiConfigStore.getConfig();
    res.status(200).json(config);
  } catch (error) {
    console.error("[ERROR] Failed to get AI settings:", error);
    res.status(500).json({ 
      error: "Server error",
      message: "Failed to load AI settings" 
    });
  }
});

// Update AI settings
router.put("/ai", async (req, res) => {
  try {
    const { botName, botIconUrl, systemPrompt, modelMode, replyDelayMs, errorOopsMessage, userNicknames } = req.body;

    // Validate required fields
    if (!systemPrompt || typeof systemPrompt !== 'string') {
      return res.status(400).json({ 
        error: "Validation error",
        message: "systemPrompt is required and must be a string" 
      });
    }

    // Validate botName if provided (optional, for backward compatibility)
    if (botName !== undefined && (typeof botName !== 'string' || botName.trim() === '')) {
      return res.status(400).json({ 
        error: "Validation error",
        message: "botName must be a non-empty string if provided" 
      });
    }

    // Validate botIconUrl if provided (optional, for backward compatibility)
    if (botIconUrl !== undefined && typeof botIconUrl !== 'string') {
      return res.status(400).json({ 
        error: "Validation error",
        message: "botIconUrl must be a string if provided" 
      });
    }

    // Validate modelMode
    if (modelMode && !['hybrid', 'flash_only'].includes(modelMode)) {
      return res.status(400).json({ 
        error: "Validation error",
        message: "modelMode must be either 'hybrid' or 'flash_only'" 
      });
    }

    // Validate replyDelayMs
    if (replyDelayMs !== undefined && (typeof replyDelayMs !== 'number' || replyDelayMs < 0)) {
      return res.status(400).json({ 
        error: "Validation error",
        message: "replyDelayMs must be a non-negative number" 
      });
    }

    // Validate userNicknames if provided
    if (userNicknames !== undefined && typeof userNicknames !== 'object') {
      return res.status(400).json({ 
        error: "Validation error",
        message: "userNicknames must be an object" 
      });
    }

    // Get current config to preserve botName and botIconUrl if not provided
    const currentConfig = await aiConfigStore.getConfig();

    const updates = {
      botName: botName !== undefined ? botName.trim() : (currentConfig.botName || "AI Assistant"),
      botIconUrl: botIconUrl !== undefined ? botIconUrl.trim() : (currentConfig.botIconUrl || ''),
      systemPrompt,
      modelMode: modelMode || 'hybrid',
      replyDelayMs: typeof replyDelayMs === 'number' ? replyDelayMs : 0,
      errorOopsMessage: errorOopsMessage || '',
      userNicknames: userNicknames || {}
    };

    await aiConfigStore.saveConfig(updates);

    res.status(200).json({ 
      message: "AI settings updated successfully",
      config: updates
    });
  } catch (error) {
    console.error("[ERROR] Failed to update AI settings:", error);
    res.status(500).json({ 
      error: "Server error",
      message: "Failed to update AI settings" 
    });
  }
});

module.exports = router;
