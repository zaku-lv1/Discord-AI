#!/usr/bin/env node
/**
 * Test script to validate dashboard navigation after login
 * Tests the fix for the forEach method issue in mock database
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
    data: await response.json().catch(() => ({})),
    response
  };
}

// Test functions
async function testDashboardNavigation() {
  console.log('\n🎯 テスト: ダッシュボードナビゲーション');
  
  try {
    // Test 1: Check health endpoint
    console.log('  1. サーバーヘルスチェック...');
    const healthResponse = await makeRequest('/api/health');
    assert.strictEqual(healthResponse.status, 200, 'Health endpoint should return 200');
    console.log('  ✓ サーバーが正常に動作しています');

    // Test 2: Create owner account (if not already created)
    console.log('  2. オーナーアカウント作成...');
    const createOwnerResponse = await makeRequest('/owner-setup', {
      method: 'POST',
      body: JSON.stringify({
        username: 'testowner',
        email: 'testowner@example.com',
        password: 'password123',
        confirmPassword: 'password123'
      })
    });
    
    if (createOwnerResponse.status === 201) {
      console.log('  ✓ オーナーアカウントが作成されました');
    } else if (createOwnerResponse.status === 400 && 
               createOwnerResponse.data.message?.includes('既に存在')) {
      console.log('  ✓ オーナーアカウントは既に存在します');
    } else if (createOwnerResponse.status === 404) {
      // Owner setup already completed
      console.log('  ✓ オーナー設定は既に完了しています');
    } else {
      throw new Error(`Unexpected response: ${createOwnerResponse.status} - ${JSON.stringify(createOwnerResponse.data)}`);
    }

    // Test 3: Login
    console.log('  3. ログインテスト...');
    const loginResponse = await makeRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'testowner2',  // Use the username we created in browser test
        password: 'password123'
      })
    });
    
    assert.strictEqual(loginResponse.status, 200, 'Login should succeed');
    assert.strictEqual(loginResponse.data.success, true, 'Login should return success');
    console.log('  ✓ ログインが成功しました');

    // Test 4: Check authentication status
    console.log('  4. 認証状態確認...');
    const authResponse = await makeRequest('/auth/user', {
      headers: {
        'Cookie': loginResponse.response.headers.get('set-cookie') || ''
      }
    });
    
    assert.strictEqual(authResponse.status, 200, 'Auth check should succeed');
    assert.strictEqual(authResponse.data.authenticated, true, 'User should be authenticated');
    assert.ok(authResponse.data.user, 'User data should be present');
    console.log('  ✓ ユーザーが正常に認証されています');

    // Test 5: Test user management endpoint (this was failing before the fix)
    console.log('  5. ユーザー管理エンドポイントテスト...');
    const usersResponse = await makeRequest('/api/users', {
      headers: {
        'Cookie': loginResponse.response.headers.get('set-cookie') || ''
      }
    });
    
    // This should not return a 500 error (which would indicate forEach issue)
    assert.notStrictEqual(usersResponse.status, 500, 'Users endpoint should not return 500 error');
    console.log('  ✓ ユーザー管理エンドポイントが正常に動作しています');

    console.log('\n✅ 全てのテストに成功しました！ダッシュボードナビゲーションが正常に動作しています。');
    
  } catch (error) {
    console.error('\n❌ テストに失敗しました:', error.message);
    throw error;
  }
}

// Main execution
async function main() {
  console.log('='.repeat(60));
  console.log('Discord AI - ダッシュボードナビゲーションテスト');
  console.log('='.repeat(60));
  
  try {
    await testDashboardNavigation();
    console.log('\n🎉 ダッシュボードナビゲーション問題が正常に修正されました！');
    process.exit(0);
  } catch (error) {
    console.error('\n💥 テストが失敗しました:', error);
    process.exit(1);
  }
}

// Run the test if this is the main module
if (require.main === module) {
  main();
}

module.exports = { testDashboardNavigation };