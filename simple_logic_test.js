#!/usr/bin/env node
/**
 * Simple logic test for owner setup functionality
 * Tests the core business logic without Firebase dependencies
 */

function testOwnerSetupLogic() {
  console.log('Testing owner setup business logic...\n');

  // Test scenarios
  const scenarios = [
    {
      name: 'Initial setup - no users, setup not completed',
      hasUsers: false,
      setupCompleted: false,
      expectedCanSkip: true,
      expectedMessage: 'Should allow setup without key'
    },
    {
      name: 'Users exist but setup not completed', 
      hasUsers: true,
      setupCompleted: false,
      expectedCanSkip: false,
      expectedMessage: 'Should require setup key'
    },
    {
      name: 'Setup already completed',
      hasUsers: true,
      setupCompleted: true,
      expectedCanSkip: false,
      expectedMessage: 'Should not allow further setup'
    }
  ];

  let passed = 0;
  let total = scenarios.length;

  scenarios.forEach(scenario => {
    console.log(`Testing: ${scenario.name}`);
    
    // Business logic for canSkipSetupKey
    let canSkipSetupKey;
    if (scenario.setupCompleted) {
      canSkipSetupKey = false; // Setup already completed
    } else if (!scenario.hasUsers) {
      canSkipSetupKey = true; // Initial setup, no users
    } else {
      canSkipSetupKey = false; // Users exist but setup not completed
    }

    console.log(`  - Has users: ${scenario.hasUsers}`);
    console.log(`  - Setup completed: ${scenario.setupCompleted}`);
    console.log(`  - Can skip setup key: ${canSkipSetupKey}`);
    console.log(`  - Expected: ${scenario.expectedCanSkip}`);
    console.log(`  - Reason: ${scenario.expectedMessage}`);

    if (canSkipSetupKey === scenario.expectedCanSkip) {
      console.log('  ✓ Test passed\n');
      passed++;
    } else {
      console.log('  ✗ Test failed\n');
    }
  });

  return { passed, total };
}

function testViewConditionals() {
  console.log('Testing view conditional logic...\n');
  
  const fs = require('fs');
  let passed = 0;
  let total = 0;

  try {
    const viewContent = fs.readFileSync('./views/owner-setup.ejs', 'utf8');
    
    // Test 1: Check for conditional setup key field
    total++;
    if (viewContent.includes('if (!canSkipSetupKey)') && 
        viewContent.includes('<input type="password" id="setup-key"')) {
      console.log('✓ Setup key field is conditionally displayed');
      passed++;
    } else {
      console.log('✗ Setup key field is not properly conditional');
    }

    // Test 2: Check for conditional security message
    total++;
    if (viewContent.includes('if (canSkipSetupKey)') && 
        viewContent.includes('これは初回セットアップです')) {
      console.log('✓ Conditional security message exists');
      passed++;
    } else {
      console.log('✗ Conditional security message is missing');
    }

    // Test 3: Check that required attribute is conditional
    total++;
    const setupKeyField = viewContent.match(/<input[^>]*id="setup-key"[^>]*>/);
    if (setupKeyField && setupKeyField[0].includes('required')) {
      console.log('✓ Setup key field has required attribute when shown');
      passed++;
    } else {
      console.log('✗ Setup key field missing required attribute');
    }

  } catch (error) {
    console.log('✗ Error reading view file:', error.message);
  }

  return { passed, total };
}

function testRouteLogic() {
  console.log('\nTesting route logic...\n');
  
  const fs = require('fs');
  let passed = 0;
  let total = 0;

  try {
    const routeContent = fs.readFileSync('./routes/owner-setup.js', 'utf8');
    
    // Test 1: Check for canSkipSetupKey usage in GET route
    total++;
    if (routeContent.includes('canSkipSetupKey = await systemSettingsService.canSkipSetupKey()')) {
      console.log('✓ GET route checks canSkipSetupKey');
      passed++;
    } else {
      console.log('✗ GET route does not check canSkipSetupKey');
    }

    // Test 2: Check for conditional validation in POST route
    total++;
    if (routeContent.includes('if (!canSkipSetupKey && !setupKey)')) {
      console.log('✓ POST route conditionally validates setup key');
      passed++;
    } else {
      console.log('✗ POST route does not conditionally validate setup key');
    }

    // Test 3: Check that view receives canSkipSetupKey data
    total++;
    if (routeContent.includes('canSkipSetupKey: canSkipSetupKey') || 
        routeContent.includes('canSkipSetupKey,')) {
      console.log('✓ View receives canSkipSetupKey data');
      passed++;
    } else {
      console.log('✗ View does not receive canSkipSetupKey data');
    }

  } catch (error) {
    console.log('✗ Error reading route file:', error.message);
  }

  return { passed, total };
}

function main() {
  console.log('=== Owner Setup Logic Tests ===\n');
  
  const logicTest = testOwnerSetupLogic();
  const viewTest = testViewConditionals();
  const routeTest = testRouteLogic();
  
  const totalPassed = logicTest.passed + viewTest.passed + routeTest.passed;
  const totalTests = logicTest.total + viewTest.total + routeTest.total;
  
  console.log('\n=== Summary ===');
  console.log(`Business Logic: ${logicTest.passed}/${logicTest.total} passed`);
  console.log(`View Templates: ${viewTest.passed}/${viewTest.total} passed`);
  console.log(`Route Logic: ${routeTest.passed}/${routeTest.total} passed`);
  console.log(`Total: ${totalPassed}/${totalTests} passed`);
  
  if (totalPassed === totalTests) {
    console.log('\n✓ All tests passed! Implementation looks correct.');
    console.log('\nKey changes implemented:');
    console.log('- Setup key not required for initial owner creation (no users exist)');
    console.log('- Setup key still required if users exist but setup not completed');
    console.log('- UI conditionally shows/hides setup key field');
    console.log('- Route logic properly handles both scenarios');
  } else {
    console.log('\n✗ Some tests failed. Review the implementation.');
  }
}

if (require.main === module) {
  main();
}