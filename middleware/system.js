const systemSettingsService = require("../services/system-settings");

/**
 * Maintenance mode middleware
 * Blocks access for non-owners when maintenance mode is active
 */
const checkMaintenanceMode = async (req, res, next) => {
  try {
    // Skip maintenance check for owner setup and API status endpoints
    if (req.path === '/owner-setup' || 
        req.path === '/api/system-settings/status' ||
        req.path === '/api/health' ||
        req.path.startsWith('/owner-setup/')) {
      return next();
    }

    const isMaintenanceMode = await systemSettingsService.isMaintenanceMode();
    
    if (isMaintenanceMode) {
      // Allow owners to access during maintenance
      if (req.isAuthenticated() && req.user && req.user.isSuperAdmin) {
        return next();
      }

      // For API requests, return JSON response
      if (req.path.startsWith('/api/') || req.headers.accept?.includes('application/json')) {
        const maintenanceMessage = await systemSettingsService.getMaintenanceMessage();
        return res.status(503).json({
          message: "システムメンテナンス中",
          maintenanceMessage: maintenanceMessage,
          error: "MAINTENANCE_MODE"
        });
      }

      // For regular requests, render maintenance page
      const maintenanceMessage = await systemSettingsService.getMaintenanceMessage();
      return res.status(503).render("maintenance", { 
        maintenanceMessage: maintenanceMessage 
      });
    }

    next();
  } catch (error) {
    console.error("[エラー] メンテナンスモードチェックに失敗:", error);
    next(); // Continue on error to avoid breaking the site
  }
};

/**
 * Check if invitation codes are required for registration
 */
const checkInvitationRequirement = async (req, res, next) => {
  // Only apply to registration endpoints
  if (req.path !== '/auth/register' || req.method !== 'POST') {
    return next();
  }

  try {
    const requiresInvitation = await systemSettingsService.requiresInvitationCode();
    
    if (requiresInvitation && !req.body.invitationCode) {
      return res.status(400).json({
        success: false,
        message: "新規登録には招待コードが必要です",
        requiresInvitationCode: true
      });
    }

    next();
  } catch (error) {
    console.error("[エラー] 招待コード要件チェックに失敗:", error);
    next(); // Continue on error
  }
};

module.exports = {
  checkMaintenanceMode,
  checkInvitationRequirement
};