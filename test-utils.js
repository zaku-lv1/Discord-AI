#!/usr/bin/env node
/**
 * Test utilities for resetting database state
 * Used to ensure clean test environment
 */

const firebaseService = require('./services/firebase');

async function resetTestEnvironment() {
  try {
    console.log('🧹 Resetting test environment...');
    
    // Initialize Firebase service
    await firebaseService.initialize();
    
    // Reset mock database if being used
    if (firebaseService.isUsingMockDB()) {
      firebaseService.resetMockDB();
      console.log('✅ Mock database reset complete');
    } else {
      console.log('⚠️  Using real Firebase - database not reset');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Failed to reset test environment:', error);
    return false;
  }
}

// If run directly, execute the reset
if (require.main === module) {
  resetTestEnvironment()
    .then(success => {
      process.exit(success ? 0 : 1);
    });
}

module.exports = { resetTestEnvironment };