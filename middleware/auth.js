const firebaseService = require("../services/firebase");
const roleService = require("../services/roles");

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
    // Get user's current role
    const userRole = await roleService.getUserRole(req.user.email);
    req.user.role = userRole;
    req.user.roleDisplay = roleService.displayNames[userRole];
    
    // Set legacy flags for backward compatibility
    req.user.isAdmin = roleService.hasRole(userRole, roleService.roles.OWNER); // Only owners have admin privileges now
    req.user.isSuperAdmin = roleService.hasRole(userRole, roleService.roles.OWNER);
    
    next();
  } catch (error) {
    console.error('認証エラー:', error);
    res.status(500).json({ message: 'サーバーエラー' });
  }
};

// Role-based access control middleware
const requireRole = (requiredRole) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.role) {
        return res.status(401).json({ message: '認証が必要です' });
      }

      if (!roleService.hasRole(req.user.role, requiredRole)) {
        return res.status(403).json({ 
          message: 'この操作を行う権限がありません',
          required: roleService.displayNames[requiredRole],
          current: roleService.displayNames[req.user.role]
        });
      }

      next();
    } catch (error) {
      console.error('Role check error:', error);
      res.status(500).json({ message: 'サーバーエラー' });
    }
  };
};

// Convenience middleware for specific roles
const requireOwner = requireRole(roleService.roles.OWNER);
const requireEditor = requireRole(roleService.roles.EDITOR);

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
  requireRole,
  requireOwner,
  requireEditor,
  errorHandler
};