const express = require("express");
const passport = require("passport");
const authService = require("../services/auth");

const router = express.Router();

// Local Authentication routes
router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
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
    
    req.logIn(user, (err) => {
      if (err) {
        console.error('[ERROR] ログインセッション作成エラー:', err);
        return res.status(500).json({ 
          success: false, 
          message: 'ログインに失敗しました' 
        });
      }
      
      console.log('[SUCCESS] ローカル認証成功:', user.username);
      res.json({ 
        success: true, 
        message: 'ログインしました',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          type: user.type,
          verified: user.verified
        }
      });
    });
  })(req, res, next);
});

router.post('/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    
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
    
    // Username validation (alphanumeric and some special characters)
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return res.status(400).json({ 
        success: false, 
        message: 'ユーザー名は英数字、アンダースコア、ハイフンのみ使用可能です' 
      });
    }
    
    const user = await authService.createLocalUser(username, password, email);
    
    console.log('[SUCCESS] ユーザー登録成功:', user.username);
    res.json({ 
      success: true, 
      message: user.verified ? 'アカウントを作成しました' : 'アカウントを作成しました。メールボックスを確認して認証を完了してください',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        type: user.type,
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

router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('ログアウトエラー:', err);
    }
    res.redirect('/');
  });
});

router.get('/user', (req, res) => {
  if (req.isAuthenticated()) {
    const user = req.user;
    res.json({ 
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        type: user.type,
        verified: user.verified
      },
      authenticated: true,
      authType: 'email'
    });
  } else {
    res.json({ authenticated: false });
  }
});

module.exports = router;