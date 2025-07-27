const firebaseService = require("../services/firebase");

const verifyAuthentication = async (req, res, next) => {
  // Discord OAuth認証をチェック
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Discord認証が必要です' });
  }

  try {
    const db = firebaseService.getDB();
    // 管理者権限をチェック
    const settingsDoc = await db
      .collection("bot_settings")
      .doc("toka_profile")
      .get();
    
    if (!settingsDoc.exists) {
      // 設定がない場合、最初のユーザーを管理者とする
      req.user.isAdmin = true;
      req.user.isSuperAdmin = true;
      return next();
    }

    const admins = Array.isArray(settingsDoc.data().admins)
      ? settingsDoc.data().admins
      : [];
    
    // Discord IDまたはemailで管理者チェック
    const isAdmin = admins.some(admin => 
      admin.email === req.user.email || 
      admin.discordId === req.user.id
    );

    if (admins.length > 0 && !isAdmin) {
      return res.status(403).json({ message: 'アクセス権限がありません' });
    }

    req.user.isAdmin = true;
    req.user.isSuperAdmin = admins.length === 0 || 
      (admins[0].email === req.user.email || admins[0].discordId === req.user.id);
    
    next();
  } catch (error) {
    console.error('認証エラー:', error);
    res.status(500).json({ message: 'サーバーエラー' });
  }
};

const checkDiscordConfigured = (req, res, next) => {
  if (!process.env.DISCORD_CLIENT_ID || !/^\d{17,19}$/.test(process.env.DISCORD_CLIENT_ID)) {
    console.error('Discord設定エラー: Client IDが無効です');
    return res.redirect('/?error=config_error');
  }
  if (!process.env.DISCORD_CLIENT_SECRET) {
    console.error('Discord設定エラー: Client Secretが未設定です');
    return res.redirect('/?error=config_error');
  }
  next();
};

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  res.status(500).json({
    message: 'サーバーエラーが発生しました',
    ...(isDevelopment && { error: err.message, stack: err.stack })
  });
};

module.exports = {
  verifyAuthentication,
  checkDiscordConfigured,
  errorHandler
};