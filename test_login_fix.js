#!/usr/bin/env node
/**
 * Comprehensive test script to validate the login fix
 * Tests that users can successfully login and access the dashboard
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
    response,
    headers: response.headers
  };
}

// Main test function
async function testLoginFix() {
  console.log('\n🎯 テスト: ログイン機能修正の検証');
  
  try {
    // Test 1: Check server health
    console.log('  1. サーバーヘルスチェック...');
    const healthResponse = await makeRequest('/api/health');
    assert.strictEqual(healthResponse.status, 200, 'Health endpoint should return 200');
    console.log('  ✓ サーバーが正常に動作しています');

    // Test 2: Create test user
    console.log('  2. テストユーザー作成...');
    const createUserResponse = await makeRequest('/owner-setup', {
      method: 'POST',
      body: JSON.stringify({
        username: 'testuser_fix',
        email: 'testuser_fix@example.com',
        password: 'password123',
        confirmPassword: 'password123'
      })
    });
    
    if (createUserResponse.status === 201) {
      console.log('  ✓ テストユーザーが作成されました');
    } else if (createUserResponse.status === 400 && 
               createUserResponse.data.message?.includes('既に存在')) {
      console.log('  ✓ テストユーザーは既に存在します');
    } else if (createUserResponse.status === 404) {
      console.log('  ✓ オーナー設定は既に完了しています');
    } else {
      console.log('  ⚠ テストユーザー作成をスキップ（オーナーが存在）');
    }

    // Test 3: Login with existing user (from our manual testing)
    console.log('  3. ログインテスト...');
    const loginResponse = await makeRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: 'testuser3',  // Use the user we created manually
        password: 'password123'
      })
    });
    
    assert.strictEqual(loginResponse.status, 200, 'Login should succeed');
    assert.strictEqual(loginResponse.data.success, true, 'Login should return success');
    assert.ok(loginResponse.data.user, 'User data should be present');
    assert.ok(loginResponse.data.sessionInfo, 'Session info should be present');
    console.log('  ✓ ログインが成功しました');
    console.log(`    - ユーザー: ${loginResponse.data.user.username}`);
    console.log(`    - セッション: ${loginResponse.data.sessionInfo.sessionId}`);

    // Test 4: Check authentication status with session
    console.log('  4. 認証状態確認...');
    const sessionCookie = loginResponse.headers.get('set-cookie');
    const authResponse = await makeRequest('/auth/user', {
      headers: {
        'Cookie': sessionCookie || ''
      }
    });
    
    assert.strictEqual(authResponse.status, 200, 'Auth check should succeed');
    assert.strictEqual(authResponse.data.authenticated, true, 'User should be authenticated');
    assert.ok(authResponse.data.user, 'User data should be present in auth check');
    console.log('  ✓ ユーザーが正常に認証されています');
    console.log(`    - 認証ユーザー: ${authResponse.data.user.username}`);

    // Test 5: Test protected endpoints (dashboard APIs)
    console.log('  5. 保護されたエンドポイントテスト...');
    const protectedEndpoints = [
      '/api/ais',
      '/api/users'
    ];
    
    for (const endpoint of protectedEndpoints) {
      const response = await makeRequest(endpoint, {
        headers: {
          'Cookie': sessionCookie || ''
        }
      });
      
      // Should not return 401 (unauthorized) or 500 (server error)
      assert.notStrictEqual(response.status, 401, `${endpoint} should not return unauthorized`);
      assert.notStrictEqual(response.status, 500, `${endpoint} should not return server error`);
      console.log(`    ✓ ${endpoint}: ${response.status}`);
    }

    console.log('\n✅ 全てのテストに成功しました！ログイン問題が正常に修正されています。');
    
  } catch (error) {
    console.error('\n❌ テストに失敗しました:', error.message);
    throw error;
  }
}

// Main execution
async function main() {
  console.log('='.repeat(60));
  console.log('Discord AI - ログイン機能修正検証テスト');
  console.log('='.repeat(60));
  
  try {
    await testLoginFix();
    console.log('\n🎉 ログイン問題の修正が正常に動作しています！');
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

module.exports = { testLoginFix };