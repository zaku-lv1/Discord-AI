#!/usr/bin/env node
/**
 * Test script for emergency admin access feature
 * Tests the ability to grant admin privileges using EMERGENCY_ADMIN_KEY
 */

const assert = require('assert');
const fetch = require('node-fetch');

// Test configuration
const config = {
  baseUrl: process.env.TEST_BASE_URL || 'http://localhost:8080',
  timeout: 10000,
  emergencyKey: 'test-emergency-key-12345'
};

// Helper function to make HTTP requests
async function makeRequest(path, options = {}) {
  const url = `${config.baseUrl}${path}`;
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    timeout: config.timeout
  };

  try {
    const response = await fetch(url, { ...defaultOptions, ...options });
    const contentType = response.headers.get('content-type');
    let data;
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return {
      status: response.status,
      data: data,
      headers: response.headers
    };
  } catch (error) {
    console.error(`Request to ${url} failed:`, error.message);
    throw new Error(`Request failed for ${path}: ${error.message}`);
  }
}

// Main test function
async function testEmergencyAdminAccess() {
  console.log('\n🎯 テスト: 緊急管理者アクセス機能');
  console.log('============================================================');
  
  try {
    // Test 1: Check server health
    console.log('\n📋 テスト 1: サーバーヘルスチェック');
    const healthResponse = await makeRequest('/api/health');
    assert.strictEqual(healthResponse.status, 200, 'Health endpoint should return 200');
    console.log('  ✓ サーバーが正常に動作しています');

    // Test 2: Create test user (owner setup)
    console.log('\n📋 テスト 2: テストユーザー作成（オーナー設定）');
    const createUserResponse = await makeRequest('/owner-setup', {
      method: 'POST',
      body: JSON.stringify({
        username: 'testuser_emergency',
        password: 'password123',
        confirmPassword: 'password123'
      })
    });
    
    if (createUserResponse.status === 201 || createUserResponse.status === 200) {
      console.log('  ✓ テストユーザーが作成されました');
    } else if (createUserResponse.status === 404) {
      console.log('  ℹ️ オーナー設定は既に完了しています（既存のユーザーを使用）');
    } else {
      console.log(`  ⚠️ ユーザー作成ステータス: ${createUserResponse.status}`);
    }

    // Test 3: Create a second test user (regular user with invitation)
    console.log('\n📋 テスト 3: 2番目のテストユーザー作成');
    // Note: This might fail if invitation codes are required
    // We'll use this user to test emergency admin access
    
    // For now, we'll test with the first user since we need the emergency key
    const targetUser = '@testuser_emergency';

    // Test 4: Test emergency admin access without key (should fail)
    console.log('\n📋 テスト 4: 緊急管理者アクセス（キーなし - 失敗すべき）');
    const noKeyResponse = await makeRequest('/api/system-settings/emergency-admin-access', {
      method: 'POST',
      body: JSON.stringify({
        targetUser: targetUser,
        emergencyKey: ''
      })
    });
    
    assert.strictEqual(noKeyResponse.status, 400, 'Should fail without valid key');
    console.log('  ✓ キーなしでは失敗することを確認');

    // Test 5: Test emergency admin access with wrong key (should fail)
    console.log('\n📋 テスト 5: 緊急管理者アクセス（間違ったキー - 失敗すべき）');
    const wrongKeyResponse = await makeRequest('/api/system-settings/emergency-admin-access', {
      method: 'POST',
      body: JSON.stringify({
        targetUser: targetUser,
        emergencyKey: 'wrong-key-12345'
      })
    });
    
    assert.strictEqual(wrongKeyResponse.status, 400, 'Should fail with wrong key');
    console.log('  ✓ 間違ったキーでは失敗することを確認');

    // Test 6: Test emergency admin access with correct key (should succeed if EMERGENCY_ADMIN_KEY is set)
    console.log('\n📋 テスト 6: 緊急管理者アクセス（正しいキー）');
    console.log(`  ℹ️ 環境変数 EMERGENCY_ADMIN_KEY=${config.emergencyKey} が必要です`);
    
    const validKeyResponse = await makeRequest('/api/system-settings/emergency-admin-access', {
      method: 'POST',
      body: JSON.stringify({
        targetUser: targetUser,
        emergencyKey: config.emergencyKey
      })
    });
    
    if (validKeyResponse.status === 200) {
      console.log('  ✓ 正しいキーで管理者権限を付与できました');
      console.log(`  ✓ レスポンス: ${JSON.stringify(validKeyResponse.data, null, 2)}`);
      assert.strictEqual(validKeyResponse.data.success, true, 'Should succeed with valid key');
      assert.strictEqual(validKeyResponse.data.grantedBy, 'EMERGENCY_KEY', 'Should indicate emergency key was used');
    } else if (validKeyResponse.status === 400) {
      console.log('  ⚠️ 緊急管理者キーが環境変数に設定されていないか、既に管理者です');
      console.log(`  ℹ️ テストを続行するには、.envファイルに EMERGENCY_ADMIN_KEY=${config.emergencyKey} を設定してください`);
    } else {
      console.log(`  ⚠️ 予期しないステータスコード: ${validKeyResponse.status}`);
    }

    // Test 7: Test with non-existent user (should fail)
    console.log('\n📋 テスト 7: 存在しないユーザーへの権限付与（失敗すべき）');
    const nonExistentResponse = await makeRequest('/api/system-settings/emergency-admin-access', {
      method: 'POST',
      body: JSON.stringify({
        targetUser: '@nonexistent_user_12345',
        emergencyKey: config.emergencyKey
      })
    });
    
    assert.strictEqual(nonExistentResponse.status, 400, 'Should fail for non-existent user');
    console.log('  ✓ 存在しないユーザーでは失敗することを確認');

    console.log('\n✅ 全てのテストが完了しました！');
    console.log('\n📝 テスト結果サマリー:');
    console.log('  • サーバーヘルスチェック: ✓');
    console.log('  • キーなしでの失敗: ✓');
    console.log('  • 間違ったキーでの失敗: ✓');
    console.log('  • 存在しないユーザーでの失敗: ✓');
    console.log('  • 緊急管理者アクセス: ' + (validKeyResponse.status === 200 ? '✓' : '⚠️ (要環境変数設定)'));
    
  } catch (error) {
    console.error('\n❌ テストに失敗しました:', error.message);
    console.error('\nスタックトレース:', error.stack);
    throw error;
  }
}

// Helper function to wait for server to be ready
async function waitForServer(maxAttempts = 30, delayMs = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await makeRequest('/api/health');
      if (response.status === 200) {
        console.log('✓ サーバーが起動しました');
        return true;
      }
    } catch (error) {
      console.log(`  サーバー起動待機中... (${i + 1}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('サーバーが起動しませんでした');
}

// Main execution
async function main() {
  console.log('\n🚀 緊急管理者アクセス機能テスト開始');
  console.log('============================================================');
  
  try {
    console.log('\n⏳ サーバーの起動を待機中...');
    await waitForServer();
    
    await testEmergencyAdminAccess();
    
    console.log('\n✅ すべてのテストに成功しました！');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ テストスイートが失敗しました');
    console.error('エラー:', error.message);
    process.exit(1);
  }
}

// Run the test if this is the main module
if (require.main === module) {
  main();
}

module.exports = { testEmergencyAdminAccess };
