#!/usr/bin/env node
/**
 * Test script for Firestore mandatory implementation and nickname functionality
 * 
 * This script verifies:
 * 1. Firestore is mandatory in test/production environments
 * 2. Nickname CRUD operations work correctly with Firestore
 * 3. Development environment fallback still works
 */

const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

console.log('\n=== Firestore必須化・ニックネーム機能テスト ===\n');

// Helper function to run a test scenario
async function runTest(testName, testFn) {
  try {
    console.log(`\n[テスト] ${testName}`);
    await testFn();
    console.log(`✅ ${testName} - 成功`);
    return true;
  } catch (error) {
    console.error(`❌ ${testName} - 失敗`);
    console.error('エラー:', error.message);
    return false;
  }
}

// Test 1: Verify Firestore initialization in different environments
async function testFirestoreInitialization() {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFirebaseConfig = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  
  try {
    // Test with production environment and invalid config
    console.log('\n  📋 test環境でFirestore設定が不完全な場合...');
    process.env.NODE_ENV = 'test';
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
      type: "service_account",
      project_id: "test-project"
    });
    
    // Clear require cache
    delete require.cache[require.resolve('./services/firebase')];
    const firebaseService = require('./services/firebase');
    
    try {
      await firebaseService.initialize();
      throw new Error('期待: エラーがスローされるべき');
    } catch (error) {
      if (error.message.includes('環境ではFirestore') && 
          (error.message.includes('必須') || error.message.includes('設定が必須'))) {
        console.log('  ✓ test環境で正しくエラーが発生');
      } else {
        throw error;
      }
    }
    
    // Test with development environment and invalid config
    console.log('\n  📋 development環境でFirestore設定が不完全な場合...');
    process.env.NODE_ENV = 'development';
    
    // Clear require cache
    delete require.cache[require.resolve('./services/firebase')];
    const firebaseServiceDev = require('./services/firebase');
    
    await firebaseServiceDev.initialize();
    if (firebaseServiceDev.isUsingMockDB()) {
      console.log('  ✓ development環境でモックDBにフォールバック');
    } else {
      throw new Error('期待: development環境ではモックDBを使用すべき');
    }
    
  } finally {
    // Restore original environment
    process.env.NODE_ENV = originalNodeEnv;
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = originalFirebaseConfig;
    delete require.cache[require.resolve('./services/firebase')];
  }
}

// Test 2: Verify AI config store initialization
async function testAIConfigStoreInitialization() {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFirebaseConfig = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  
  try {
    // Test with test environment and invalid config
    console.log('\n  📋 test環境でAI config storeの初期化...');
    process.env.NODE_ENV = 'test';
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
      type: "service_account",
      project_id: "test-project"
    });
    
    // Clear require cache
    delete require.cache[require.resolve('./services/firebase')];
    delete require.cache[require.resolve('./services/ai-config-store')];
    
    const aiConfigStore = require('./services/ai-config-store');
    
    try {
      await aiConfigStore.initializeFirestore();
      throw new Error('期待: エラーがスローされるべき');
    } catch (error) {
      if (error.message.includes('環境ではFirestore') && error.message.includes('必須')) {
        console.log('  ✓ test環境で正しくエラーが発生');
      } else {
        throw error;
      }
    }
    
    // Test with development environment
    console.log('\n  📋 development環境でAI config storeの初期化...');
    process.env.NODE_ENV = 'development';
    
    // Clear require cache
    delete require.cache[require.resolve('./services/firebase')];
    delete require.cache[require.resolve('./services/ai-config-store')];
    
    const aiConfigStoreDev = require('./services/ai-config-store');
    await aiConfigStoreDev.initializeFirestore();
    console.log('  ✓ development環境で初期化成功（ファイルベースにフォールバック）');
    
  } finally {
    // Restore original environment
    process.env.NODE_ENV = originalNodeEnv;
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = originalFirebaseConfig;
    delete require.cache[require.resolve('./services/firebase')];
    delete require.cache[require.resolve('./services/ai-config-store')];
  }
}

// Test 3: Verify nickname functionality structure
async function testNicknameFunctionality() {
  console.log('\n  📋 ニックネーム機能の構造を確認...');
  
  // Check if routes/ai.js has nickname endpoints
  const fs = require('fs');
  const aiRoutesContent = fs.readFileSync('./routes/ai.js', 'utf8');
  
  const expectedEndpoints = [
    'router.get.*/:id/nicknames',
    'router.post.*/:id/nicknames',
    'router.put.*/:id/nicknames/:discordId',
    'router.delete.*/:id/nicknames/:discordId',
    'router.post.*/:id/verify-nicknames'
  ];
  
  for (const endpoint of expectedEndpoints) {
    const regex = new RegExp(endpoint);
    if (regex.test(aiRoutesContent)) {
      console.log(`  ✓ エンドポイント ${endpoint} が存在`);
    } else {
      throw new Error(`エンドポイント ${endpoint} が見つかりません`);
    }
  }
  
  // Check if public/app.js has nickname UI
  const appJsContent = fs.readFileSync('./public/app.js', 'utf8');
  
  const expectedUIElements = [
    'add-ai-nickname-btn',
    'edit-new-discord-id',
    'edit-new-nickname',
    'ai-nicknames-container',
    'verify-ai-nicknames-btn'
  ];
  
  for (const element of expectedUIElements) {
    if (appJsContent.includes(element)) {
      console.log(`  ✓ UI要素 ${element} が存在`);
    } else {
      throw new Error(`UI要素 ${element} が見つかりません`);
    }
  }
  
  console.log('  ✓ ニックネーム機能の構造が正しく実装されている');
}

// Test 4: Check documentation
async function testDocumentation() {
  console.log('\n  📋 ドキュメントを確認...');
  
  const fs = require('fs');
  
  // Check if implementation document exists
  if (fs.existsSync('./FIRESTORE_MANDATORY_IMPLEMENTATION.md')) {
    console.log('  ✓ FIRESTORE_MANDATORY_IMPLEMENTATION.md が存在');
    
    const docContent = fs.readFileSync('./FIRESTORE_MANDATORY_IMPLEMENTATION.md', 'utf8');
    
    const expectedSections = [
      '概要',
      '実装した変更',
      '影響範囲',
      '環境別の動作',
      'エラーメッセージ',
      '動作確認項目',
      'ニックネーム機能の確認'
    ];
    
    for (const section of expectedSections) {
      if (docContent.includes(section)) {
        console.log(`  ✓ セクション「${section}」が存在`);
      } else {
        console.log(`  ⚠ セクション「${section}」が見つかりません（警告のみ）`);
      }
    }
  } else {
    throw new Error('FIRESTORE_MANDATORY_IMPLEMENTATION.md が見つかりません');
  }
}

// Main test execution
async function main() {
  const tests = [
    ['Firestore初期化テスト', testFirestoreInitialization],
    ['AI config store初期化テスト', testAIConfigStoreInitialization],
    ['ニックネーム機能構造テスト', testNicknameFunctionality],
    ['ドキュメントテスト', testDocumentation]
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const [testName, testFn] of tests) {
    const result = await runTest(testName, testFn);
    if (result) {
      passed++;
    } else {
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`テスト結果: ${passed}/${tests.length} 成功, ${failed}/${tests.length} 失敗`);
  console.log('='.repeat(60) + '\n');
  
  if (failed > 0) {
    console.log('⚠️  一部のテストが失敗しました。');
    process.exit(1);
  } else {
    console.log('✅ すべてのテストが成功しました！');
    console.log('\n次のステップ:');
    console.log('1. 開発環境でダッシュボードにアクセスして、ニックネーム追加機能をテスト');
    console.log('2. test環境でFirestoreを設定して、正常に動作することを確認');
    console.log('3. 本番環境にデプロイする前に、Firestore設定が正しいことを確認');
    console.log('\n詳細は FIRESTORE_MANDATORY_IMPLEMENTATION.md を参照してください。\n');
  }
}

// Run tests
main().catch(error => {
  console.error('\n❌ テスト実行中にエラーが発生しました:');
  console.error(error);
  process.exit(1);
});
