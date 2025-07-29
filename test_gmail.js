#!/usr/bin/env node

// パッケージのテスト用スクリプト
// 全ての機能が正常に動作するかテストします

console.log('=== Discord AI Bot - Gmail設定テスト ===\n');

// 依存関係のチェック
console.log('1. 依存関係チェック:');
try {
  require('nodemailer');
  console.log('   [OK] nodemailer');
} catch (e) {
  console.log('   [ERROR] nodemailer が見つかりません。npm install を実行してください。');
  process.exit(1);
}

try {
  require('dotenv');
  console.log('   [OK] dotenv');
} catch (e) {
  console.log('   [ERROR] dotenv が見つかりません。npm install を実行してください。');
  process.exit(1);
}

// 環境変数の読み込み
require('dotenv').config();

// Gmail設定のチェック
console.log('\n2. Gmail設定チェック:');
const gmailUser = process.env.GMAIL_USER;
const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

console.log(`   GMAIL_USER: ${gmailUser ? '[OK] ' + gmailUser : '[ERROR] 未設定'}`);
console.log(`   GMAIL_APP_PASSWORD: ${gmailAppPassword ? '[OK] 設定済み' : '[ERROR] 未設定'}`);

if (!gmailUser || !gmailAppPassword) {
  console.log('\n[ERROR] Gmail設定が不完全です。');
  console.log('\n設定手順:');
  console.log('1. .env.example を .env にコピー');
  console.log('2. GMAIL_USER にGmailアドレスを設定');
  console.log('3. GMAIL_APP_PASSWORD にアプリパスワードを設定');
  console.log('\n詳細は GMAIL_SETUP.md を参照してください。');
  process.exit(1);
}

// EmailServiceのテスト
console.log('\n3. Email Serviceテスト:');
const EmailService = require('./services/email');

(async () => {
  try {
    await EmailService.initialize();
    console.log('   [OK] Gmail SMTP接続成功');
    
    console.log('\n[SUCCESS] 全てのテストが成功しました！');
    console.log('\nシステムを起動するには: npm start');
    console.log('テストメール送信: POST /api/debug/send-test-email');
    
  } catch (error) {
    console.log('   [ERROR] Gmail SMTP接続失敗');
    console.log(`   エラー: ${error.message}`);
    
    // エラーの種類に応じたアドバイス
    if (error.message.includes('Invalid login') || error.message.includes('534')) {
      console.log('\n🔧 認証エラーです。以下を確認してください:');
      console.log('   - Gmailアドレスが正しいか');
      console.log('   - アプリパスワードが正しいか（通常のパスワードではない）');
      console.log('   - Googleアカウントで2段階認証が有効か');
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('ETIMEOUT')) {
      console.log('\n🔧 接続エラーです。以下を確認してください:');
      console.log('   - インターネット接続');
      console.log('   - ファイアウォール設定（ポート587）');
      console.log('   - VPN/プロキシ設定');
    }
    
    console.log('\n詳細な設定方法は GMAIL_SETUP.md を参照してください。');
    process.exit(1);
  }
})();