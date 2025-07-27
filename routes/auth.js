const express = require("express");
const passport = require("passport");
const { checkDiscordConfigured } = require("../middleware/auth");

const router = express.Router();

// Discord OAuth routes
router.get('/discord', checkDiscordConfigured, passport.authenticate('discord'));

router.get('/discord/callback', 
  checkDiscordConfigured,
  (req, res, next) => {
    passport.authenticate('discord', { 
      failureRedirect: '/?error=auth_failed',
      session: true 
    }, (err, user, info) => {
      if (err) {
        console.error('Discord OAuth認証エラー:', err);
        return res.redirect('/?error=oauth_error');
      }
      if (!user) {
        console.log('Discord OAuth認証失敗:', info);
        return res.redirect('/?error=auth_failed');
      }
      req.logIn(user, (err) => {
        if (err) {
          console.error('ログインセッション作成エラー:', err);
          return res.redirect('/?error=session_error');
        }
        console.log('Discord OAuth認証成功:', user.username);
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

module.exports = router;