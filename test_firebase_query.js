#!/usr/bin/env node

// Test script to reproduce the Firebase query chaining issue
require('dotenv').config();

// Mock environment to use mock DB
process.env.NODE_ENV = 'test';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
  "type": "service_account",
  "project_id": "test-project"
});

const firebaseService = require('./services/firebase');

async function testFirebaseQueryChaining() {
  console.log('=== Testing Firebase Query Chaining ===\n');
  
  try {
    // Initialize Firebase service
    await firebaseService.initialize();
    console.log('[OK] Firebase service initialized');
    
    const db = firebaseService.getDB();
    
    // Add a test user to the mock database
    await db.collection('users').doc('test1').set({
      id: 'test1',
      username: 'testuser',
      email: 'test@example.com',
      verificationToken: 'test-token-123',
      verified: false
    });
    console.log('[OK] Test user added to mock database');
    
    // Test single where query (this should work)
    console.log('\n1. Testing single .where() query:');
    const singleQuery = await db.collection('users').where('email', '==', 'test@example.com').get();
    console.log(`   Found ${singleQuery.docs.length} documents`);
    
    // Test chained where queries (this should fail with current implementation)
    console.log('\n2. Testing chained .where() queries:');
    try {
      const chainedQuery = await db.collection('users')
        .where('verificationToken', '==', 'test-token-123')
        .where('verified', '==', false)
        .get();
      console.log(`   [SUCCESS] Found ${chainedQuery.docs.length} documents with chained query`);
    } catch (error) {
      console.log(`   [ERROR] Chained query failed: ${error.message}`);
      console.log(`   [INFO] This is the bug we need to fix!`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('[ERROR] Test failed:', error.message);
    return false;
  }
}

// Run the test
if (require.main === module) {
  testFirebaseQueryChaining().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { testFirebaseQueryChaining };