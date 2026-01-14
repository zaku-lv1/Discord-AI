#!/usr/bin/env node
/**
 * Test script to verify Firebase integration for AI settings and conversation history
 * Tests:
 * 1. AI config store with nicknames
 * 2. Conversation history service
 * 3. Nickname replacement functions
 */

const assert = require('assert');

console.log('\n🧪 Firebase Integration Test Suite\n');
console.log('='.repeat(50));

// Test 1: AI Config Store
async function testAIConfigStore() {
  console.log('\n📋 Test 1: AI Config Store with Nicknames');
  
  try {
    const aiConfigStore = require('./services/ai-config-store');
    
    // Initialize Firestore
    await aiConfigStore.initializeFirestore();
    console.log('  ✓ AI config store initialized');
    
    // Get config
    const config = await aiConfigStore.getConfig();
    console.log('  ✓ Config retrieved');
    
    // Verify default structure includes userNicknames
    assert(typeof config.userNicknames === 'object', 'Config should have userNicknames object');
    console.log('  ✓ Config has userNicknames field');
    
    // Test adding a nickname
    const testNicknames = {
      '123456789012345678': 'TestUser1',
      '987654321098765432': 'TestUser2'
    };
    
    await aiConfigStore.updateConfig({ userNicknames: testNicknames });
    console.log('  ✓ Updated config with test nicknames');
    
    // Verify update
    const updatedConfig = await aiConfigStore.getConfig();
    assert.deepStrictEqual(updatedConfig.userNicknames, testNicknames, 'Nicknames should be saved');
    console.log('  ✓ Nicknames persisted correctly');
    
    console.log('\n✅ Test 1 Passed: AI Config Store');
    return true;
  } catch (error) {
    console.error('\n❌ Test 1 Failed:', error.message);
    return false;
  }
}

// Test 2: Conversation History Service
async function testConversationHistory() {
  console.log('\n📋 Test 2: Conversation History Service');
  
  try {
    const conversationHistory = require('./services/conversation-history');
    
    const testChannelId = 'test_channel_123';
    const testBotName = 'TestBot';
    
    // Test initial empty history
    const initialHistory = await conversationHistory.getHistory(testChannelId, testBotName);
    console.log('  ✓ Retrieved initial history');
    assert(Array.isArray(initialHistory), 'History should be an array');
    
    // Test adding a message
    const testUserMessage = 'Hello, bot!';
    const testAIResponse = 'Hello! How can I help you?';
    
    const updatedHistory = await conversationHistory.addMessage(
      testChannelId,
      testBotName,
      testUserMessage,
      testAIResponse
    );
    console.log('  ✓ Added message to history');
    assert(updatedHistory.length >= 2, 'History should have at least 2 messages (user + AI)');
    
    // Test retrieving history
    const retrievedHistory = await conversationHistory.getHistory(testChannelId, testBotName);
    console.log('  ✓ Retrieved updated history');
    assert(retrievedHistory.length >= 2, 'Retrieved history should match');
    
    // Test clearing history
    await conversationHistory.clearHistory(testChannelId, testBotName);
    const clearedHistory = await conversationHistory.getHistory(testChannelId, testBotName);
    console.log('  ✓ Cleared history');
    assert(clearedHistory.length === 0, 'History should be empty after clearing');
    
    console.log('\n✅ Test 2 Passed: Conversation History Service');
    return true;
  } catch (error) {
    console.error('\n❌ Test 2 Failed:', error.message);
    return false;
  }
}

// Test 3: Nickname Replacement Functions
function testNicknameReplacementFunctions() {
  console.log('\n📋 Test 3: Nickname Replacement Functions');
  
  try {
    const aiCommand = require('./commands/ai');
    
    // Test escapeRegExp
    const testString = 'A-kun.is*awesome?';
    const escaped = aiCommand.escapeRegExp(testString);
    console.log('  ✓ escapeRegExp function works');
    
    // Test replaceNicknamesWithMentions
    const testMessage = 'Hello TestUser1, how are you?';
    const testNicknames = {
      '123456789012345678': 'TestUser1',
      '987654321098765432': 'TestUser2'
    };
    
    const mockGuild = {
      members: {
        cache: new Map([
          ['123456789012345678', { displayName: 'Test User 1' }],
          ['987654321098765432', { displayName: 'Test User 2' }]
        ])
      }
    };
    
    const withMentions = aiCommand.replaceNicknamesWithMentions(testMessage, testNicknames, mockGuild);
    console.log('  ✓ replaceNicknamesWithMentions function works');
    assert(withMentions.includes('<@123456789012345678>'), 'Should contain mention');
    
    // Test replaceMentionsWithNicknames
    const mentionMessage = 'Hello <@123456789012345678>, how are you?';
    const withNicknames = aiCommand.replaceMentionsWithNicknames(mentionMessage, testNicknames, mockGuild);
    console.log('  ✓ replaceMentionsWithNicknames function works');
    assert(withNicknames.includes('@TestUser1'), 'Should contain nickname');
    
    console.log('\n✅ Test 3 Passed: Nickname Replacement Functions');
    return true;
  } catch (error) {
    console.error('\n❌ Test 3 Failed:', error.message);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log('\n🚀 Starting Firebase Integration Tests...\n');
  
  const results = {
    configStore: await testAIConfigStore(),
    conversationHistory: await testConversationHistory(),
    nicknameFunctions: testNicknameReplacementFunctions()
  };
  
  console.log('\n' + '='.repeat(50));
  console.log('\n📊 Test Results Summary:');
  console.log(`  AI Config Store: ${results.configStore ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Conversation History: ${results.conversationHistory ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Nickname Functions: ${results.nicknameFunctions ? '✅ PASS' : '❌ FAIL'}`);
  
  const allPassed = Object.values(results).every(r => r === true);
  
  console.log('\n' + '='.repeat(50));
  if (allPassed) {
    console.log('\n🎉 All tests passed! Firebase integration is working correctly.\n');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Please review the errors above.\n');
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('\n❌ Test suite failed with error:', error);
  process.exit(1);
});
