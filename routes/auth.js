const express = require("express");
const passport = require("passport");
const authService = require("../services/auth");

const router = express.Router();

// Local Authentication routes
router.post('/login', (req, res, next) => {
  passport.authenticate('local', async (err, user, info) => {
    if (err) {
      console.error('[ERROR] ローカル認証エラー:', err);
      return res.status(500).json({ 
        success: false, 
        message: 'サーバーエラーが発生しました' 
      });
    }
    
    if (!user) {
      console.log('[INFO] ローカル認証失敗:', info?.message);
      return res.status(401).json({ 
        success: false, 
        message: info?.message || 'ログインに失敗しました' 
      });
    }
    
    req.logIn(user, async (err) => {
      if (err) {
        console.error('[ERROR] ログインセッション作成エラー:', err);
        return res.status(500).json({ 
          success: false, 
          message: 'ログインに失敗しました' 
        });
      }
      
      console.log('[SUCCESS] ローカル認証成功:', user.username);
      
      // Handle remember me functionality
      const rememberMe = req.body.rememberMe;
      if (rememberMe) {
        try {
          const userAgent = req.get('user-agent') || 'Unknown';
          const deviceInfo = {
            userAgent: userAgent,
            ip: req.ip || req.connection.remoteAddress
          };
          
          const rememberToken = await authService.createRememberToken(user.id, deviceInfo);
          const cookieConfig = authService.createRememberTokenCookieConfig();
          
          res.cookie('remember_token', rememberToken, cookieConfig);
          console.log('[INFO] Remember token created for user:', user.username);
        } catch (rememberError) {
          console.error('[ERROR] Failed to create remember token:', rememberError);
          // Don't fail login if remember token creation fails
        }
      }
      
      // Ensure session is saved before responding
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('[ERROR] セッション保存エラー:', saveErr);
          console.error('[ERROR] セッションID:', req.sessionID);
          console.error('[ERROR] セッション内容:', req.session);
          return res.status(500).json({ 
            success: false, 
            message: 'ログインに失敗しました。しばらく待ってから再試行してください。' 
          });
        }
        
        console.log('[DEBUG] セッションが正常に保存されました:', req.sessionID);
        console.log('[DEBUG] ユーザー情報:', { 
          id: user.id, 
          username: user.username, 
          email: user.email,
          role: user.role,
          verified: user.verified 
        });
        
        // Set additional session metadata for debugging
        req.session.loginTime = new Date().toISOString();
        req.session.userAgent = req.get('user-agent');
        
        res.json({ 
          success: true, 
          message: 'ログインしました',
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            type: user.type,
            role: user.role,
            verified: user.verified,
            handle: user.handle
          },
          sessionInfo: {
            sessionId: req.sessionID,
            loginTime: req.session.loginTime,
            rememberMe: !!rememberMe
          }
        });
      });
    });
  })(req, res, next);
});

router.post('/register', async (req, res) => {
  try {
    const { username, password, email, invitationCode } = req.body;
    
    // Validation
    if (!username || !password || !email) {
      return res.status(400).json({ 
        success: false, 
        message: 'ユーザー名、パスワード、メールアドレスは必須です' 
      });
    }
    
    if (username.length < 3) {
      return res.status(400).json({ 
        success: false, 
        message: 'ユーザー名は3文字以上である必要があります' 
      });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'パスワードは6文字以上である必要があります' 
      });
    }
    
    // Username validation (alphanumeric and some special characters, no @ at start)
    const cleanUsername = username.startsWith('@') ? username.substring(1) : username;
    if (!/^[a-zA-Z0-9_-]+$/.test(cleanUsername)) {
      return res.status(400).json({ 
        success: false, 
        message: 'ユーザー名は英数字、アンダースコア、ハイフンのみ使用可能です' 
      });
    }
    
    const user = await authService.createLocalUser(cleanUsername, password, email, false, invitationCode);
    
    console.log('[SUCCESS] ユーザー登録成功:', user.username);
    res.json({ 
      success: true, 
      message: user.verified ? 'アカウントを作成しました' : 'アカウントを作成しました。メールボックスを確認して認証を完了してください',
      user: {
        id: user.id,
        username: user.username,
        handle: user.handle,
        email: user.email,
        type: user.type,
        role: user.role,
        displayName: user.displayName,
        verified: user.verified
      },
      requiresVerification: !user.verified
    });
  } catch (error) {
    console.error('[ERROR] ユーザー登録エラー:', error);
    res.status(400).json({ 
      success: false, 
      message: error.message || 'アカウント作成に失敗しました' 
    });
  }
});

// Email verification route
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token) {
      return res.redirect('/?error=invalid_token&message=' + encodeURIComponent('認証トークンが見つかりません'));
    }
    
    const user = await authService.verifyEmail(token);
    
    // Auto login after email verification
    req.logIn(user, (err) => {
      if (err) {
        console.error('[ERROR] 認証後ログインエラー:', err);
        return res.redirect('/?error=login_failed&message=' + encodeURIComponent('認証は完了しましたが、ログインに失敗しました'));
      }
      
      console.log('[SUCCESS] メール認証成功:', user.username);
      return res.redirect('/?auth=verified&message=' + encodeURIComponent('メールアドレスの認証が完了しました'));
    });
  } catch (error) {
    console.error('[ERROR] メール認証エラー:', error);
    return res.redirect('/?error=verification_failed&message=' + encodeURIComponent(error.message));
  }
});

// Resend verification email
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'メールアドレスは必須です'
      });
    }
    
    const result = await authService.resendVerificationEmail(email);
    res.json(result);
  } catch (error) {
    console.error('[ERROR] 認証メール再送信エラー:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// Request password reset
router.post('/request-password-reset', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'メールアドレスは必須です'
      });
    }
    
    const result = await authService.requestPasswordReset(email);
    res.json(result);
  } catch (error) {
    console.error('[ERROR] パスワード再設定要求エラー:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// Reset password page
router.get('/reset-password', (req, res) => {
  const { token } = req.query;
  
  if (!token) {
    return res.redirect('/?error=invalid_token&message=' + encodeURIComponent('無効な再設定トークンです'));
  }
  
  // Render password reset page
  res.render('reset-password', { token });
});

// Reset password submission
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body;
    
    if (!token || !password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'すべての項目を入力してください'
      });
    }
    
    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'パスワードが一致しません'
      });
    }
    
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'パスワードは6文字以上である必要があります'
      });
    }
    
    const result = await authService.resetPassword(token, password);
    res.json(result);
  } catch (error) {
    console.error('[ERROR] パスワード再設定エラー:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/logout', async (req, res) => {
  try {
    // Clear remember token if it exists
    const rememberToken = req.signedCookies['remember_token'];
    if (rememberToken) {
      await authService.deleteRememberToken(rememberToken);
      res.clearCookie('remember_token');
    }
    
    req.logout((err) => {
      if (err) {
        console.error('ログアウトエラー:', err);
      }
      res.redirect('/');
    });
  } catch (error) {
    console.error('[ERROR] Logout error:', error);
    req.logout((err) => {
      if (err) {
        console.error('ログアウトエラー:', err);
      }
      res.redirect('/');
    });
  }
});

router.get('/user', async (req, res) => {
  console.log('[DEBUG] Auth check - sessionID:', req.sessionID);
  console.log('[DEBUG] Auth check - isAuthenticated:', req.isAuthenticated());
  console.log('[DEBUG] Auth check - session user:', req.user ? req.user.username || req.user.email : 'none');
  
  if (req.isAuthenticated()) {
    const user = req.user;
    
    // Get user's current role and role display (same as verifyAuthentication middleware)
    try {
      const roleService = require("../services/roles");
      if (user.verified) {
        const userRole = await roleService.getUserRole(user.email);
        user.role = userRole;
        user.roleDisplay = roleService.displayNames[userRole];
        
        // Set legacy flags for backward compatibility (same as middleware/auth.js)
        user.isAdmin = roleService.hasRole(userRole, roleService.roles.OWNER);
        user.isSuperAdmin = roleService.hasRole(userRole, roleService.roles.OWNER);
      }
    } catch (error) {
      console.error('Error getting user role for auth check:', error);
      // Continue with existing role data if available
    }
    
    res.json({ 
      user: {
        id: user.id,
        username: user.username,
        handle: user.handle || `@${user.username}`,
        email: user.email,
        type: user.type,
        role: user.role,
        roleDisplay: user.roleDisplay,
        displayName: user.displayName || user.username,
        verified: user.verified,
        isAdmin: user.isAdmin,
        isSuperAdmin: user.isSuperAdmin
      },
      authenticated: true,
      authType: 'email'
    });
  } else {
    console.log('[DEBUG] Auth check failed - user not authenticated');
    res.json({ authenticated: false });
  }
});

module.exports = router;