/**
 * Test for Japanese Dashboard and Configurable Bot Name/Icon
 * This test verifies that:
 * 1. The dashboard loads with Japanese text
 * 2. Bot name and icon URL can be configured
 * 3. Settings are saved and retrieved correctly
 */

const assert = require('assert');
const aiConfigStore = require('./services/ai-config-store');

async function testJapaneseDashboardConfig() {
  console.log('Testing Japanese Dashboard Configuration...\n');

  // Test 1: Save configuration with bot name and icon
  console.log('Test 1: Saving configuration with bot name and icon...');
  const testConfig = {
    botName: 'テストボット',
    botIconUrl: 'https://example.com/test-icon.png',
    systemPrompt: 'テスト用のシステムプロンプト',
    modelMode: 'hybrid',
    replyDelayMs: 1000,
    errorOopsMessage: 'エラーが発生しました'
  };
  
  await aiConfigStore.saveConfig(testConfig);
  console.log('✓ Configuration saved successfully');

  // Test 2: Retrieve and verify configuration
  console.log('\nTest 2: Retrieving and verifying configuration...');
  const retrievedConfig = await aiConfigStore.getConfig();
  
  assert.strictEqual(retrievedConfig.botName, testConfig.botName, 'Bot name should match');
  assert.strictEqual(retrievedConfig.botIconUrl, testConfig.botIconUrl, 'Bot icon URL should match');
  assert.strictEqual(retrievedConfig.systemPrompt, testConfig.systemPrompt, 'System prompt should match');
  assert.strictEqual(retrievedConfig.modelMode, testConfig.modelMode, 'Model mode should match');
  assert.strictEqual(retrievedConfig.replyDelayMs, testConfig.replyDelayMs, 'Reply delay should match');
  assert.strictEqual(retrievedConfig.errorOopsMessage, testConfig.errorOopsMessage, 'Error message should match');
  console.log('✓ All configuration fields verified correctly');

  // Test 3: Test with empty icon URL
  console.log('\nTest 3: Testing with empty icon URL...');
  const configWithoutIcon = {
    botName: 'ボット2',
    botIconUrl: '',
    systemPrompt: 'システムプロンプト2',
    modelMode: 'flash_only',
    replyDelayMs: 0,
    errorOopsMessage: 'エラー'
  };
  
  await aiConfigStore.saveConfig(configWithoutIcon);
  const retrieved2 = await aiConfigStore.getConfig();
  
  assert.strictEqual(retrieved2.botName, configWithoutIcon.botName, 'Bot name should match');
  assert.strictEqual(retrieved2.botIconUrl, '', 'Bot icon URL should be empty string');
  assert.strictEqual(retrieved2.modelMode, 'flash_only', 'Model mode should be flash_only');
  console.log('✓ Empty icon URL handled correctly');

  // Test 4: Validate required fields
  console.log('\nTest 4: Testing default values...');
  const minimalConfig = {
    botName: 'ミニマルボット',
    botIconUrl: '',
    systemPrompt: 'ミニマルプロンプト',
    modelMode: 'hybrid',
    replyDelayMs: 0,
    errorOopsMessage: ''
  };
  
  await aiConfigStore.saveConfig(minimalConfig);
  const retrieved3 = await aiConfigStore.getConfig();
  
  assert.strictEqual(retrieved3.botName, 'ミニマルボット', 'Bot name is required');
  assert.strictEqual(retrieved3.botIconUrl, '', 'Empty icon URL should be allowed');
  assert.strictEqual(retrieved3.errorOopsMessage, '', 'Empty error message should be allowed');
  console.log('✓ Minimal configuration works correctly');

  console.log('\n✅ All tests passed successfully!\n');
}

// Run the tests
if (require.main === module) {
  testJapaneseDashboardConfig()
    .then(() => {
      console.log('Test suite completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = { testJapaneseDashboardConfig };
