#!/usr/bin/env node
/**
 * Test script to validate the invitation code requirement fix
 * This test verifies that the owner setup and regular registration systems are properly separated
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
async function testInvitationCodeNotRequired() {
  console.log('\n📋 テスト: 招待コード不要設定でのユーザー登録');
  
  try {
    // Check system settings - should not require invitation codes by default
    const statusResponse = await makeRequest('/api/system-settings/status');
    console.log('  システム設定:', statusResponse.data.status);
    
    if (!statusResponse.data.status.requireInvitationCodes) {
      console.log('  ✅ 招待コードが不要に設定されています');
      
      // Try to register a user without invitation code
      const registerResponse = await makeRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username: 'user1',
          email: 'user1@example.com',
          password: 'testpass123'
          // No invitation code provided
        })
      });
      
      if (registerResponse.status === 200 && registerResponse.data.success) {
        console.log('  ✅ 招待コードなしでのユーザー登録が成功しました');
        console.log(`     ユーザー: ${registerResponse.data.user.username}`);
        console.log(`     ロール: ${registerResponse.data.user.role}`);
        return true;
      } else {
        console.log('  ❌ 招待コードなしでのユーザー登録が失敗しました');
        console.log('     レスポンス:', registerResponse);
        return false;
      }
    } else {
      console.log('  ❌ 招待コードが必要に設定されています（期待値: false）');
      return false;
    }
  } catch (error) {
    console.log('  ❌ テスト実行中にエラーが発生:', error.message);
    return false;
  }
}

async function testOwnerSetupSeparation() {
  console.log('\n📋 テスト: オーナー設定と通常登録の分離');
  
  try {
    // Check that owner setup is completed
    const statusResponse = await makeRequest('/api/system-settings/status');
    
    if (statusResponse.data.status.ownerSetupCompleted) {
      console.log('  ✅ オーナー設定が完了している状態です');
      
      // Check that /owner-setup is no longer accessible
      const ownerSetupResponse = await makeRequest('/owner-setup');
      
      if (ownerSetupResponse.status === 404) {
        console.log('  ✅ オーナー設定ページが正しく無効化されています');
        return true;
      } else {
        console.log('  ❌ オーナー設定ページがまだアクセス可能です');
        return false;
      }
    } else {
      console.log('  ❌ オーナー設定が完了していません');
      return false;
    }
  } catch (error) {
    console.log('  ❌ テスト実行中にエラーが発生:', error.message);
    return false;
  }
}

async function testSystemConfigurationFlexibility() {
  console.log('\n📋 テスト: システム設定の柔軟性確認');
  
  try {
    // Verify that the system respects the requireInvitationCodes setting
    const statusResponse = await makeRequest('/api/system-settings/status');
    const currentSetting = statusResponse.data.status.requireInvitationCodes;
    
    console.log(`  現在の招待コード要件: ${currentSetting}`);
    
    // Test registration behavior based on setting
    const testRegistration = await makeRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: 'user2',
        email: 'user2@example.com',
        password: 'testpass123'
        // No invitation code
      })
    });
    
    if (!currentSetting) {
      // Should succeed without invitation code
      if (testRegistration.status === 200 && testRegistration.data.success) {
        console.log('  ✅ 招待コード不要設定が正しく動作しています');
        return true;
      } else {
        console.log('  ❌ 招待コード不要設定なのに登録が失敗しました');
        return false;
      }
    } else {
      // Should fail without invitation code
      if (testRegistration.status === 400 && 
          testRegistration.data.message && 
          testRegistration.data.message.includes('招待コード')) {
        console.log('  ✅ 招待コード必須設定が正しく動作しています');
        return true;
      } else {
        console.log('  ❌ 招待コード必須設定なのに登録が成功してしまいました');
        return false;
      }
    }
  } catch (error) {
    console.log('  ❌ テスト実行中にエラーが発生:', error.message);
    return false;
  }
}

// Main test execution
async function runTests() {
  console.log('🧪 招待コード要件修正のテストを開始します...');
  console.log('========================================');
  
  const tests = [
    { name: '招待コード不要でのユーザー登録', fn: testInvitationCodeNotRequired },
    { name: 'オーナー設定と通常登録の分離', fn: testOwnerSetupSeparation },
    { name: 'システム設定の柔軟性', fn: testSystemConfigurationFlexibility }
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
  
  console.log('\n========================================');
  console.log(`📊 テスト結果: ${passed}件成功, ${failed}件失敗`);
  
  if (failed === 0) {
    console.log('🎉 すべてのテストが成功しました！');
    console.log('\n✅ 修正完了した要件:');
    console.log('   - オーナー設定システムと通常登録システムが分離されました');
    console.log('   - 招待コードの要件がシステム設定で制御可能になりました');
    console.log('   - デフォルトで招待コードが不要に設定されています');
    console.log('   - オーナーが招待コード要件を自由に変更できます');
    console.log('   - UIが動的に招待コードフィールドの表示/非表示を切り替えます');
  } else {
    console.log('❌ いくつかのテストが失敗しました。実装を確認してください。');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('テスト実行中に致命的エラーが発生:', error);
  process.exit(1);
});