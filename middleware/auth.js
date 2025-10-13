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
    
    // Set admin flags based on the Synapse-Note style isAdmin check
    const isUserAdmin = roleService.isAdmin(req.user);
    req.user.isAdmin = isUserAdmin;
    req.user.isSuperAdmin = isUserAdmin; // In Synapse-Note style, all admins have super admin privileges
    
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
const requireOwner = requireRole(roleService.roles.OWNER); // Legacy compatibility
const requireEditor = requireRole(roleService.roles.EDITOR); // Legacy compatibility  
const requireAdmin = requireRole(roleService.roles.ADMIN); // Synapse-Note style admin check

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
  requireAdmin,
  errorHandler
};