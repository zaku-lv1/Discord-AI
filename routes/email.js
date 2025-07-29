const express = require('express');
const router = express.Router();
const emailService = require('../services/email');

// メール管理パネルのメインページ
router.get('/email-admin', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/auth/login');
  }

  const emailStats = emailService.getStatistics();
  const smtpStatus = emailService.getSMTPStatus();
  const recentEmails = emailService.getRecentEmails(5);

  res.render('email-admin', {
    user: req.session.user,
    stats: emailStats,
    smtpStatus: smtpStatus,
    recentEmails: recentEmails,
    isProduction: process.env.NODE_ENV === 'production'
  });
});

// メールサービス状態のAPI
router.get('/api/email-status', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const stats = emailService.getStatistics();
    const smtpStatus = emailService.getSMTPStatus();
    
    res.json({
      initialized: emailService.isInitialized(),
      statistics: stats,
      smtpServer: smtpStatus,
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// テストメール送信
router.post('/api/email-test', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'メールアドレスが必要です' });
  }

  try {
    await emailService.sendTestEmail(email);
    res.json({ 
      success: true, 
      message: 'テストメールを送信しました',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('テストメール送信エラー:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// メール送信統計をリセット
router.post('/api/email-reset-stats', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 統計をリセット
    emailService.statistics = {
      totalSent: 0,
      totalFailed: 0,
      recentErrors: []
    };

    res.json({ 
      success: true, 
      message: '統計がリセットされました',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SMTP接続テスト
router.post('/api/smtp-test', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await emailService.verifyConnection();
    res.json({ 
      success: true, 
      message: 'SMTP接続テストが成功しました',
      result: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('SMTP接続テストエラー:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;