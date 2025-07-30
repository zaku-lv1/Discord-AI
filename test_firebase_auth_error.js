#!/usr/bin/env node

// Test script to reproduce Firebase authentication error
require('dotenv').config();

// Simulate invalid Firebase credentials to trigger auth error
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
  "type": "service_account",
  "project_id": "invalid-project-id",
  "private_key_id": "invalid",
  "private_key": "-----BEGIN PRIVATE KEY-----\ninvalid\n-----END PRIVATE KEY-----\n",
  "client_email": "invalid@invalid.iam.gserviceaccount.com",
  "client_id": "invalid",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token"
});

const firebaseService = require('./services/firebase');

async function testFirebaseAuth() {
  console.log('=== Testing Firebase Authentication Error ===\n');
  
  try {
    // This should trigger the authentication error with real Firebase credentials
    await firebaseService.initialize();
    console.log('[INFO] Firebase service initialized');
    
    const db = firebaseService.getDB();
    
    // Try to perform a database operation that would trigger auth error
    console.log('[INFO] Attempting database operation...');
    await db.collection('users').doc('test').set({ name: 'test' });
    console.log('[OK] Database operation successful');
    
  } catch (error) {
    console.error('[ERROR] Test failed:', error.message);
  }
}

if (require.main === module) {
  testFirebaseAuth();
}