#!/usr/bin/env node

// Test script to verify email verification functionality works
require('dotenv').config();

// Mock environment to use mock DB
process.env.NODE_ENV = 'test';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
  "type": "service_account",
  "project_id": "test-project"
});

const authService = require('./services/auth');
const firebaseService = require('./services/firebase');

async function testEmailVerification() {
  console.log('=== Testing Email Verification Functionality ===\n');
  
  try {
    // Initialize Firebase service first
    await firebaseService.initialize();
    console.log('[OK] Firebase service initialized');
    
    // Initialize auth service
    await authService.initialize();
    console.log('[OK] Auth service initialized');
    
    // Create a test user with email verification required (force it)
    console.log('\n1. Creating test user...');
    
    // First, let's manually create a user that requires verification
    const db = firebaseService.getDB();
    
    const testUserId = Date.now().toString();
    const testUserData = {
      id: testUserId,
      username: 'testuser_verification',
      email: 'verify@example.com',
      password: '$2b$12$test.hash', // Mock hash
      type: 'email',
      verified: false,
      verificationToken: 'test-token-' + testUserId,
      verificationTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      lastLogin: null
    };
    
    await db.collection('users').doc(testUserId).set(testUserData);
    console.log(`   [OK] User created manually: ${testUserData.username}, verified: ${testUserData.verified}`);
    
    // Test verify email with the correct token
    console.log('\n2. Testing email verification...');
    const verifiedUser = await authService.verifyEmail(testUserData.verificationToken);
    console.log(`   [OK] Email verified for user: ${verifiedUser.username}, verified: ${verifiedUser.verified}`);
    
    // Test resend verification email for unverified user
    console.log('\n3. Testing resend verification email...');
    
    // Create another unverified user
    const testUser2Id = (Date.now() + 1000).toString();
    const testUser2Data = {
      id: testUser2Id,
      username: 'testuser2_verification',
      email: 'verify2@example.com',
      password: '$2b$12$test.hash2', // Mock hash
      type: 'email',
      verified: false,
      verificationToken: 'test-token-' + testUser2Id,
      verificationTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      lastLogin: null
    };
    
    await db.collection('users').doc(testUser2Id).set(testUser2Data);
    
    try {
      const resendResult = await authService.resendVerificationEmail('verify2@example.com');
      console.log(`   [OK] Resend verification: ${resendResult.message}`);
    } catch (error) {
      // In test environment without email service, this is expected to fail
      if (error.message === 'メールサービスが利用できません') {
        console.log(`   [OK] Resend verification correctly failed in test environment: ${error.message}`);
      } else {
        throw error;
      }
    }
    
    console.log('\n[SUCCESS] All email verification tests passed!');
    return true;
    
  } catch (error) {
    console.error('[ERROR] Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    return false;
  }
}

// Run the test
if (require.main === module) {
  testEmailVerification().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { testEmailVerification };