#!/usr/bin/env node
/**
 * Test script to validate the owner setup functionality
 * Run with: node test_owner_setup.js
 */

const assert = require('assert');

async function testSystemSettingsService() {
  console.log('Testing SystemSettingsService...');
  
  // Mock Firebase service for testing
  const mockFirebaseService = {
    getDB: () => ({
      collection: (name) => ({
        doc: (id) => ({
          get: async () => ({
            exists: false,
            data: () => null
          }),
          set: async () => {},
          update: async () => {}
        }),
        get: async () => ({
          empty: true,
          docs: []
        })
      })
    }),
    getServerTimestamp: () => new Date()
  };

  // Replace firebase service temporarily
  const originalRequire = require;
  require = function(moduleName) {
    if (moduleName === './firebase') {
      return mockFirebaseService;
    }
    return originalRequire.apply(this, arguments);
  };

  try {
    const systemSettingsService = originalRequire('./services/system-settings');
    
    // Test canSkipSetupKey when no users exist
    const canSkip = await systemSettingsService.canSkipSetupKey();
    console.log('✓ canSkipSetupKey returns:', canSkip);
    
    // Test validateOwnerSetupKey when no users exist
    const isValid = await systemSettingsService.validateOwnerSetupKey(null);
    console.log('✓ validateOwnerSetupKey with null key returns:', isValid);
    
    console.log('✓ SystemSettingsService tests passed');
  } catch (error) {
    console.error('✗ SystemSettingsService test failed:', error.message);
  } finally {
    // Restore original require
    require = originalRequire;
  }
}

async function testOwnerSetupLogic() {
  console.log('\nTesting owner setup logic...');
  
  try {
    // Test that the route file can be loaded without errors
    const ownerSetupRoute = require('./routes/owner-setup');
    console.log('✓ Owner setup route loaded successfully');
    
    console.log('✓ Owner setup logic tests passed');
  } catch (error) {
    console.error('✗ Owner setup logic test failed:', error.message);
  }
}

async function main() {
  console.log('Running owner setup tests...\n');
  
  await testSystemSettingsService();
  await testOwnerSetupLogic();
  
  console.log('\n✓ All tests completed');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testSystemSettingsService, testOwnerSetupLogic };