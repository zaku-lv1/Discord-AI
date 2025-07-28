const firebaseService = require("../services/firebase");

const verifyAuthentication = async (req, res, next) => {
  // Email認証をチェック
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: '認証が必要です' });
  }

  // メール認証状態をチェック
  if (!req.user.verified) {
    return res.status(401).json({ message: 'メールアドレスの認証が必要です' });
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
    
    // メールアドレスで管理者チェック
    const isAdmin = admins.some(admin => 
      admin.email === req.user.email
    );

    if (admins.length > 0 && !isAdmin) {
      return res.status(403).json({ message: 'アクセス権限がありません' });
    }

    req.user.isAdmin = true;
    req.user.isSuperAdmin = admins.length === 0 || 
      (admins[0].email === req.user.email);
    
    next();
  } catch (error) {
    console.error('認証エラー:', error);
    res.status(500).json({ message: 'サーバーエラー' });
  }
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
  errorHandler
};