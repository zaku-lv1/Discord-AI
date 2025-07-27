const express = require("express");
const passport = require("passport");
const { checkDiscordConfigured } = require("../middleware/auth");

const router = express.Router();

// Discord OAuth routes
router.get('/discord', checkDiscordConfigured, passport.authenticate('discord'));

router.get('/discord/callback', 
  checkDiscordConfigured,
  passport.authenticate('discord', { failureRedirect: '/?error=auth_failed' }),
  (req, res) => {
    // 認証成功時にリダイレクト
    res.redirect('/?auth=success');
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