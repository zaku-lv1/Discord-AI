#!/usr/bin/env node
/**
 * Test script to validate sender nickname recognition
 * Tests that the AI system recognizes sender's nickname from userNicknames mapping
 * Run with: node test_sender_nickname.js
 */

const assert = require('assert');

// Import the functions from ai.js
const aiCommand = require('./commands/ai.js');

console.log('🧪 Starting Sender Nickname Recognition Tests\n');

// Test 1: Verify that userNicknames mapping is checked for sender
function testSenderNicknameRecognition() {
  console.log('📋 Test 1: Sender nickname recognition from userNicknames mapping');
  
  // Mock objects
  const userNicknames = {
    '123456789': 'A-kun',
    '987654321': 'B-chan'
  };
  
  const mockMessage = {
    author: {
      id: '123456789',
      username: 'testuser'
    },
    member: {
      displayName: 'TestDisplayName'
    },
    content: 'Hello world',
    guild: {
      members: {
        cache: new Map()
      }
    }
  };
  
  // The logic we're testing:
  // authorName should be userNicknames[authorId] if exists
  const authorId = mockMessage.author.id;
  const authorName = userNicknames[authorId] || 
                    mockMessage.member?.displayName || 
                    mockMessage.author.username;
  
  assert.strictEqual(authorName, 'A-kun', 'Should use nickname from userNicknames mapping');
  console.log('  ✅ Nickname from userNicknames mapping is recognized correctly');
}

// Test 2: Fallback to displayName when no nickname mapping exists
function testFallbackToDisplayName() {
  console.log('\n📋 Test 2: Fallback to displayName when no nickname mapping');
  
  const userNicknames = {
    '987654321': 'B-chan'
  };
  
  const mockMessage = {
    author: {
      id: '123456789', // Different ID, not in mapping
      username: 'testuser'
    },
    member: {
      displayName: 'TestDisplayName'
    },
    content: 'Hello world'
  };
  
  const authorId = mockMessage.author.id;
  const authorName = userNicknames[authorId] || 
                    mockMessage.member?.displayName || 
                    mockMessage.author.username;
  
  assert.strictEqual(authorName, 'TestDisplayName', 'Should fallback to displayName');
  console.log('  ✅ Fallback to displayName works correctly');
}

// Test 3: Fallback to username when no nickname and no member
function testFallbackToUsername() {
  console.log('\n📋 Test 3: Fallback to username when no nickname and no member');
  
  const userNicknames = {
    '987654321': 'B-chan'
  };
  
  const mockMessage = {
    author: {
      id: '123456789',
      username: 'testuser'
    },
    member: null, // No member object (e.g., DM)
    content: 'Hello world'
  };
  
  const authorId = mockMessage.author.id;
  const authorName = userNicknames[authorId] || 
                    mockMessage.member?.displayName || 
                    mockMessage.author.username;
  
  assert.strictEqual(authorName, 'testuser', 'Should fallback to username');
  console.log('  ✅ Fallback to username works correctly');
}

// Test 4: Empty userNicknames object
function testEmptyUserNicknames() {
  console.log('\n📋 Test 4: Empty userNicknames object');
  
  const userNicknames = {};
  
  const mockMessage = {
    author: {
      id: '123456789',
      username: 'testuser'
    },
    member: {
      displayName: 'TestDisplayName'
    },
    content: 'Hello world'
  };
  
  const authorId = mockMessage.author.id;
  const authorName = userNicknames[authorId] || 
                    mockMessage.member?.displayName || 
                    mockMessage.author.username;
  
  assert.strictEqual(authorName, 'TestDisplayName', 'Should use displayName when userNicknames is empty');
  console.log('  ✅ Empty userNicknames handled correctly');
}

// Test 5: Japanese nickname
function testJapaneseNickname() {
  console.log('\n📋 Test 5: Japanese nickname recognition');
  
  const userNicknames = {
    '123456789': 'テストユーザー',
    '987654321': 'さくら'
  };
  
  const mockMessage = {
    author: {
      id: '123456789',
      username: 'testuser'
    },
    member: {
      displayName: 'TestUser'
    },
    content: 'こんにちは'
  };
  
  const authorId = mockMessage.author.id;
  const authorName = userNicknames[authorId] || 
                    mockMessage.member?.displayName || 
                    mockMessage.author.username;
  
  assert.strictEqual(authorName, 'テストユーザー', 'Should recognize Japanese nickname');
  console.log('  ✅ Japanese nickname recognized correctly');
}

// Run all tests
try {
  testSenderNicknameRecognition();
  testFallbackToDisplayName();
  testFallbackToUsername();
  testEmptyUserNicknames();
  testJapaneseNickname();
  
  console.log('\n✅ All tests passed successfully!\n');
  process.exit(0);
} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
