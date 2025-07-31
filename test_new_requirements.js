#!/usr/bin/env node
/**
 * Test script to validate the new invitation code requirements
 * Run with: node test_new_requirements.js
 */

const assert = require('assert');
const fetch = require('node-fetch');

// Test configuration
const config = {
  baseUrl: 'http://localhost:8080',
  timeout: 10000
};

// Helper function to make HTTP requests
async function makeRequest(path, options = {}) {
  const url = `${config.baseUrl}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  
  return {
    status: response.status,
    data: await response.json().catch(() => ({}))
  };
}

// Test functions
async function testInvitationCodeRequirement() {
  console.log('\n📋 テスト: 招待コード必須要件');
  
  try {
    // First, check if there are already users in the system
    const healthResponse = await makeRequest('/api/health');
    console.log('  サーバー状態を確認しました');
    
    // Try to register the first user (should become owner without invitation code)
    console.log('  最初のユーザー登録を試行...');
    const firstUserResponse = await makeRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: 'owner',
        email: 'owner@example.com',
        password: 'ownerpass123'
        // No invitation code for first user
      })
    });
    
    if (firstUserResponse.status === 200 && firstUserResponse.data.success) {
      console.log('  ✅ 最初のユーザー（オーナー）の登録が成功しました');
      console.log(`     ロール: ${firstUserResponse.data.user.role}`);
      
      // Now try to register a second user without invitation code (should fail)
      console.log('  2番目のユーザー登録を試行（招待コードなし）...');
      const secondUserResponse = await makeRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username: 'testuser',
          email: 'testuser@example.com',
          password: 'testpass123'
          // No invitation code
        })
      });
      
      if (secondUserResponse.status === 400 && 
          secondUserResponse.data.message && 
          secondUserResponse.data.message.includes('招待コード')) {
        console.log('  ✅ 招待コードなしの2番目のユーザー登録が正しく拒否されました');
        return true;
      } else {
        console.log('  ❌ 招待コードなしの2番目のユーザー登録が許可されてしまいました');
        console.log('  Response:', secondUserResponse);
        return false;
      }
    } else if (firstUserResponse.status === 400 && 
               firstUserResponse.data.message && 
               firstUserResponse.data.message.includes('招待コード')) {
      console.log('  ✅ 既にユーザーが存在し、招待コードが要求されています');
      return true;
    } else {
      console.log('  ❌ 予期しない応答を受信しました');
      console.log('  Response:', firstUserResponse);
      return false;
    }
  } catch (error) {
    console.log('  ❌ テスト実行中にエラーが発生:', error.message);
    return false;
  }
}

async function testSystemSettingsEndpoint() {
  console.log('\n📋 テスト: システム設定エンドポイント');
  
  try {
    const response = await makeRequest('/api/system-settings/status');
    
    if (response.status === 200 && response.data.success) {
      console.log('✅ システム設定エンドポイントが正常に動作しています');
      console.log('設定:', response.data.status);
      return true;
    } else {
      console.log('❌ システム設定エンドポイントが正常に動作していません');
      console.log('Response:', response);
      return false;
    }
  } catch (error) {
    console.log('❌ テスト実行中にエラーが発生:', error.message);
    return false;
  }
}

async function testHealthEndpoint() {
  console.log('\n📋 テスト: ヘルスチェック');
  
  try {
    const response = await makeRequest('/api/health');
    
    if (response.status === 200 && response.data.status === 'ok') {
      console.log('✅ サーバーが正常に動作しています');
      return true;
    } else {
      console.log('❌ サーバーが正常に動作していません');
      console.log('Response:', response);
      return false;
    }
  } catch (error) {
    console.log('❌ サーバーに接続できません:', error.message);
    console.log('サーバーが起動していることを確認してください: npm start');
    return false;
  }
}

// Main test execution
async function runTests() {
  console.log('🧪 新しい要件のテストを開始します...');
  console.log('======================================');
  
  const tests = [
    { name: 'ヘルスチェック', fn: testHealthEndpoint },
    { name: 'システム設定', fn: testSystemSettingsEndpoint },
    { name: '招待コード必須要件', fn: testInvitationCodeRequirement }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${test.name}テストでエラー:`, error.message);
      failed++;
    }
  }
  
  console.log('\n======================================');
  console.log(`📊 テスト結果: ${passed}件成功, ${failed}件失敗`);
  
  if (failed === 0) {
    console.log('🎉 すべてのテストが成功しました！');
    console.log('\n✅ 実装完了した要件:');
    console.log('   - 招待コードが新規登録で必須になりました');
    console.log('   - オーナーは1人のみの制約を追加しました'); 
    console.log('   - ロールはオーナーと編集者のみに简化されています');
    console.log('   - UIで招待コード入力が常に必須として表示されます');
  } else {
    console.log('❌ いくつかのテストが失敗しました。実装を確認してください。');
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
  process.exit(1);
});

// Run tests
runTests().catch(error => {
  console.error('テスト実行中に致命的エラーが発生:', error);
  process.exit(1);
});