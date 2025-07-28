const express = require("express");
const passport = require("passport");
const { checkDiscordConfigured } = require("../middleware/auth");

const router = express.Router();

// Discord OAuth routes
router.get('/discord', checkDiscordConfigured, passport.authenticate('discord'));

router.get('/discord/callback', 
  checkDiscordConfigured,
  (req, res, next) => {
    // Log callback details for debugging
    console.log('[DEBUG] Discord OAuth コールバック受信:', {
      query: req.query,
      headers: {
        host: req.headers.host,
        'user-agent': req.headers['user-agent']
      }
    });

    // Check if this is a valid OAuth callback (has code or error parameter)
    if (!req.query.code && !req.query.error) {
      console.error('[ERROR] OAuth コールバックに必要なパラメータがありません');
      return res.status(400).json({
        error: 'invalid_request',
        message: 'Discord OAuth コールバックには code または error パラメータが必要です',
        received_params: Object.keys(req.query)
      });
    }

    // Handle OAuth error responses from Discord
    if (req.query.error) {
      console.error('[ERROR] Discord OAuth エラー応答:', {
        error: req.query.error,
        error_description: req.query.error_description
      });
      return res.redirect(`/?error=discord_oauth&details=${encodeURIComponent(req.query.error)}`);
    }

    passport.authenticate('discord', { 
      failureRedirect: '/?error=auth_failed',
      session: true 
    }, (err, user, info) => {
      if (err) {
        console.error('[ERROR] Discord OAuth認証エラー:', err);
        return res.redirect(`/?error=oauth_error&details=${encodeURIComponent(err.message || 'unknown')}`);
      }
      if (!user) {
        console.log('[INFO] Discord OAuth認証失敗:', info);
        return res.redirect(`/?error=auth_failed&details=${encodeURIComponent(info?.message || 'authentication_failed')}`);
      }
      req.logIn(user, (err) => {
        if (err) {
          console.error('[ERROR] ログインセッション作成エラー:', err);
          return res.redirect(`/?error=session_error&details=${encodeURIComponent(err.message || 'unknown')}`);
        }
        console.log('[SUCCESS] Discord OAuth認証成功:', user.username);
        return res.redirect('/?auth=success');
      });
    })(req, res, next);
  }
);

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
    res.json({ 
      user: {
        id: req.user.id,
        username: req.user.username,
        discriminator: req.user.discriminator,
        avatar: req.user.avatar,
        email: req.user.email
      },
      authenticated: true 
    });
  } else {
    res.json({ authenticated: false });
  }
});

// Debug endpoint for OAuth callback testing
router.get('/debug/callback', (req, res) => {
  const authService = require("../services/auth");
  
  res.json({
    message: 'Discord OAuth callback debug information',
    environment: {
      callbackUrl: authService.getCallbackURL(),
      configured: authService.isConfigured(),
      clientId: process.env.DISCORD_CLIENT_ID ? 'configured' : 'missing',
      clientSecret: process.env.DISCORD_CLIENT_SECRET ? 'configured' : 'missing'
    },
    request: {
      query: req.query,
      headers: {
        host: req.headers.host,
        'user-agent': req.headers['user-agent'],
        'x-forwarded-for': req.headers['x-forwarded-for'],
        'x-forwarded-proto': req.headers['x-forwarded-proto']
      },
      url: req.url,
      originalUrl: req.originalUrl,
      baseUrl: req.baseUrl
    },
    timestamp: new Date().toISOString()
  });
});

// Test endpoint to verify callback URL accessibility
router.get('/test/callback', (req, res) => {
  res.json({
    message: 'Discord OAuth callback route is working correctly',
    status: 'accessible',
    note: 'This confirms the route is not returning 404. OAuth errors are expected with invalid codes.',
    callback_url: '/auth/discord/callback',
    test_time: new Date().toISOString(),
    request_info: {
      method: req.method,
      path: req.path,
      query: req.query,
      headers: {
        host: req.headers.host,
        'user-agent': req.headers['user-agent']
      }
    }
  });
});

module.exports = router;